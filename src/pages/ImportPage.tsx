import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, Download, CheckCircle, AlertCircle, Eye, Trash2, Loader2 } from 'lucide-react';
import Papa from 'papaparse';
import { supabase, ContactInsert } from '../supabaseClient';
import { useContactStore } from '../store/contactStore';
import { useAuthStore } from '../store/authStore';

interface ImportResult {
  importedCount: number;
  duplicatesCount: number;
  errorsCount: number;
  errors?: string[];
}

interface ImportProgress {
  currentChunk: number;
  totalChunks: number;
  processedContacts: number;
  totalContacts: number;
  currentOperation: string;
}

const CATEGORIES = ['ACTOR', 'DIRECTOR', 'PRODUCER', 'AGENT', 'EXECUTIVE', 'WRITER', 'OTHER'];
const CHUNK_SIZE = 100; // Process contacts in chunks of 100

export function ImportPage() {
  const { user } = useAuthStore();
  const { contacts, isLoading, isRefreshing, error, fetchContacts, clearContacts } = useContactStore();
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [showContacts, setShowContacts] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);

  // Guard clause: Ensure user is authenticated
  if (!user) {
    return (
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
            Import Contacts
          </h1>
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-8">
            <AlertCircle className="h-12 w-12 text-yellow-600 dark:text-yellow-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-yellow-900 dark:text-yellow-300 mb-2">
              Authentication Required
            </h3>
            <p className="text-yellow-700 dark:text-yellow-400">
              Please log in to import contacts. Your contacts will be securely stored and isolated to your account.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Robust addContactsInChunks using upsert for full reliability
  const addContactsInChunks = async (newContacts: ContactInsert[]) => {
    if (!user) {
      throw new Error('User not authenticated');
    }

    const results = { success: 0, duplicates: 0, realErrors: [] as string[] };
    const totalChunks = Math.ceil(newContacts.length / CHUNK_SIZE);
    
    console.log(`📦 Starting user-isolated upsert upload: ${newContacts.length} contacts for user ${user.email} in ${totalChunks} chunks of ${CHUNK_SIZE}`);
    
    try {
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const startIndex = chunkIndex * CHUNK_SIZE;
        const endIndex = Math.min(startIndex + CHUNK_SIZE, newContacts.length);
        const chunk = newContacts.slice(startIndex, endIndex);
        
        // CRITICAL: Add user_id to each contact in the chunk
        const userContacts = chunk.map(contact => ({
          ...contact,
          user_id: user.id // Link each contact to the authenticated user
        }));
        
        // Update progress
        setProgress({
          currentChunk: chunkIndex + 1,
          totalChunks,
          processedContacts: startIndex,
          totalContacts: newContacts.length,
          currentOperation: `Processing chunk ${chunkIndex + 1} of ${totalChunks} (${chunk.length} contacts for user ${user.email})`
        });
        
        console.log(`📤 Upserting chunk ${chunkIndex + 1}/${totalChunks}: ${chunk.length} contacts (${startIndex + 1}-${endIndex}) for user ${user.email}`);
        
        try {
          // Use upsert with user-specific conflict resolution
          const { data, error, count } = await supabase
            .from('contacts')
            .upsert(userContacts, { 
              onConflict: 'email,user_id', // UPDATED: Include user_id in conflict resolution
              ignoreDuplicates: true 
            })
            .select('*', { count: 'exact' });

          if (error) {
            console.error(`❌ Chunk ${chunkIndex + 1} failed:`, error);
            // Add all contacts in this chunk to real errors
            chunk.forEach(contact => {
              results.realErrors.push(`Error adding ${contact.first_name} ${contact.last_name}: ${error.message}`);
            });
          } else {
            // Calculate successful inserts and duplicates
            const successfulInserts = count || 0;
            const duplicatesInChunk = chunk.length - successfulInserts;
            
            results.success += successfulInserts;
            results.duplicates += duplicatesInChunk;
            
            console.log(`✅ Chunk ${chunkIndex + 1} complete for user ${user.email}: ${successfulInserts} inserted, ${duplicatesInChunk} duplicates ignored`);
          }
        } catch (chunkError) {
          console.error(`❌ Chunk ${chunkIndex + 1} exception:`, chunkError);
          chunk.forEach(contact => {
            results.realErrors.push(`Error adding ${contact.first_name} ${contact.last_name}: ${chunkError instanceof Error ? chunkError.message : 'Unknown error'}`);
          });
        }
        
        // Small delay between chunks to be respectful to Supabase
        if (chunkIndex < totalChunks - 1) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }

      // Final progress update
      setProgress({
        currentChunk: totalChunks,
        totalChunks,
        processedContacts: newContacts.length,
        totalContacts: newContacts.length,
        currentOperation: 'Upload complete! Refreshing contact list...'
      });

      // Use Zustand store to refresh contacts globally
      console.log(`🔄 Refreshing contacts for user ${user.email} via Zustand store...`);
      await fetchContacts();
      console.log('✅ Contact refresh completed via Zustand store');
      
      console.log(`✅ User-isolated upsert upload complete for ${user.email}: ${results.success} successful, ${results.duplicates} duplicates ignored, ${results.realErrors.length} real errors`);
      return results;
    } catch (error) {
      console.error('❌ User-isolated upsert upload failed:', error);
      return { success: 0, duplicates: 0, realErrors: ['Failed to upload contacts using user-isolated upsert'] };
    } finally {
      setProgress(null);
    }
  };

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const formatCategory = (cat: string): string => {
    return cat.charAt(0) + cat.slice(1).toLowerCase();
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    // CRITICAL: Guard clause to ensure user is authenticated
    if (!user) {
      alert('Please log in to import contacts. Your contacts will be securely stored and isolated to your account.');
      return;
    }

    const file = acceptedFiles[0];
    if (!file) return;

    setUploading(true);
    setResult(null);
    setShowContacts(false);
    setProgress(null);

    try {
      const fileContent = await file.text();
      
      // Parse CSV
      const parseResult = Papa.parse(fileContent, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.trim()
      });

      let validationErrors = 0;
      const errors: string[] = [];
      const newContacts: ContactInsert[] = [];

      console.log(`🚀 Starting import of ${parseResult.data.length} rows for user ${user.email}`);

      // Process each row
      for (let i = 0; i < parseResult.data.length; i++) {
        const row = parseResult.data[i] as any;
        
        try {
          // Map CSV columns to our schema
          const firstName = row['First Name']?.trim() || row['firstName']?.trim();
          const lastName = row['Last Name']?.trim() || row['lastName']?.trim();
          const email = row['Email']?.trim() || row['E-mail Address']?.trim() || row['email']?.trim();
          const categoryStr = row['Category']?.trim() || row['category']?.trim();

          if (!firstName || !lastName) {
            errors.push(`Row ${i + 2}: Missing first or last name`);
            validationErrors++;
            continue;
          }

          // Validate email if provided
          if (email && !validateEmail(email)) {
            errors.push(`Row ${i + 2}: Invalid email format: ${email}`);
            validationErrors++;
            continue;
          }

          // Validate category
          let category = 'OTHER';
          if (categoryStr) {
            const upperCategory = categoryStr.toUpperCase();
            if (CATEGORIES.includes(upperCategory)) {
              category = upperCategory;
            } else {
              errors.push(`Row ${i + 2}: Invalid category "${categoryStr}", using "Other"`);
            }
          }

          // Create normalized name for searching
          const normalizedName = `${firstName} ${lastName}`.toLowerCase().trim();

          // Create contact for Supabase (user_id will be added in addContactsInChunks)
          const contact: ContactInsert = {
            first_name: firstName,
            last_name: lastName,
            email: email || undefined,
            category,
            normalized_name: normalizedName
            // NOTE: user_id will be added in addContactsInChunks function
          };

          newContacts.push(contact);

        } catch (error) {
          errors.push(`Row ${i + 2}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          validationErrors++;
        }
      }

      console.log(`📈 Parsed ${newContacts.length} valid contacts for user ${user.email}`);

      // Insert contacts into Supabase using robust user-isolated upsert approach
      const insertResult = await addContactsInChunks(newContacts);
      
      // Calculate final results
      const importedCount = insertResult.success;
      const duplicatesCount = insertResult.duplicates;
      const realErrorsCount = insertResult.realErrors.length;
      const totalErrorsCount = validationErrors + realErrorsCount;

      // Combine validation errors with real database errors
      const allErrors = [...errors, ...insertResult.realErrors];

      console.log(`📈 Import complete for user ${user.email}: ${importedCount} imported, ${duplicatesCount} duplicates ignored, ${totalErrorsCount} errors`);

      // Set result with clear separation of duplicates vs errors
      setResult({
        importedCount,
        duplicatesCount,
        errorsCount: totalErrorsCount,
        errors: allErrors.slice(0, 10) // Limit to first 10 errors
      });

    } catch (error) {
      console.error('Import failed:', error);
      setResult({
        importedCount: 0,
        duplicatesCount: 0,
        errorsCount: 1,
        errors: [error instanceof Error ? error.message : 'Failed to parse CSV file']
      });
    } finally {
      setUploading(false);
      setProgress(null);
    }
  }, [fetchContacts, user]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv']
    },
    maxFiles: 1,
    disabled: uploading || isLoading || !user
  });

  const downloadTemplate = () => {
    const template = `First Name,Last Name,Email,Category
John,Doe,john.doe@example.com,Producer
Jane,Smith,jane.smith@example.com,Actor
Mike,Johnson,mike.johnson@example.com,Director
Sarah,Wilson,sarah.wilson@example.com,Agent
Tom,Brown,tom.brown@example.com,Executive
Lisa,Davis,lisa.davis@example.com,Writer
Alex,Miller,alex.miller@example.com,Other`;

    const blob = new Blob([template], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'contact_template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const handleClearContacts = async () => {
    if (window.confirm('Are you sure you want to clear all your contacts? This cannot be undone.')) {
      await clearContacts();
      setResult(null);
      setShowContacts(false);
      console.log(`🗑️ All contacts cleared for user ${user.email}`);
    }
  };

  // Convert Supabase contacts to legacy format for display
  const legacyContacts = contacts.map(contact => ({
    id: contact.id.toString(),
    firstName: contact.first_name,
    lastName: contact.last_name,
    email: contact.email,
    category: contact.category || 'OTHER',
    createdAt: contact.created_at
  }));

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
          Import Contacts
        </h1>
        <p className="text-xl text-gray-600 dark:text-gray-300">
          Upload your CSV file to import contacts into your personal database
        </p>
        <div className="mt-2 text-sm text-blue-600 dark:text-blue-400">
          👤 Logged in as: <strong>{user.email}</strong>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6">
          <div className="flex items-center space-x-2">
            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
            <span className="font-medium text-red-900 dark:text-red-300">Database Error:</span>
            <span className="text-red-700 dark:text-red-400">{error}</span>
          </div>
        </div>
      )}

      {/* Current Status */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Your Contacts
            </h3>
            {isLoading ? (
              <div className="flex items-center space-x-2">
                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                <span className="text-gray-600 dark:text-gray-300">Loading contacts...</span>
              </div>
            ) : isRefreshing ? (
              <div className="flex items-center space-x-2">
                <Loader2 className="h-4 w-4 animate-spin text-green-600" />
                <span className="text-gray-600 dark:text-gray-300">Updating contact count...</span>
              </div>
            ) : (
              <p className="text-gray-600 dark:text-gray-300">
                You have <strong>{contacts.length}</strong> contacts in your personal database
              </p>
            )}
          </div>
          {contacts.length > 0 && !isLoading && !isRefreshing && (
            <button
              onClick={handleClearContacts}
              disabled={isLoading || uploading || isRefreshing}
              className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              <span>Clear All Contacts</span>
            </button>
          )}
        </div>
      </div>

      {/* Progress Display */}
      {progress && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6">
          <div className="flex items-center space-x-3 mb-4">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
            <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-300">
              Processing with User-Isolated Upsert
            </h3>
          </div>
          
          <div className="space-y-3">
            <div className="flex justify-between text-sm text-blue-700 dark:text-blue-300">
              <span>{progress.currentOperation}</span>
              <span>{progress.processedContacts} / {progress.totalContacts} contacts</span>
            </div>
            
            {/* Progress Bar */}
            <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-3">
              <div 
                className="bg-blue-600 h-3 rounded-full transition-all duration-300 ease-out"
                style={{ 
                  width: `${(progress.processedContacts / progress.totalContacts) * 100}%` 
                }}
              ></div>
            </div>
            
            <div className="flex justify-between text-xs text-blue-600 dark:text-blue-400">
              <span>Chunk {progress.currentChunk} of {progress.totalChunks}</span>
              <span>{Math.round((progress.processedContacts / progress.totalContacts) * 100)}% complete</span>
            </div>
          </div>
        </div>
      )}

      {/* Template Download */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6">
        <div className="flex items-start space-x-4">
          <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-full">
            <Download className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-2">
              Need a template?
            </h3>
            <p className="text-blue-700 dark:text-blue-300 mb-4">
              Download our CSV template to see the correct format for importing your contacts.
            </p>
            <button
              onClick={downloadTemplate}
              className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Download className="h-4 w-4" />
              <span>Download Template</span>
            </button>
          </div>
        </div>
      </div>

      {/* Upload Area */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer ${
            isDragActive
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500'
          } ${uploading || isLoading || !user ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <input {...getInputProps()} />
          
          <div className="space-y-4">
            <div className="flex justify-center">
              {uploading ? (
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              ) : (
                <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded-full">
                  <Upload className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                </div>
              )}
            </div>
            
            {uploading ? (
              <div>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">
                  Processing CSV file...
                </p>
                <p className="text-gray-600 dark:text-gray-300">
                  {progress ? progress.currentOperation : `Using user-isolated upsert for ${user.email}`}
                </p>
              </div>
            ) : isDragActive ? (
              <div>
                <p className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                  Drop your CSV file here
                </p>
              </div>
            ) : (
              <div>
                <p className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  Drag and drop your CSV file here
                </p>
                <p className="text-gray-600 dark:text-gray-300 mb-4">
                  or click to browse and select a file
                </p>
                <div className="flex items-center justify-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
                  <FileText className="h-4 w-4" />
                  <span>Supports CSV files up to 10MB • Secure user-isolated storage</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Import Results */}
      {result && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
          <div className="flex items-center space-x-3 mb-6">
            <div className="p-2 bg-green-100 dark:bg-green-900 rounded-full">
              <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
              Import Complete for {user.email}
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {result.importedCount}
              </div>
              <div className="text-green-700 dark:text-green-300 font-medium">
                Contacts Imported
              </div>
            </div>

            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                {result.duplicatesCount}
              </div>
              <div className="text-yellow-700 dark:text-yellow-300 font-medium">
                Duplicates Ignored
              </div>
            </div>

            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                {result.errorsCount}
              </div>
              <div className="text-red-700 dark:text-red-300 font-medium">
                Real Errors
              </div>
            </div>
          </div>

          {/* Helpful message for zero imports with high duplicates */}
          {result.importedCount === 0 && result.duplicatesCount > 0 && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
              <div className="flex items-center space-x-2">
                <CheckCircle className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <p className="text-blue-700 dark:text-blue-300 font-medium">
                  All contacts from this file were already in your database.
                </p>
              </div>
              <p className="text-blue-600 dark:text-blue-400 text-sm mt-1">
                The system worked correctly by ignoring the duplicates and preserving your existing data.
              </p>
            </div>
          )}

          {result.errors && result.errors.length > 0 && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
              <div className="flex items-center space-x-2 mb-3">
                <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                <h4 className="font-medium text-red-900 dark:text-red-300">
                  Import Issues
                </h4>
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {result.errors.map((error, index) => (
                  <div key={index} className="text-sm text-red-700 dark:text-red-300">
                    {error}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-center space-x-4">
            <button
              onClick={() => setResult(null)}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Import Another File
            </button>
            {contacts.length > 0 && (
              <button
                onClick={() => setShowContacts(!showContacts)}
                className="flex items-center space-x-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
              >
                <Eye className="h-4 w-4" />
                <span>{showContacts ? 'Hide' : 'View'} Contacts ({contacts.length})</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Contacts Table */}
      {showContacts && legacyContacts.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
              Your Imported Contacts ({legacyContacts.length})
            </h3>
            <button
              onClick={handleClearContacts}
              disabled={isLoading || uploading}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium disabled:opacity-50"
            >
              Clear All Contacts
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 font-medium text-gray-900 dark:text-white">Name</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-900 dark:text-white">Email</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-900 dark:text-white">Category</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-900 dark:text-white">Added</th>
                </tr>
              </thead>
              <tbody>
                {legacyContacts.map((contact) => (
                  <tr key={contact.id} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="py-3 px-4">
                      <div className="font-medium text-gray-900 dark:text-white">
                        {contact.firstName} {contact.lastName}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {contact.email ? (
                        <span className="text-gray-600 dark:text-gray-300">{contact.email}</span>
                      ) : (
                        <span className="text-gray-400 italic">No email</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        contact.category === 'ACTOR' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' :
                        contact.category === 'DIRECTOR' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300' :
                        contact.category === 'PRODUCER' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' :
                        contact.category === 'AGENT' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' :
                        contact.category === 'EXECUTIVE' ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' :
                        contact.category === 'WRITER' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300' :
                        'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                      }`}>
                        {formatCategory(contact.category)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-500 dark:text-gray-400">
                      {new Date(contact.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Import Instructions */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
        <div className="flex items-center space-x-3 mb-6">
          <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-full">
            <FileText className="h-6 w-6 text-gray-600 dark:text-gray-400" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
            Secure User-Isolated Storage
          </h3>
        </div>

        <div className="space-y-4 text-gray-600 dark:text-gray-300">
          <div>
            <h4 className="font-medium text-gray-900 dark:text-white mb-2">🔒 Your Data Security:</h4>
            <ul className="list-disc list-inside space-y-1">
              <li><strong>User Isolation:</strong> Your contacts are completely private and isolated from other users</li>
              <li><strong>Row Level Security:</strong> Database-level protection ensures you can only access your own data</li>
              <li><strong>Authenticated Access:</strong> All operations require valid user authentication</li>
              <li><strong>Secure Processing:</strong> Chunked uploads with robust error handling and duplicate prevention</li>
              <li><strong>User-Specific Conflicts:</strong> Duplicate detection considers both email AND user ID</li>
            </ul>
          </div>

          <div>
            <h4 className="font-medium text-gray-900 dark:text-white mb-2">📊 CSV Format Requirements:</h4>
            <ul className="list-disc list-inside space-y-1">
              <li>Required columns: <strong>First Name</strong>, <strong>Last Name</strong></li>
              <li>Optional columns: <strong>Email</strong>, <strong>Category</strong></li>
              <li>Categories: Actor, Director, Producer, Agent, Executive, Writer, Other</li>
              <li>Email addresses must be in valid format (e.g., user@domain.com)</li>
              <li><strong>Large File Support:</strong> Files with 1000+ contacts are automatically chunked</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}