import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2, Film } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

interface AuthGuardProps {
  children: ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { user, loading, error } = useAuthStore();
  const isAuthenticated = !!user;

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