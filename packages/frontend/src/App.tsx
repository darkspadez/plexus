import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'sonner';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MainLayout } from './components/layout/MainLayout';
import { Dashboard } from './pages/Dashboard';
import { Logs } from './pages/Logs';
import { Providers } from './pages/Providers';
import { Models } from './pages/Models';
import { Keys } from './pages/Keys';
import { Config } from './pages/Config';
import { SystemLogs } from './pages/SystemLogs';
import { Debug } from './pages/Debug';
import { Errors } from './pages/Errors';
import { Quotas } from './pages/Quotas';
import { McpPage } from './pages/Mcp';
import { Playground } from './pages/Playground';
import { Login } from './pages/Login';
import { MyKey } from './pages/MyKey';
import { UserQuotas } from './pages/UserQuotas';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SidebarProvider } from './contexts/SidebarContext';
import { ToastProvider } from './contexts/ToastContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { AccentProvider } from './contexts/AccentContext';

/** App-wide QueryClient — sensible defaults for a server-management UI. */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** When true, only admin principals can enter; limited users are redirected. */
  requireAdmin?: boolean;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, requireAdmin }) => {
  const { adminKey, isLimited } = useAuth();
  const location = useLocation();

  if (!adminKey) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Limited (api-key) users can see a scoped subset of the admin panel. Admin-
  // only routes bounce them back to the Dashboard rather than showing an
  // access-denied screen — the sidebar doesn't even link to those routes for
  // them, so this handles direct-URL access.
  if (requireAdmin && isLimited) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <MainLayout>
              <Routes>
                {/* Accessible to both admin and limited users */}
                <Route path="/" element={<Dashboard />} />
                <Route path="/logs" element={<Logs />} />
                <Route path="/debug" element={<Debug />} />
                <Route path="/errors" element={<Errors />} />
                <Route path="/me" element={<MyKey />} />

                {/* Admin-only routes */}
                <Route
                  path="/providers"
                  element={
                    <ProtectedRoute requireAdmin>
                      <Providers />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/models"
                  element={
                    <ProtectedRoute requireAdmin>
                      <Models />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/keys"
                  element={
                    <ProtectedRoute requireAdmin>
                      <Keys />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/config"
                  element={
                    <ProtectedRoute requireAdmin>
                      <Config />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/system-logs"
                  element={
                    <ProtectedRoute requireAdmin>
                      <SystemLogs />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/quotas"
                  element={
                    <ProtectedRoute requireAdmin>
                      <Quotas />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/mcp"
                  element={
                    <ProtectedRoute requireAdmin>
                      <McpPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/playground"
                  element={
                    <ProtectedRoute requireAdmin>
                      <Playground />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/user-quotas"
                  element={
                    <ProtectedRoute requireAdmin>
                      <UserQuotas />
                    </ProtectedRoute>
                  }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </MainLayout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
};

/** Inner shell — needs to be inside ThemeProvider to call useTheme() for the Toaster. */
const AppShell: React.FC = () => {
  const { resolved } = useTheme();
  return (
    <>
      <Toaster theme={resolved} richColors position="top-right" />
      <ToastProvider>
        <AuthProvider>
          <SidebarProvider>
            <AppRoutes />
          </SidebarProvider>
        </AuthProvider>
      </ToastProvider>
    </>
  );
};

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AccentProvider>
          <AppShell />
        </AccentProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;
