import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// CORS headers for browser requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

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

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('🔄 [Safe Outlook Sync] Starting source-aware sync...');
    
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get authenticated user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('❌ [Safe Outlook Sync] No Authorization header provided');
      return new Response(
        JSON.stringify({ status: 'error', message: 'Authorization header missing' }),
        { 
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      console.error('❌ [Safe Outlook Sync] Authentication failed:', userError);
      return new Response(
        JSON.stringify({ status: 'error', message: 'Authentication failed' }),
        { 
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Get provider token from request body
    const { providerToken } = await req.json();
    
    if (!providerToken) {
      console.error('❌ [Safe Outlook Sync] No provider token provided');
      return new Response(
        JSON.stringify({ status: 'error', message: 'No provider token provided' }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log(`✅ [Safe Outlook Sync] Authenticated user: ${user.email}`);

    // Fetch ALL contacts from Microsoft Graph API with pagination
    let allOutlookContacts: MicrosoftContact[] = [];
    let nextLink = 'https://graph.microsoft.com/v1.0/me/contacts?$select=displayName,emailAddresses&$top=1000';

    while (nextLink) {
      console.log(`📥 [Safe Outlook Sync] Fetching from: ${nextLink}`);
      
      const response = await fetch(nextLink, {
        headers: {
          'Authorization': `Bearer ${providerToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        console.error(`❌ [Safe Outlook Sync] Microsoft Graph API error: ${response.status}`);
        return new Response(
          JSON.stringify({ 
            status: 'error', 
            message: `Microsoft Graph API error: ${response.status} ${response.statusText}` 
          }),
          { 
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      const data: MicrosoftContactsResponse = await response.json();
      allOutlookContacts = allOutlookContacts.concat(data.value);
      nextLink = data['@odata.nextLink'] || '';
      
      console.log(`📄 [Safe Outlook Sync] Fetched ${data.value.length} contacts, total: ${allOutlookContacts.length}`);
    }

    console.log(`📊 [Safe Outlook Sync] Total Outlook contacts fetched: ${allOutlookContacts.length}`);

    // Process contacts for database - ONLY valid contacts with emails
    const processedContacts = allOutlookContacts
      .filter(contact => contact.emailAddresses && contact.emailAddresses.length > 0)
      .map(contact => {
        const email = contact.emailAddresses[0].address.toLowerCase();
        const displayName = contact.displayName || '';
        const nameParts = displayName.split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';

        return {
          user_id: user.id,
          first_name: firstName,
          last_name: lastName,
          email: email,
          category: 'OTHER', // Default category for Outlook contacts
          normalized_name: `${firstName} ${lastName}`.toLowerCase().trim(),
          source: 'outlook' // CRITICAL: Tag as Outlook source
        };
      });

    console.log(`🔄 [Safe Outlook Sync] Processing ${processedContacts.length} valid contacts...`);

    // SAFE OPERATION 1: Add/Update Outlook contacts
    let syncedCount = 0;
    if (processedContacts.length > 0) {
      const { data: upsertData, error: upsertError } = await supabase
        .from('contacts')
        .upsert(processedContacts, { 
          onConflict: 'user_id,email',
          count: 'exact'
        });

      if (upsertError) {
        console.error('❌ [Safe Outlook Sync] Upsert error:', upsertError);
        return new Response(
          JSON.stringify({ 
            status: 'error', 
            message: `Database upsert failed: ${upsertError.message}` 
          }),
          { 
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      syncedCount = processedContacts.length;
      console.log(`✅ [Safe Outlook Sync] Upserted ${syncedCount} Outlook contacts`);
    }

    // SAFE OPERATION 2: Delete ONLY stale Outlook contacts (NEVER touch CSV contacts)
    console.log('🗑️ [Safe Outlook Sync] Cleaning up removed Outlook contacts...');
    
    const currentOutlookEmails = processedContacts.map(contact => contact.email);
    let deletedCount = 0;

    if (currentOutlookEmails.length > 0) {
      // Delete Outlook contacts that are no longer in current Outlook
      const emailList = currentOutlookEmails.map(email => `"${email}"`).join(',');
      
      const { error: deleteError, count } = await supabase
        .from('contacts')
        .delete({ count: 'exact' })
        .eq('user_id', user.id)        // Must belong to current user
        .eq('source', 'outlook')       // AND must be from Outlook (NEVER delete CSV!)
        .not('email', 'in', `(${emailList})`); // AND not in current Outlook list

      if (deleteError) {
        console.error('❌ [Safe Outlook Sync] Delete error:', deleteError);
        // Don't fail entire sync for delete errors - just log it
      } else {
        deletedCount = count || 0;
        console.log(`✅ [Safe Outlook Sync] Safely deleted ${deletedCount} stale Outlook contacts`);
      }
    } else {
      // If no valid Outlook contacts found, remove all existing Outlook contacts
      // (but NEVER touch CSV contacts due to source filter)
      const { error: deleteError, count } = await supabase
        .from('contacts')
        .delete({ count: 'exact' })
        .eq('user_id', user.id)
        .eq('source', 'outlook');

      if (deleteError) {
        console.error('❌ [Safe Outlook Sync] Delete all Outlook error:', deleteError);
      } else {
        deletedCount = count || 0;
        console.log(`✅ [Safe Outlook Sync] Deleted all ${deletedCount} Outlook contacts (none found in current sync)`);
      }
    }

    const skippedCount = allOutlookContacts.length - processedContacts.length;

    // Return comprehensive results
    const result = {
      status: 'success',
      syncedCount: syncedCount,
      deletedCount: deletedCount,
      skippedCount: skippedCount,
      message: `Outlook sync complete. Added/updated ${syncedCount} contacts, removed ${deletedCount} stale contacts, skipped ${skippedCount} invalid contacts.`
    };

    console.log('🎉 [Safe Outlook Sync] Sync completed successfully:', result);
    
    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ [Safe Outlook Sync] Unexpected error:', error);
    return new Response(
      JSON.stringify({ 
        status: 'error', 
        message: error instanceof Error ? error.message : 'Unknown error occurred' 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});