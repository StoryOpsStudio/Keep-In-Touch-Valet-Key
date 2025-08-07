import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { NewsMatch } from '../services/newsService';
import { supabase } from '../supabaseClient';
import { useAuthStore } from './authStore';

interface NewsState {
  matches: NewsMatch[];
  unreadCount: number;
  lastCheck: Date | null;
  nextCheck: Date | null;
  isChecking: boolean;
  autoCheckEnabled: boolean;
  autoCheckInterval: number; // in milliseconds
  hasPerformedInitialScan: boolean;
  
  // Actions
  setMatches: (matches: NewsMatch[]) => void;
  addMatches: (newMatches: NewsMatch[]) => void;
  addMatch: (match: NewsMatch) => void; // Updated for real-time sorting
  markAsRead: (matchId: string) => void;
  markAllAsRead: () => void;
  setLastCheck: (date: Date) => void;
  setNextCheck: (date: Date) => void;
  setIsChecking: (checking: boolean) => void;
  setAutoCheckEnabled: (enabled: boolean) => void;
  clearMatches: () => void;
  removeMatch: (matchId: string) => void;
  setInitialScanPerformed: () => void;
  
  // UPDATED: Consolidated state management action
  prepareForNewCheck: () => void;
  
  // NEW: Fetch initial matches for authenticated user
  fetchInitialMatches: () => Promise<void>;
}

export const useNewsStore = create<NewsState>()(
  persist(
    (set, get) => ({
      matches: [],
      unreadCount: 0,
      lastCheck: null,
      nextCheck: null,
      isChecking: false,
      autoCheckEnabled: true,
      autoCheckInterval: 30 * 60 * 1000, // 30 minutes
      hasPerformedInitialScan: false,

      setMatches: (matches) => {
        const unreadCount = matches.filter(m => !m.isRead).length;
        set({ matches, unreadCount });
      },

      addMatches: (newMatches) => {
        const state = get();
        const existingIds = new Set(state.matches.map(m => m.id));
        const uniqueNewMatches = newMatches.filter(m => !existingIds.has(m.id));
        
        if (uniqueNewMatches.length > 0) {
          const allMatches = [...state.matches, ...uniqueNewMatches];
          const unreadCount = allMatches.filter(m => !m.isRead).length;
          set({ matches: allMatches, unreadCount });
        }
      },

      // FIXED: Use prepend pattern for real-time sorting
      addMatch: (newMatch) => {
        const state = get();
        // Always prepend new matches and filter out duplicates
        const updatedMatches = [
          newMatch,
          ...state.matches.filter(m => m.id !== newMatch.id)
        ];
        const unreadCount = updatedMatches.filter(m => !m.isRead).length;
        set({ matches: updatedMatches, unreadCount });
      },

      markAsRead: (matchId) => {
        const state = get();
        const updatedMatches = state.matches.map(match =>
          match.id === matchId ? { ...match, isRead: true, isNew: false } : match
        );
        const unreadCount = updatedMatches.filter(m => !m.isRead).length;
        set({ matches: updatedMatches, unreadCount });
      },

      markAllAsRead: () => {
        const state = get();
        const updatedMatches = state.matches.map(match => ({
          ...match,
          isRead: true,
          isNew: false
        }));
        set({ matches: updatedMatches, unreadCount: 0 });
      },

      setLastCheck: (date) => set({ lastCheck: date }),
      
      setNextCheck: (date) => set({ nextCheck: date }),
      
      setIsChecking: (checking) => set({ isChecking: checking }),
      
      setAutoCheckEnabled: (enabled) => {
        set({ autoCheckEnabled: enabled });
        if (enabled) {
          // Set next check time
          const nextCheck = new Date(Date.now() + get().autoCheckInterval);
          set({ nextCheck });
        } else {
          set({ nextCheck: null });
        }
      },

      clearMatches: () => {
        console.log('🗑️ [NewsStore] Clearing all news matches');
        set({ 
          matches: [], 
          unreadCount: 0, 
          hasPerformedInitialScan: false 
        });
      },

      removeMatch: (matchId) => {
        const state = get();
        const updatedMatches = state.matches.filter(m => m.id !== matchId);
        const unreadCount = updatedMatches.filter(m => !m.isRead).length;
        set({ matches: updatedMatches, unreadCount });
      },

      setInitialScanPerformed: () => set({ hasPerformedInitialScan: true }),

      // UPDATED: Consolidated "prepare for new check" action
      prepareForNewCheck: () => {
        console.log('🔄 [NewsStore] Preparing for new check - clearing old data and setting processing state');
        set({
          isChecking: true, // CRITICAL: Set to true here - single source of truth
          // Note: We preserve matches, lastCheck, and autoCheckEnabled as these are user data
          // Only reset the processing state and clear any error conditions
        });
      },

      // NEW: Fetch initial matches for authenticated user
      fetchInitialMatches: async () => {
        const { user } = useAuthStore.getState();
        if (!user) {
          console.log('👤 [NewsStore] No user, cannot fetch initial matches.');
          set({ matches: [], unreadCount: 0 }); // Ensure matches are empty if no user
          return;
        }

        console.log(`🚀 [NewsStore] Fetching initial news matches for user: ${user.id}`);
        set({ isChecking: true });

        try {
          const { data, error } = await supabase
            .from('news_matches')
            .select('*')
            .eq('user_id', user.id) // CRITICAL: Only fetch matches for the logged-in user
            .order('found_at', { ascending: false });

          if (error) {
            console.error('❌ [NewsStore] Error fetching initial matches:', error);
            set({ matches: [], unreadCount: 0 });
          } else {
            // Transform database records to NewsMatch format
            const newsMatches: NewsMatch[] = (data || []).map(record => ({
              id: `${record.article_url}-${record.contact_id}`,
              contactId: record.contact_id.toString(),
              contactName: record.contact_name,
              contactCategory: record.contact_category || 'OTHER',
              articleTitle: record.article_title,
              articleUrl: record.article_url,
              publication: record.publication as 'deadline' | 'variety' | 'thr',
              matchLocation: record.match_location as 'title' | 'description' | 'full',
              excerpt: record.excerpt || '',
              foundAt: new Date(record.found_at),
              isNew: record.is_new || false,
              isRead: record.is_read || false,
              source: 'wordpress-api' as const
            }));

            const unreadCount = newsMatches.filter(m => !m.isRead).length;
            set({ matches: newsMatches, unreadCount });
            console.log(`✅ [NewsStore] Found ${newsMatches.length} existing matches for user ${user.id} (${unreadCount} unread)`);
          }
        } catch (error) {
          console.error('❌ [NewsStore] Exception fetching initial matches:', error);
          set({ matches: [], unreadCount: 0 });
        } finally {
          set({ isChecking: false });
        }
      }
    }),
    {
      name: 'keep-in-touch-news-storage',
      partialize: (state) => ({
        // UPDATED: Only persist user-agnostic settings, not user-specific data
        autoCheckEnabled: state.autoCheckEnabled,
        autoCheckInterval: state.autoCheckInterval,
        // NOTE: We no longer persist matches, lastCheck, or hasPerformedInitialScan
        // These will be fetched fresh for each user session
      })
    }
  )
);