import { create } from 'zustand';
import { supabase, Contact } from '../supabaseClient';

interface ContactState {
  contacts: Contact[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  
  // Actions
  fetchContacts: () => Promise<void>;
  clearContacts: () => Promise<void>;
  addContact: (contact: Contact) => void;
}

export const useContactStore = create<ContactState>((set, get) => ({
  contacts: [],
  isLoading: false,
  isRefreshing: false,
  error: null,

  fetchContacts: async () => {
    const currentState = get();
    
    // Set appropriate loading state
    if (currentState.contacts.length === 0) {
      set({ isLoading: true, error: null });
    } else {
      set({ isRefreshing: true, error: null });
    }

    try {
      console.log('🔄 ContactStore: Fetching user contacts from Supabase with pagination...');
      
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }
      
      // Initialize variables for pagination
      const pageSize = 1000; // Number of contacts to fetch per page
      let allContacts: Contact[] = []; // Array to accumulate all contacts from all pages
      let currentPage = 0; // Start with page 0
      let hasMoreData = true; // Flag to control the pagination loop
      
      // Pagination loop: Keep fetching pages until we get less than pageSize records
      while (hasMoreData) {
        // Calculate the range for this page (from and to indices)
        const from = currentPage * pageSize; // Starting index for this page
        const to = from + pageSize - 1; // Ending index for this page
        
        console.log(`📄 ContactStore: Fetching page ${currentPage + 1} (contacts ${from + 1} to ${to + 1})...`);
        
        // Fetch one page of contacts using Supabase range with user filter
        const { data, error: supabaseError } = await supabase
          .from('contacts')
          .select('*')
          .eq('user_id', user.id) // CRITICAL: Only fetch current user's contacts
          .order('created_at', { ascending: false })
          .range(from, to); // This gets contacts from index 'from' to index 'to'

        // Check if there was an error fetching this page
        if (supabaseError) {
          throw supabaseError;
        }

        // Add the contacts from this page to our complete list
        if (data && data.length > 0) {
          allContacts = [...allContacts, ...data]; // Combine previous contacts with new ones
          console.log(`✅ ContactStore: Page ${currentPage + 1} loaded ${data.length} contacts (total so far: ${allContacts.length})`);
        }

        // Check if we should continue to the next page
        // If this page has fewer contacts than pageSize, we've reached the end
        if (!data || data.length < pageSize) {
          hasMoreData = false; // Stop the loop - we've got all the data
          console.log(`🏁 ContactStore: Reached end of data. Final total: ${allContacts.length} contacts`);
        } else {
          currentPage++; // Move to the next page
        }
      }

      // Update the store with all contacts from all pages
      set({ 
        contacts: allContacts, 
        isLoading: false, 
        isRefreshing: false, 
        error: null 
      });
      
      console.log(`✅ ContactStore: Successfully loaded ${allContacts.length} user contacts from ${currentPage + 1} pages`);
    } catch (err) {
      console.error('❌ ContactStore: Error fetching contacts:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch contacts';
      
      set({ 
        error: errorMessage, 
        isLoading: false, 
        isRefreshing: false 
      });
    }
  },

  // UPDATED: Clear contacts from both database and store
  clearContacts: async () => {
    console.log('🗑️ ContactStore: Starting database contact clear...');
    
    try {
      // Get current session for authentication
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('No active session');
      }

      // Call the clear-contacts Edge Function
      const { data, error } = await supabase.functions.invoke('clear-contacts', {
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (error) {
        console.error('❌ ContactStore: Clear contacts error:', error);
        throw new Error(`Clear failed: ${error.message}`);
      }

      if (data.status === 'success') {
        console.log(`✅ ContactStore: Successfully cleared ${data.deletedCount} contacts from database`);
        
        // Clear the local store state after successful database clear
        set({ 
          contacts: [], 
          isLoading: false,
          isRefreshing: false,
          error: null 
        });
        
        console.log('✅ ContactStore: Local store cleared after successful database operation');
      } else {
        throw new Error(data.message || 'Clear failed with unknown error');
      }

    } catch (err) {
      console.error('❌ ContactStore: Error clearing contacts:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to clear contacts';
      
      // Set error state but don't change contacts (failed operation)
      set({ error: errorMessage });
      
      // Re-throw the error so the UI can handle it
      throw err;
    }
  },

  addContact: (contact: Contact) => {
    const currentContacts = get().contacts;
    set({ contacts: [contact, ...currentContacts] });
    console.log('➕ ContactStore: Added contact to store');
  }
}));

// Helper hook for legacy compatibility
export function useLegacyContacts() {
  const { contacts, isLoading, error } = useContactStore();
  
  const legacyContacts = contacts.map(contact => ({
    id: contact.id.toString(),
    firstName: contact.first_name,
    lastName: contact.last_name,
    email: contact.email,
    category: contact.category || 'OTHER',
    createdAt: contact.created_at
  }));

  return {
    contacts: legacyContacts,
    isLoading,
    error
  };
}