import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, Film, AlertCircle } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useContactStore } from '../store/contactStore';

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const shouldSync = searchParams.get('sync') === 'true';

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Check if we have OAuth parameters in the URL
        const urlParams = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        
        const hasOAuthParams = urlParams.has('code') || urlParams.has('error') || 
                               hashParams.has('access_token') || hashParams.has('type');
        
        if (hasOAuthParams) {
          // OAuth callback detected - Supabase already handled the linkIdentity
          console.log('✅ [AuthCallbackPage] OAuth callback detected');
          
          // Wait a moment for Supabase to process the OAuth callback
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Check if we should sync Outlook contacts (coming from Microsoft connection)
          if (shouldSync) {
            console.log('🔄 [AuthCallbackPage] Syncing Outlook contacts after Microsoft connection...');
            
            const { data: { session } } = await supabase.auth.getSession();
            
            if (session?.provider_token) {
              try {
                const { data } = await supabase.functions.invoke('sync-outlook-contacts', {
                  body: { providerToken: session.provider_token },
                  headers: {
                    Authorization: `Bearer ${session.access_token}`
                  }
                });

                if (data?.status === 'success') {
                  console.log(`✅ [AuthCallbackPage] Initial Outlook sync complete! Synced: ${data.syncedCount}, Deleted: ${data.deletedCount}, Skipped: ${data.skippedCount}`);
                  // Refresh contacts in the store
                  await useContactStore.getState().fetchContacts();
                } else {
                  console.warn('⚠️ [AuthCallbackPage] Sync returned non-success status:', data);
                }
              } catch (syncError) {
                console.error('⚠️ [AuthCallbackPage] Outlook sync failed (non-critical):', syncError);
                // Don't set error state - this is non-critical
              }
            } else {
              console.log('⚠️ [AuthCallbackPage] No provider token available for sync');
            }
          }
          
          console.log('✅ [AuthCallbackPage] Redirecting to settings...');
          navigate('/settings');
        } else {
          // No OAuth params - just a regular visit to /auth/callback
          console.log('🔄 [AuthCallbackPage] No OAuth parameters, redirecting to settings...');
          navigate('/settings');
        }
      } catch (err) {
        console.error('❌ [AuthCallbackPage] Error:', err);
        setError('An error occurred during authentication');
        setTimeout(() => navigate('/login'), 3000);
      }
    };

    handleCallback();
  }, [navigate, shouldSync]);

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-900 via-red-800 to-red-900 flex items-center justify-center">
        <div className="text-center">
          <div className="flex justify-center mb-6">
            <div className="p-4 bg-red-600 rounded-2xl">
              <AlertCircle className="h-12 w-12 text-white" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-white mb-4">Authentication Error</h2>
          <p className="text-red-200 mb-4">{error}</p>
          <p className="text-red-300 text-sm">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  // Loading state
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 flex items-center justify-center">
      <div className="text-center">
        <div className="flex justify-center mb-6">
          <div className="p-4 bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl animate-pulse">
            <Film className="h-12 w-12 text-white" />
          </div>
        </div>
        <div className="flex items-center justify-center space-x-3 mb-4">
          <Loader2 className="h-6 w-6 animate-spin text-white" />
          <h2 className="text-2xl font-bold text-white">Keep in Touch</h2>
        </div>
        <p className="text-blue-200">
          {shouldSync ? 'Syncing Outlook contacts...' : 'Processing authentication...'}
        </p>
      </div>
    </div>
  );
}