import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Film, AlertCircle } from 'lucide-react';

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

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
          console.log('✅ [AuthCallbackPage] OAuth callback detected, redirecting to settings...');
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
  }, [navigate]);

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
        <p className="text-blue-200">Processing authentication...</p>
      </div>
    </div>
  );
}