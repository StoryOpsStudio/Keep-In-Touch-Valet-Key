import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';
import { realtimeService } from '../services/realtimeService';

interface Profile {
  id: string;
  email: string;
  full_name?: string;
  voice_profile: string;
  created_at: string;
  updated_at: string;
}

interface AuthState {
  // State
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
  
  // Actions
  signUp: (email: string, password: string, fullName?: string) => Promise<{ success: boolean; error?: string; user?: User | null }>;
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string; user?: User | null }>;
  signOut: () => Promise<{ success: boolean; error?: string }>;
  updateProfile: (updates: Partial<Profile>) => Promise<{ success: boolean; error?: string; profile?: Profile }>;
  
  // Internal actions
  setAuthState: (state: Partial<AuthState>) => void;
  fetchProfile: (userId: string) => Promise<Profile | null>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // Initial state
      user: null,
      profile: null,
      session: null,
      loading: true, // Start with loading = true
      error: null,

      // Fetch user profile from profiles table
      fetchProfile: async (userId: string): Promise<Profile | null> => {
        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

          if (error) {
            console.error('Error fetching profile:', error);
            return null;
          }

          return data;
        } catch (error) {
          console.error('Profile fetch failed:', error);
          return null;
        }
      },

      // Sign up with email and password
      signUp: async (email: string, password: string, fullName?: string) => {
        try {
          set({ loading: true, error: null });

          const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
              data: {
                full_name: fullName || email
              }
            }
          });

          if (error) {
            set({ error: error.message, loading: false });
            return { success: false, error: error.message };
          }

          console.log('✅ User signed up successfully:', data.user?.email);
          
          return { success: true, user: data.user };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Sign up failed';
          set({ error: errorMessage, loading: false });
          return { success: false, error: errorMessage };
        }
      },

      // Sign in with email and password
      signIn: async (email: string, password: string) => {
        try {
          set({ loading: true, error: null });

          const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
          });

          if (error) {
            set({ error: error.message, loading: false });
            return { success: false, error: error.message };
          }

          console.log('✅ User signed in successfully:', data.user?.email);
          
          return { success: true, user: data.user };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Sign in failed';
          set({ error: errorMessage, loading: false });
          return { success: false, error: errorMessage };
        }
      },

      // UPDATED: Sign out with complete data clearing
      signOut: async () => {
        try {
          set({ loading: true, error: null });

          console.log('🔑 [AuthStore] Signing out user and clearing all data...');

          const { error } = await supabase.auth.signOut();

          if (error) {
            set({ error: error.message, loading: false });
            return { success: false, error: error.message };
          }

          // Clear auth state
          set({ 
            user: null, 
            profile: null, 
            session: null, 
            loading: false, 
            error: null 
          });

          console.log('✅ [AuthStore] User signed out and all data cleared');
          return { success: true };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Sign out failed';
          set({ error: errorMessage, loading: false });
          return { success: false, error: errorMessage };
        }
      },

      // Update profile
      updateProfile: async (updates: Partial<Profile>) => {
        try {
          const { user } = get();
          if (!user) {
            throw new Error('No authenticated user');
          }

          const { data, error } = await supabase
            .from('profiles')
            .update(updates)
            .eq('id', user.id)
            .select()
            .single();

          if (error) {
            throw error;
          }

          set({ profile: data });
          console.log('✅ Profile updated successfully');
          return { success: true, profile: data };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Profile update failed';
          console.error('❌ Profile update failed:', errorMessage);
          return { success: false, error: errorMessage };
        }
      },

      // Internal action to update auth state
      setAuthState: (newState: Partial<AuthState>) => {
        set(newState);
      }
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        // Only persist non-sensitive data
        session: state.session
      })
    }
  )
);

// SINGLETON PATTERN: Global session listener that runs outside React lifecycle
let isListenerInitialized = false;

export const initializeAuthListener = async () => {
  // Guard: Ensure this only runs once, ever
  if (isListenerInitialized) {
    console.log('✅ [AuthStore] Session listener already initialized. Skipping.');
    return;
  }

  console.log('🔐 [AuthStore] Initializing SINGLETON session listener...');
  isListenerInitialized = true;

  try {
    // STEP 1: Check for initial session state (handles page refresh/reload)
    console.log('🔐 [AuthStore] Checking for existing session...');
    
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
      console.error('❌ [AuthStore] Error getting session:', error);
      useAuthStore.setState({
        user: null,
        profile: null,
        session: null,
        loading: false, // CRITICAL: Stop loading on error
        error: error.message
      });
      return;
    }

    if (session?.user) {
      console.log('✅ [AuthStore] Existing session found for:', session.user.email);
      const profile = await useAuthStore.getState().fetchProfile(session.user.id);
      
      useAuthStore.setState({
        user: session.user,
        profile,
        session,
        loading: false, // CRITICAL: Stop loading when session is restored
        error: null
      });
      
      // UPDATED: Fetch user-specific data on session restore
      const { useContactStore } = await import('./contactStore');
      const { useNewsStore } = await import('./newsStore');
      
      useContactStore.getState().fetchContacts();
      useNewsStore.getState().fetchInitialMatches();
    } else {
      console.log('ℹ️ [AuthStore] No existing session found');
      useAuthStore.setState({
        user: null,
        profile: null,
        session: null,
        loading: false, // CRITICAL: Stop loading when no session
        error: null
      });
    }

    // STEP 2: Listen for future auth state changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('🔐 [AuthStore] Auth state changed:', event, session?.user?.email);

        if (session?.user) {
          console.log('✅ [AuthStore] User authenticated via state change');
          const profile = await useAuthStore.getState().fetchProfile(session.user.id);
          
          useAuthStore.setState({
            user: session.user,
            profile,
            session,
            loading: false, // CRITICAL: Stop loading on auth change
            error: null
          });
          
          // UPDATED: Fetch user-specific data on login events
          if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
            const { useContactStore } = await import('./contactStore');
            const { useNewsStore } = await import('./newsStore');
            
            useContactStore.getState().fetchContacts();
            useNewsStore.getState().fetchInitialMatches();
            
            // CRITICAL: Subscribe to realtime news matches for this user
            realtimeService.subscribeToNewsMatches();
          }
        } else {
          console.log('ℹ️ [AuthStore] User signed out via state change');
          
          // UPDATED: Clear all user-specific data on sign out
          if (event === 'SIGNED_OUT') {
            const { useContactStore } = await import('./contactStore');
            const { useNewsStore } = await import('./newsStore');
            const { usePremiereStore } = await import('./premiereStore');
            
            useContactStore.getState().clearContacts();
            useNewsStore.getState().clearMatches();
            usePremiereStore.getState().clearMatches();
            
            // CRITICAL: Unsubscribe from realtime when user logs out
            realtimeService.unsubscribe();
          }
          
          useAuthStore.setState({
            user: null,
            profile: null,
            session: null,
            loading: false, // CRITICAL: Stop loading on sign out
            error: null
          });
        }
      }
    );

    console.log('✅ [AuthStore] SINGLETON session listener established');

    // Store subscription for potential cleanup
    (window as any).__authSubscription = subscription;

  } catch (error) {
    console.error('❌ [AuthStore] Session listener initialization failed:', error);
    useAuthStore.setState({
      user: null,
      profile: null,
      session: null,
      loading: false, // CRITICAL: Stop loading on error
      error: error instanceof Error ? error.message : 'Auth initialization failed'
    });
  }
};

// Computed property for authentication status
export const useIsAuthenticated = () => {
  return useAuthStore(state => !!state.user);
};

// Cleanup function for the global listener
export const cleanupAuthListener = () => {
  if ((window as any).__authSubscription) {
    console.log('🧹 [AuthStore] Cleaning up auth subscription');
    (window as any).__authSubscription.unsubscribe();
    (window as any).__authSubscription = null;
  }
  isListenerInitialized = false;
};

// Set up cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', cleanupAuthListener);
}