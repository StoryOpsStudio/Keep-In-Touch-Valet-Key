import { useState, useEffect } from 'react';
import { Settings, Mail, Shield, Loader2, AlertCircle, X } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../supabaseClient';

interface Profile {
  id: string;
  email: string;
  full_name?: string;
  voice_profile: string;
  created_at: string;
}

export function SettingsPage() {
  const { user } = useAuthStore();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionLoading, setConnectionLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  // Fetch user profile on component mount
  useEffect(() => {
    if (user) {
      fetchProfile();
    }
  }, [user]);

  // ONE-TIME refresh on component mount only
  useEffect(() => {
    refreshUserSession();
  }, []); // Empty dependency array = runs only once

  // Force refresh user session to get latest identities
  const refreshUserSession = async () => {
    try {
      console.log('🔄 [SettingsPage] Refreshing user session...');
      
      // Force Supabase to fetch fresh user data
      const { data: { user: freshUser }, error } = await supabase.auth.getUser();
      
      if (error) {
        console.error('Error refreshing user session:', error);
        return;
      }
      
      if (freshUser) {
        console.log('✅ [SettingsPage] Fresh user data loaded, identities:', freshUser.identities?.length || 0);
        useAuthStore.getState().setAuthState({ user: freshUser });
      }
    } catch (err) {
      console.error('Failed to refresh user session:', err);
    }
  };

  const fetchProfile = async () => {
    if (!user) return;

    try {
      setLoading(true);
      setError(null);

      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileError) {
        throw profileError;
      }

      setProfile(data);
    } catch (err) {
      console.error('Error fetching profile:', err);
      setError(err instanceof Error ? err.message : 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  // Check if Microsoft account is connected using built-in identities
  const getMicrosoftIdentity = () => {
    if (!user?.identities) return null;
    return user.identities.find(identity => identity.provider === 'azure');
  };

  const isMicrosoftConnected = !!getMicrosoftIdentity();

  // Microsoft OAuth connection handler using linkIdentity
  const handleMicrosoftConnect = async () => {
    try {
      setConnectionLoading(true);
      setError(null);

      console.log('🔗 [SettingsPage] Linking Microsoft identity...');
      
      const { error } = await supabase.auth.linkIdentity({
        provider: 'azure',
        options: {
          scopes: 'Contacts.Read Mail.Read',
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        console.error('❌ [SettingsPage] Error linking Microsoft identity:', error);
        throw new Error(`Failed to connect Microsoft: ${error.message}`);
      }

      console.log('✅ [SettingsPage] Microsoft identity linking initiated');
      // The user will be redirected to Microsoft OAuth, then back to your app
      
    } catch (err) {
      console.error('Microsoft connection error:', err);
      setError(err instanceof Error ? err.message : 'Failed to connect Microsoft account');
    } finally {
      setConnectionLoading(false);
    }
  };

  // Microsoft OAuth disconnection handler using unlinkIdentity
  const handleMicrosoftDisconnect = async () => {
    try {
      setConnectionLoading(true);
      setError(null);

      const microsoftIdentity = getMicrosoftIdentity();
      if (!microsoftIdentity) {
        throw new Error('No Microsoft identity found to disconnect. Please refresh the page and try again.');
      }

      console.log('🔓 [SettingsPage] Unlinking Microsoft identity...', microsoftIdentity.id);

      const { error } = await supabase.auth.unlinkIdentity(microsoftIdentity);

      if (error) {
        console.error('❌ [SettingsPage] Error unlinking Microsoft identity:', error);
        throw new Error(`Failed to disconnect Microsoft: ${error.message}`);
      }

      console.log('✅ [SettingsPage] Microsoft identity unlinked successfully');
      
      // Refresh session to get updated identities
      await refreshUserSession();

    } catch (err) {
      console.error('Microsoft disconnection error:', err);
      setError(err instanceof Error ? err.message : 'Failed to disconnect Microsoft account');
    } finally {
      setConnectionLoading(false);
    }
  };

  // Test Outlook contacts sync
  const handleTestSync = async () => {
    try {
      setSyncLoading(true);
      setSyncMessage(null);
      setError(null);

      console.log('🔄 [SettingsPage] Testing Outlook contacts sync...');

console.log('🔄 [SettingsPage] Forcing session refresh to get latest tokens...');
const { data: { session }, error: sessionError } = await supabase.auth.getSession();

if (sessionError || !session) {
  throw new Error('Could not retrieve user session. Please log in again.');
}

const providerToken = session.provider_token;

if (!providerToken) {
  // This is a more specific error now. It means the token is truly missing from the session itself.
  throw new Error('Provider token is missing from the session. Please try disconnecting and reconnecting your Microsoft account.');
}

console.log('🔑 [SettingsPage] Microsoft provider token retrieved successfully from fresh session');

      const { data, error: syncError } = await supabase.functions.invoke('sync-outlook-contacts', {
        body: { providerToken }
      });

      if (syncError) {
        console.error('❌ [SettingsPage] Sync error:', syncError);
        throw new Error(`Sync failed: ${syncError.message}`);
      }

      if (data.status === 'success') {
        const message = `Sync complete! Synced: ${data.syncedCount}, Deleted: ${data.deletedCount}, Skipped: ${data.skippedCount}`;
        setSyncMessage(message);
        console.log('✅ [SettingsPage] Sync successful:', data);
      } else {
        throw new Error(data.message || 'Sync failed with unknown error');
      }

    } catch (err) {
      console.error('Outlook sync test error:', err);
      setError(err instanceof Error ? err.message : 'Failed to sync Outlook contacts');
    } finally {
      setSyncLoading(false);
    }
  };
  if (!user) {
    return (
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
            Settings & Profile
          </h1>
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-8">
            <AlertCircle className="h-12 w-12 text-yellow-600 dark:text-yellow-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-yellow-900 dark:text-yellow-300 mb-2">
              Authentication Required
            </h3>
            <p className="text-yellow-700 dark:text-yellow-400">
              Please log in to access your settings and profile.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center">
        <div className="flex items-center justify-center space-x-3 mb-4">
          <div className="p-3 bg-gradient-to-r from-blue-500 to-purple-500 rounded-xl">
            <Settings className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
            Settings & Profile
          </h1>
        </div>
        <p className="text-xl text-gray-600 dark:text-gray-300">
          Manage your account connections and personalize your experience
        </p>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 text-center">
          <div className="flex items-center justify-center space-x-3 mb-4">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            <span className="text-gray-600 dark:text-gray-300">Loading your profile...</span>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6">
          <div className="flex items-center space-x-2">
            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
            <span className="font-medium text-red-900 dark:text-red-300">Error:</span>
            <span className="text-red-700 dark:text-red-400">{error}</span>
          </div>
        </div>
      )}

      {/* Sync Success Message */}
      {syncMessage && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-6">
          <div className="flex items-center space-x-2">
            <AlertCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
            <span className="font-medium text-green-900 dark:text-green-300">Success:</span>
            <span className="text-green-700 dark:text-green-400">{syncMessage}</span>
          </div>
        </div>
      )}
      {/* Account Connections Section */}
      {!loading && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
          <div className="flex items-center space-x-3 mb-6">
            <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
              <Shield className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Account Connections
            </h2>
          </div>

          <p className="text-gray-600 dark:text-gray-300 mb-6">
            Connect your email accounts to automatically sync contacts and personalize your AI writing style.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Microsoft Account Connection */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-6">
              <div className="flex items-center space-x-3 mb-4">
                <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                  <Mail className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Microsoft Account
                </h3>
              </div>
              
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                Connect your Outlook/Office 365 account to sync contacts and analyze your writing style.
              </p>
              
              <div className="space-y-3">
                <div className="text-sm">
                  <span className="font-medium text-gray-700 dark:text-gray-300">Status: </span>
                  {connectionLoading ? (
                    <span className="text-gray-500">Processing...</span>
                  ) : (
                    <span className={isMicrosoftConnected ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                      {isMicrosoftConnected ? "Connected" : "Not Connected"}
                    </span>
                  )}
                </div>
                
                {/* Show connect or disconnect button based on status */}
                {!isMicrosoftConnected ? (
                  <button
                    onClick={handleMicrosoftConnect}
                    disabled={connectionLoading}
                    className="w-full flex items-center justify-center space-x-2 px-4 py-3 rounded-lg font-medium transition-colors bg-blue-600 text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
                  >
                    {connectionLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Mail className="h-4 w-4" />
                    )}
                    <span>Connect Microsoft Account</span>
                  </button>
                ) : (
                  <div className="space-y-2">
                    <div className="w-full flex items-center justify-center space-x-2 px-4 py-3 rounded-lg font-medium bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                      <Mail className="h-4 w-4" />
                      <span>Connected Successfully</span>
                    </div>
                    <button
                      onClick={handleMicrosoftDisconnect}
                      disabled={connectionLoading}
                      className="w-full flex items-center justify-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50 disabled:opacity-50"
                    >
                      {connectionLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <X className="h-4 w-4" />
                      )}
                      <span>Disconnect Account</span>
                    </button>
                    
                    {/* Test Sync Button - Only visible when Microsoft is connected */}
                    <button
                      onClick={handleTestSync}
                      disabled={syncLoading || connectionLoading}
                      className="w-full flex items-center justify-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:hover:bg-purple-900/50 disabled:opacity-50"
                    >
                      {syncLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Mail className="h-4 w-4" />
                      )}
                      <span>
                        {syncLoading ? 'Syncing...' : 'Manually Sync Outlook Contacts (Test)'}
                      </span>
                    </button>
                  </div>
                )}
                
                {!isMicrosoftConnected && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Secure OAuth connection using Supabase identity linking
                  </p>
                )}
                
                {isMicrosoftConnected && (
                  <p className="text-xs text-green-600 dark:text-green-400">
                    ✅ Ready for contact sync and voice analysis
                  </p>
                )}
              </div>
            </div>

            {/* Google Account Connection */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-6">
              <div className="flex items-center space-x-3 mb-4">
                <div className="p-2 bg-red-100 dark:bg-red-900 rounded-lg">
                  <Mail className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
                <h3 className="text-lg font-semibent text-gray-900 dark:text-white">
                  Google Account
                </h3>
              </div>
              
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                Connect your Gmail/Google Workspace account to sync contacts and analyze your writing style.
              </p>
              
              <div className="space-y-3">
                <div className="text-sm">
                  <span className="font-medium text-gray-700 dark:text-gray-300">Status: </span>
                  <span className="text-gray-500 dark:text-gray-400">Coming Soon</span>
                </div>
                
                <button
                  disabled
                  className="w-full flex items-center justify-center space-x-2 px-4 py-3 rounded-lg font-medium transition-colors bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500 cursor-not-allowed"
                >
                  <Mail className="h-4 w-4" />
                  <span>Connect Google Account</span>
                </button>
                
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Coming soon - Google integration in development
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* User Information Section */}
      {!loading && profile && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Account Information
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Full Name
              </label>
              <p className="text-gray-900 dark:text-white">
                {profile.full_name || 'Not provided'}
              </p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Email Address
              </label>
              <p className="text-gray-900 dark:text-white">
                {profile.email || user.email}
              </p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Account Created
              </label>
              <p className="text-gray-900 dark:text-white">
                {new Date(profile.created_at).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                User ID
              </label>
              <p className="text-gray-900 dark:text-white font-mono text-sm">
                {user.id}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}