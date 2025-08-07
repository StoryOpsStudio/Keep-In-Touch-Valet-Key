import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.');
}

// Create the client once and export the single instance (singleton pattern)
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
});

// Database types for TypeScript
export interface Contact {
  id: number;
  created_at: string;
  first_name: string;
  last_name: string;
  email?: string;
  category?: string;
  normalized_name: string;
}

export interface ContactInsert {
  first_name: string;
  last_name: string;
  email?: string;
  category?: string;
  normalized_name: string;
}

// Log successful client creation
console.log('✅ Supabase client initialized as singleton with Realtime enabled');