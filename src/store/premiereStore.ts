import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface PremiereMatch {
  id: string;
  contactId: number;
  contactName: string;
  contactEmail?: string;
  contactCategory: string;
  premiere: {
    id: number;
    title: string;
    type: 'movie' | 'tv';
    releaseDate: string;
    overview: string;
    posterPath: string | null;
  };
  role: string;
  character?: string;
  job?: string;
  department?: string;
  matchScore: number;
  foundAt: string;
}

interface PremiereState {
  matches: PremiereMatch[];
  isProcessing: boolean;
  error: string | null;
  
  // Actions
  addMatch: (match: PremiereMatch) => void;
  prepareForNewCheck: () => void;
  clearMatches: () => void;
}

export const usePremiereStore = create<PremiereState>()(
  persist(
    (set, get) => ({
      matches: [],
      isProcessing: false,
      error: null,

      addMatch: (newMatch) => {
        const state = get();
        // Prepend new match and filter out duplicates
        const updatedMatches = [
          newMatch,
          ...state.matches.filter(m => m.id !== newMatch.id)
        ];
        set({ matches: updatedMatches });
      },

      prepareForNewCheck: () => {
        console.log('🔄 [PremiereStore] Preparing for new check - clearing old data and setting processing state');
        set({
          matches: [],
          isProcessing: true,
          error: null
        });
      },

      clearMatches: () => {
        console.log('🗑️ [PremiereStore] Clearing all premiere matches');
        set({
          matches: [],
          isProcessing: false,
          error: null
        });
      }
    }),
    {
      name: 'keep-in-touch-premiere-storage',
      partialize: (state) => ({
        // Only persist matches, not processing states
        matches: state.matches
      })
    }
  )
);