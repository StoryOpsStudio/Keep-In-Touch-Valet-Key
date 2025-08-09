import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// CORS headers for browser requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log('🗑️ [Clear Contacts] Starting user contact clearing...');
    
    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get authenticated user from request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('❌ [Clear Contacts] No Authorization header provided');
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
      console.error('❌ [Clear Contacts] Authentication failed:', userError);
      return new Response(
        JSON.stringify({ status: 'error', message: 'Authentication failed' }),
        { 
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log(`✅ [Clear Contacts] Authenticated user: ${user.email}`);

    // Delete ALL contacts for this user (service role can bypass RLS)
    const { error: deleteError, count } = await supabase
      .from('contacts')
      .delete({ count: 'exact' })
      .eq('user_id', user.id);

    if (deleteError) {
      console.error('❌ [Clear Contacts] Delete error:', deleteError);
      return new Response(
        JSON.stringify({ 
          status: 'error', 
          message: `Failed to clear contacts: ${deleteError.message}` 
        }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const deletedCount = count || 0;
    console.log(`✅ [Clear Contacts] Successfully deleted ${deletedCount} contacts for user ${user.email}`);

    // Return success response
    const result = {
      status: 'success',
      deletedCount: deletedCount,
      message: `Successfully cleared ${deletedCount} contacts`
    };

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ [Clear Contacts] Unexpected error:', error);
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