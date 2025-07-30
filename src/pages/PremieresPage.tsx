import { useState, useEffect } from 'react';
import { Calendar, Star, Users, Mail, RefreshCw, Sparkles, Film, Tv, AlertTriangle, Loader2, CheckCircle } from 'lucide-react';
import { useLegacyContacts } from '../store/contactStore';
import { usePremiereStore } from '../store/premiereStore';
import { EmailDraftModal } from '../components/EmailDraftModal';
import { supabase } from '../supabaseClient';
import { useAuthStore } from '../store/authStore';

interface PremiereMatch {
  id: string;
  contactId: number;
  contactName: string;
  contactEmail?: string;
  contactCategory: string;
  premiere: {
    id: number;
    title: string;
    type: 'movie' | 'tv';
    releaseDate: string;
    overview: string;
    posterPath: string | null;
  };
  role: string;
  character?: string;
  job?: string;
  department?: string;
  matchScore: number;
  foundAt: string;
}

interface EdgeFunctionResponse {
  success: boolean;
  matches: PremiereMatch[];
  nextPage: number | null;
  pageInfo?: {
    currentPage: number;
    totalPages: number;
    moviesOnPage: number;
    tvShowsOnPage: number;
    premieresProcessed: number;
    matchesFound: number;
  };
  error?: string;
}

// Convert PremiereMatch to format compatible with EmailDraftModal
interface PremiereMatchForEmail {
  id: string;
  contactName: string;
  contactEmail?: string;
  premiere: {
    title: string;
    type: 'movie' | 'tv';
    releaseDate: string;
  };
  role: string;
}

export function PremieresPage() {
  const { user } = useAuthStore(); // Get authenticated user
  const { contacts, isLoading: contactsLoading } = useLegacyContacts();
  
  // Use Zustand store for persistent state management
  const {
    matches,
    isProcessing,
    error,
    addMatch,
    prepareForNewCheck,
    clearMatches
  } = usePremiereStore();
  
  // Local state for processing progress
  const [currentPage, setCurrentPage] = useState<number | null>(null);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [processedPages, setProcessedPages] = useState(0);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  
  // Email drafting modal state
  const [draftingMatch, setDraftingMatch] = useState<PremiereMatchForEmail | null>(null);

  const processPage = async (page: number): Promise<EdgeFunctionResponse> => {
    console.log(`🚀 Processing page ${page} for user ${user?.email}...`);
    
    // CRITICAL: Pass user ID in the request body
    const { data, error: functionError } = await supabase.functions.invoke('get-premiere-matches', {
      method: 'POST',
      body: { 
        page,
        userId: user?.id // Pass authenticated user ID
      }
    });

    if (functionError) {
      throw new Error(`Edge Function error: ${functionError.message}`);
    }

    const response: EdgeFunctionResponse = data;

    if (!response.success) {
      throw new Error(response.error || 'Unknown error occurred');
    }

    return response;
  };

  // UPDATED: Consolidated state management - no more race conditions
  const checkForPremieres = async () => {
    // Step 1: Prepare the store for a new run. This clears old matches
    // and sets isProcessing = true.
    prepareForNewCheck();
    console.log('🔄 [PremieresPage] State preparation completed - starting fresh premiere check');

    // Step 2: Guard clauses to ensure we can proceed.
    if (!user) {
      console.log('⚠️ [PremieresPage] User not authenticated, cannot check premieres');
      usePremiereStore.setState({ isProcessing: false }); // Reset state if we exit early
      return;
    }

    if (contactsLoading || contacts.length === 0) {
      console.log('⚠️ [PremieresPage] No contacts available for processing');
      usePremiereStore.setState({ isProcessing: false }); // Reset state if we exit early
      return;
    }

    // Step 3: The main processing logic, wrapped correctly.
    try {
      let page = 1;
      let nextPage: number | null = page;
      let totalPagesFound = 0;

      // THIS IS THE CRITICAL LOGIC THAT WAS DELETED AND IS NOW RESTORED
      while (nextPage !== null) {
        setCurrentPage(page);
        const response = await processPage(page);

        if (response.pageInfo) {
          if (totalPagesFound === 0) {
            totalPagesFound = response.pageInfo.totalPages;
            setTotalPages(response.pageInfo.totalPages);
          }
          setProcessedPages(prev => prev + 1);
        }
        
        response.matches.forEach(addMatch);
        nextPage = response.nextPage;
        page++;
      }
      
      console.log(`✅ [PremieresPage] All pages processed for user ${user.email}`);
      setLastChecked(new Date());

    } catch (err) {
      console.error(`❌ [PremieresPage] An error occurred during premiere check:`, err);
      // Set the error in the global store so the UI can display it
      usePremiereStore.setState({ error: err instanceof Error ? err.message : 'An unknown error occurred' });
    } finally {
      // CRITICAL FIX: This block is guaranteed to run,
      // whether the process succeeded or failed.
      console.log("🧹 [PremieresPage] Premiere check finished. Resetting processing state.");
      usePremiereStore.setState({ isProcessing: false, loading: false });
      setCurrentPage(null); // Also reset local component state
    }
  };

  const handleEmailContact = (match: PremiereMatch) => {
    const emailMatch: PremiereMatchForEmail = {
      id: match.id,
      contactName: match.contactName,
      contactEmail: match.contactEmail,
      premiere: {
        title: match.premiere.title,
        type: match.premiere.type,
        releaseDate: match.premiere.releaseDate
      },
      role: match.role
    };
    
    setDraftingMatch(emailMatch);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const isNewPremiere = (releaseDate: string) => {
    const release = new Date(releaseDate);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return release >= yesterday;
  };

  const getCurrentWeekRange = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    
    const monday = new Date(today);
    monday.setDate(today.getDate() - daysFromMonday);
    
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    
    return `${monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  };

  const getPosterUrl = (posterPath: string | null): string | null => {
    if (!posterPath) return null;
    return `https://image.tmdb.org/t/p/w300${posterPath}`;
  };

  // Guard clause: Ensure user is authenticated
  if (!user) {
    return (
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
            This Week's Premieres
          </h1>
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-8">
            <AlertTriangle className="h-12 w-12 text-yellow-600 dark:text-yellow-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-yellow-900 dark:text-yellow-300 mb-2">
              Authentication Required
            </h3>
            <p className="text-yellow-700 dark:text-yellow-400">
              Please log in to check for premieres. Your data is securely isolated to your account.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center">
        <div className="flex items-center justify-center space-x-3 mb-4">
          <div className="p-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl">
            <Sparkles className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
            This Week's Premieres
          </h1>
        </div>
        <p className="text-xl text-gray-600 dark:text-gray-300 mb-4">
          Discover new movies and TV shows premiering {getCurrentWeekRange()}
        </p>
        
        <div className="flex items-center justify-center space-x-6 text-sm text-gray-600 dark:text-gray-300">
          <div className="flex items-center space-x-2">
            <Users className="h-4 w-4" />
            <span>{contacts.length} contacts imported</span>
          </div>
          <div className="flex items-center space-x-2">
            <Star className="h-4 w-4" />
            <span>{matches.length} matches found</span>
          </div>
          {totalPages && (
            <div className="flex items-center space-x-2">
              <Film className="h-4 w-4" />
              <span>{totalPages} pages total</span>
            </div>
          )}
          <div className="flex items-center space-x-2">
            <span>👤</span>
            <span className="text-blue-600 dark:text-blue-400">
              User: {user.email}
            </span>
          </div>
        </div>

        {/* Last Checked Info */}
        {lastChecked && (
          <div className="mt-4 text-sm text-gray-500 dark:text-gray-400">
            Last checked: {lastChecked.toLocaleString()}
          </div>
        )}
      </div>

      {/* Control Panel */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Premiere Monitoring
          </h3>
          <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-300">
            <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900 rounded text-xs">
              User-Isolated Processing
            </span>
          </div>
        </div>

        <div className="flex items-center justify-center">
          <button
            onClick={checkForPremieres}
            disabled={isProcessing || contactsLoading || contacts.length === 0 || !user}
            className="flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Processing Premieres...</span>
              </>
            ) : (
              <>
                <RefreshCw className="h-5 w-5" />
                <span>Check for Premieres</span>
              </>
            )}
          </button>
        </div>

        {/* Progress Display */}
        {isProcessing && currentPage && totalPages && (
          <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-blue-900 dark:text-blue-300">
                Processing page {currentPage} of {totalPages} for user {user.email}
              </span>
              <span className="text-sm text-blue-700 dark:text-blue-400">
                {matches.length} matches found so far
              </span>
            </div>
            
            <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(processedPages / totalPages) * 100}%` }}
              ></div>
            </div>
            
            <div className="flex justify-between text-xs text-blue-600 dark:text-blue-400 mt-1">
              <span>Pages processed: {processedPages}</span>
              <span>{Math.round((processedPages / totalPages) * 100)}% complete</span>
            </div>
          </div>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-xl">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="h-5 w-5" />
            <span className="font-medium">Error:</span>
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Loading State */}
      {isProcessing && !currentPage && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-8 text-center">
          <div className="flex items-center justify-center space-x-3 mb-4">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-300">
              Starting Premiere Check for {user.email}
            </h3>
          </div>
          <p className="text-blue-700 dark:text-blue-300">
            Initializing user-isolated processing...
          </p>
        </div>
      )}

      {/* Contact Matches Section */}
      {matches.length > 0 && (
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-800 rounded-2xl p-8">
          <div className="flex items-center space-x-3 mb-6">
            <div className="p-3 bg-green-500 rounded-xl">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-green-900 dark:text-green-300">
                🎉 Your Contacts' Premieres!
              </h2>
              <p className="text-green-700 dark:text-green-400">
                {matches.length} of your contacts have premieres this week
                {isProcessing && ` (still processing...)`}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {matches.map((match) => (
              <div key={match.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 hover:shadow-xl transition-all duration-200">
                <div className="flex space-x-4">
                  <div className="flex-shrink-0">
                    {match.premiere.posterPath ? (
                      <img
                        src={getPosterUrl(match.premiere.posterPath)}
                        alt={match.premiere.title}
                        className="w-20 h-30 object-cover rounded-lg"
                      />
                    ) : (
                      <div className="w-20 h-30 bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center">
                        {match.premiere.type === 'movie' ? (
                          <Film className="h-8 w-8 text-gray-400" />
                        ) : (
                          <Tv className="h-8 w-8 text-gray-400" />
                        )}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
                          {match.contactName}
                        </h3>
                        <p className="text-sm text-blue-600 dark:text-blue-400 font-medium mb-2">
                          {match.role}
                          <span className="text-xs text-gray-500 ml-2">
                            ({match.matchScore}% match)
                          </span>
                        </p>
                      </div>
                      {isNewPremiere(match.premiere.releaseDate) && (
                        <span className="px-2 py-1 bg-red-500 text-white text-xs font-bold rounded-full">
                          NEW!
                        </span>
                      )}
                    </div>
                    
                    <div className="space-y-2">
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-white">
                          {match.premiere.title}
                        </p>
                        <p className="text-sm text-gray-600 dark:text-gray-300">
                          {formatDate(match.premiere.releaseDate)}
                        </p>
                      </div>
                      
                      <div className="flex items-center space-x-2 pt-2">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          match.premiere.type === 'movie' 
                            ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300'
                            : 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                        }`}>
                          {match.premiere.type === 'movie' ? 'Movie' : 'TV Show'}
                        </span>
                        
                        <button
                          onClick={() => handleEmailContact(match)}
                          className="flex items-center space-x-1 px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                        >
                          <Mail className="h-3 w-3" />
                          <span>Email</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Processing Status */}
          {isProcessing && (
            <div className="mt-6 text-center">
              <div className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                <span className="text-blue-700 dark:text-blue-300 font-medium">
                  Still processing... More matches may appear
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* No Contacts Message */}
      {contacts.length === 0 && !contactsLoading && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-8 text-center">
          <Users className="h-12 w-12 text-yellow-600 dark:text-yellow-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-yellow-900 dark:text-yellow-300 mb-2">
            No Contacts to Match
          </h3>
          <p className="text-yellow-700 dark:text-yellow-400 mb-4">
            Import your contacts first to see if any of them have premieres this week!
          </p>
          <a
            href="/import"
            className="inline-flex items-center space-x-2 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors"
          >
            <span>Import Contacts</span>
          </a>
        </div>
      )}

      {/* No Matches Message */}
      {!isProcessing && matches.length === 0 && contacts.length > 0 && lastChecked && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-12 text-center">
          <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            No Matches Found
          </h3>
          <p className="text-gray-600 dark:text-gray-300">
            None of your contacts have premieres this week. Check back later for new releases!
          </p>
        </div>
      )}

      {/* Email Draft Modal */}
      {draftingMatch && (
        <EmailDraftModal
          match={draftingMatch}
          onClose={() => setDraftingMatch(null)}
        />
      )}
    </div>
  );
}