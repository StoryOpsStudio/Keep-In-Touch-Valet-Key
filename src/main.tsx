import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { useAuthStore } from './store/authStore';
import App from './App';
import './index.css';

const initialize = async () => {
  // 1. Get the initial session from browser cookies.
  const { data: { session } } = await supabase.auth.getSession();
  useAuthStore.setState({ session, user: session?.user ?? null, loading: false });

  // 2. Subscribe to any future auth changes (login/logout).
  supabase.auth.onAuthStateChange((_event, s) =>
    useAuthStore.setState({ session: s, user: s?.user ?? null, loading: false })
  );

  // 3. Now that auth is resolved, render the app.
  createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>
  );
};

initialize();