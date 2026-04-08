import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
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
import { Login } from './pages/Login';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SidebarProvider } from './contexts/SidebarContext';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { adminKey } = useAuth();
  const location = useLocation();

  if (!adminKey) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

/** Wraps routes that are admin-only; redirects API-key users to the dashboard. */
const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAdmin } = useAuth();

  if (!isAdmin) {
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
                <Route path="/" element={<Dashboard />} />
                <Route path="/logs" element={<Logs />} />
                <Route path="/debug" element={<Debug />} />
                <Route
                  path="/providers"
                  element={
                    <AdminRoute>
                      <Providers />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/models"
                  element={
                    <AdminRoute>
                      <Models />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/keys"
                  element={
                    <AdminRoute>
                      <Keys />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/config"
                  element={
                    <AdminRoute>
                      <Config />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/system-logs"
                  element={
                    <AdminRoute>
                      <SystemLogs />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/errors"
                  element={
                    <AdminRoute>
                      <Errors />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/quotas"
                  element={
                    <AdminRoute>
                      <Quotas />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/mcp"
                  element={
                    <AdminRoute>
                      <McpPage />
                    </AdminRoute>
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

const App = () => {
  return (
    <AuthProvider>
      <SidebarProvider>
        <AppRoutes />
      </SidebarProvider>
    </AuthProvider>
  );
};

export default App;
