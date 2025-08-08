import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface MicrosoftContact {
  id: string;
  displayName: string;
  emailAddresses: Array<{
    address: string;
    name?: string;
  }>;
}

interface MicrosoftContactsResponse {
  value: MicrosoftContact[];
  '@odata.nextLink'?: string;
}

interface ProcessedContact {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  category: string;
  normalized_name: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('🔄 [Outlook Sync] Starting Outlook contacts synchronization...');

    // Parse request body to get the provider token
    const { providerToken } = await req.json();
    
    if (!providerToken) {
      throw new Error('Provider token was not included in the request.');
    }

    console.log('🔑 [Outlook Sync] Provider token received from frontend');

    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase environment variables are required');
    }

    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Step 1: Get the current authenticated user from the request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Authorization header is required');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      throw new Error('Failed to authenticate user: ' + (userError?.message || 'User not found'));
    }

    console.log(`👤 [Outlook Sync] Authenticated user: ${user.email}`);

    // Step 2: Fetch all contacts from Microsoft Graph API with pagination
    console.log('📡 [Outlook Sync] Fetching contacts from Microsoft Graph API...');
    
    const allMicrosoftContacts: MicrosoftContact[] = [];
    let nextUrl: string | undefined = 'https://graph.microsoft.com/v1.0/me/contacts?$select=displayName,emailAddresses&$top=1000';
    let pageCount = 0;

    while (nextUrl) {
      pageCount++;
      console.log(`📄 [Outlook Sync] Fetching page ${pageCount}: ${nextUrl}`);

      const response = await fetch(nextUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${providerToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ [Outlook Sync] Microsoft Graph API error (${response.status}):`, errorText);
        throw new Error(`Microsoft Graph API error: ${response.status} ${response.statusText}`);
      }

      const data: MicrosoftContactsResponse = await response.json();
      
      if (data.value && data.value.length > 0) {
        allMicrosoftContacts.push(...data.value);
        console.log(`✅ [Outlook Sync] Page ${pageCount}: ${data.value.length} contacts (${allMicrosoftContacts.length} total)`);
      }

      // Check for next page
      nextUrl = data['@odata.nextLink'];
      
      if (!nextUrl) {
        console.log(`🏁 [Outlook Sync] Pagination complete: ${allMicrosoftContacts.length} total contacts from ${pageCount} pages`);
      }
    }

    // Step 3: Process and map contacts to our database schema
    console.log('🔄 [Outlook Sync] Processing and mapping contacts...');
    
    const processedContacts: ProcessedContact[] = [];
    let skippedCount = 0;

    for (const msContact of allMicrosoftContacts) {
      // Skip contacts without email addresses
      if (!msContact.emailAddresses || msContact.emailAddresses.length === 0) {
        skippedCount++;
        continue;
      }

      // Skip contacts without a display name
      if (!msContact.displayName || msContact.displayName.trim() === '') {
        skippedCount++;
        continue;
      }

      // Split displayName into first_name and last_name
      const nameParts = msContact.displayName.trim().split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

      // Skip if we don't have at least a first name
      if (!firstName) {
        skippedCount++;
        continue;
      }

      // Get the primary email address
      const primaryEmail = msContact.emailAddresses[0].address;
      
      // Skip if email is invalid
      if (!primaryEmail || !primaryEmail.includes('@')) {
        skippedCount++;
        continue;
      }

      // Create normalized name for searching
      const normalizedName = `${firstName} ${lastName}`.toLowerCase().trim();

      // Create processed contact object
      const processedContact: ProcessedContact = {
        user_id: user.id,
        first_name: firstName,
        last_name: lastName,
        email: primaryEmail,
        category: 'OTHER', // Default category for Outlook contacts
        normalized_name: normalizedName
      };

      processedContacts.push(processedContact);
    }

    console.log(`✅ [Outlook Sync] Processing complete: ${processedContacts.length} valid contacts, ${skippedCount} skipped`);

    // Step 4: Sync with Supabase database
    console.log('💾 [Outlook Sync] Syncing contacts with database...');

    // Upsert contacts (add new ones, update existing ones)
    if (processedContacts.length > 0) {
      const { error: upsertError } = await supabase
        .from('contacts')
        .upsert(processedContacts, {
          onConflict: 'user_id,email', // Use composite key for conflict resolution
          ignoreDuplicates: false // Update existing records
        });

      if (upsertError) {
        console.error('❌ [Outlook Sync] Upsert error:', upsertError);
        throw new Error(`Failed to upsert contacts: ${upsertError.message}`);
      }

      console.log(`✅ [Outlook Sync] Successfully upserted ${processedContacts.length} contacts`);
    }

    // Step 5: Delete contacts that are no longer in Outlook
    console.log('🗑️ [Outlook Sync] Cleaning up contacts no longer in Outlook...');
    
    const currentEmails = processedContacts.map(contact => contact.email);
    let deletedCount = 0;

    if (currentEmails.length > 0) {
      // Delete contacts that belong to this user but are not in the current Outlook contacts
      const { error: deleteError, count } = await supabase
        .from('contacts')
        .delete({ count: 'exact' })
        .eq('user_id', user.id)
        .not('email', 'in', `(${currentEmails.map(email => `"${email}"`).join(',')})`);

      if (deleteError) {
        console.error('❌ [Outlook Sync] Delete error:', deleteError);
        throw new Error(`Failed to delete old contacts: ${deleteError.message}`);
      }

      deletedCount = count || 0;
      console.log(`✅ [Outlook Sync] Deleted ${deletedCount} contacts no longer in Outlook`);
    } else {
      // If no contacts from Outlook, delete all user's contacts
      const { error: deleteAllError, count } = await supabase
        .from('contacts')
        .delete({ count: 'exact' })
        .eq('user_id', user.id);

      if (deleteAllError) {
        console.error('❌ [Outlook Sync] Delete all error:', deleteAllError);
        throw new Error(`Failed to delete all contacts: ${deleteAllError.message}`);
      }

      deletedCount = count || 0;
      console.log(`✅ [Outlook Sync] Deleted all ${deletedCount} contacts (no Outlook contacts found)`);
    }

    // Step 6: Return success response
    const syncSummary = {
      status: 'success',
      message: 'Contacts synced successfully',
      syncedCount: processedContacts.length,
      deletedCount: deletedCount,
      skippedCount: skippedCount,
      totalProcessed: allMicrosoftContacts.length,
      pagesProcessed: pageCount
    };

    console.log('✅ [Outlook Sync] Synchronization complete:', syncSummary);

    return new Response(
      JSON.stringify(syncSummary),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('❌ [Outlook Sync] Error:', error);
    
    return new Response(
      JSON.stringify({
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        syncedCount: 0
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});