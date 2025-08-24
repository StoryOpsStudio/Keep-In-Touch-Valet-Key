import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2, Film } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useContactStore } from '../store/contactStore';
import { useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';

interface AuthGuardProps {
  children: ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { user, loading, error } = useAuthStore();
  const { fetchContacts } = useContactStore();
  const isAuthenticated = !!user;
  const hasSyncedRef = useRef(false); // Track if we've already synced this session

  // Auto-load contacts and sync Outlook when user is authenticated
  useEffect(() => {
    if (user && !hasSyncedRef.current) {
      // Mark as synced immediately to prevent multiple syncs
      hasSyncedRef.current = true;
      
      // Load contacts first
      fetchContacts();
      
      // Then try to sync Outlook contacts silently
      syncOutlookContactsSilently();
    }
  }, [user, fetchContacts]);

  // Silent Outlook sync function
  const syncOutlookContactsSilently = async () => {
    try {
      console.log('🔄 [AuthGuard] Checking for Outlook sync on login...');

      // Check if user has Microsoft connected
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session?.provider_token) {
        console.log('⚠️ [AuthGuard] No Microsoft connection found - skipping sync');
        return;
      }

      console.log('🔄 [AuthGuard] Microsoft connected - syncing Outlook contacts...');

      const { data, error: syncError } = await supabase.functions.invoke('sync-outlook-contacts', {
        body: { providerToken: session.provider_token },
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (!syncError && data?.status === 'success') {
        console.log(`✅ [AuthGuard] Outlook sync complete! Synced: ${data.syncedCount}`);
        // Refresh contacts after successful sync
        fetchContacts();
      }
    } catch (err) {
      // Silent failure - don't interrupt the user experience
      console.log('⚠️ [AuthGuard] Silent Outlook sync failed (non-critical)');
    }
  };

  // FIXED: Show loading screen ONLY while loading is true
  if (loading) {
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
            Checking authentication...
          </p>
          {error && (
            <p className="text-red-300 text-sm mt-2">
              {error}
            </p>
          )}
        </div>
      </div>
    );
  }

  // FIXED: Once loading is false, either show content or redirect
  if (!isAuthenticated) {
    console.log('🔒 [AuthGuard] User not authenticated, redirecting to login');
    return <Navigate to="/login" replace />;
  }

  // FIXED: User is authenticated and loading is complete
  console.log('✅ [AuthGuard] User authenticated, rendering protected content');
  return <>{children}</>;
}