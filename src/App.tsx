import { Routes, Route, Navigate } from 'react-router-dom';
import { ImportPage } from './pages/ImportPage';
import { ContactsPage } from './pages/ContactsPage';
import { PremieresPage } from './pages/PremieresPage';
import { NewsPage } from './pages/NewsPage';
import { DashboardPage } from './pages/DashboardPage';
import { SettingsPage } from './pages/SettingsPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { AuthCallbackPage } from './pages/AuthCallbackPage';
import { Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthGuard } from './components/AuthGuard';

/**
 * MAIN APP COMPONENT - CLEAN ROUTER
 * 
 * This component is now a clean router with no data fetching logic.
 * Data fetching is handled by individual page components when needed.
 */
function App() {
  return (
    <ErrorBoundary>
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        
        {/* Protected Routes */}
        <Route path="/*" element={
          <AuthGuard>
            <Layout>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/import" element={<ImportPage />} />
                <Route path="/contacts" element={<ContactsPage />} />
                <Route path="/premieres" element={<PremieresPage />} />
                <Route path="/news" element={<NewsPage />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Layout>
          </AuthGuard>
        } />
      </Routes>
    </ErrorBoundary>
  );
}

export default App;