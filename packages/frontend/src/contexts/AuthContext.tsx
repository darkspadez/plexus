import React, { createContext, useContext, useState, useEffect } from 'react';
import { verifyKey, clearAuthCaches } from '../lib/api';

type AuthType = 'admin' | 'api-key' | null;

interface AuthContextType {
  adminKey: string | null;
  isAuthenticated: boolean;
  authType: AuthType;
  keyName: string | null;
  isAdmin: boolean;
  isRestoring: boolean;
  login: (key: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [adminKey, setAdminKey] = useState<string | null>(null);
  const [authType, setAuthType] = useState<AuthType>(null);
  const [keyName, setKeyName] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(() => !!localStorage.getItem('plexus_admin_key'));

  // Initialize from local storage — re-verify with the backend so a stale or
  // wrong key stored from before this fix doesn't grant access.
  useEffect(() => {
    const storedKey = localStorage.getItem('plexus_admin_key');
    const storedAuthType = localStorage.getItem('plexus_auth_type') as AuthType;
    if (storedKey) {
      verifyKey(storedKey, storedAuthType === 'api-key' ? 'api-key' : 'admin')
        .then((result) => {
          if (result) {
            setAdminKey(storedKey);
            setAuthType(result.authType);
            setKeyName(result.keyName ?? null);
          } else {
            localStorage.removeItem('plexus_admin_key');
            localStorage.removeItem('plexus_auth_type');
            localStorage.removeItem('plexus_key_name');
          }
        })
        .finally(() => setIsRestoring(false));
    }
  }, []);

  const login = async (key: string): Promise<boolean> => {
    // Try admin key first, then API key
    let result = await verifyKey(key, 'admin');
    if (!result) {
      result = await verifyKey(key, 'api-key');
    }
    if (result) {
      clearAuthCaches();
      localStorage.setItem('plexus_admin_key', key);
      localStorage.setItem('plexus_auth_type', result.authType);
      if (result.keyName) {
        localStorage.setItem('plexus_key_name', result.keyName);
      }
      setAdminKey(key);
      setAuthType(result.authType);
      setKeyName(result.keyName ?? null);
      return true;
    }
    return false;
  };

  const logout = () => {
    clearAuthCaches();
    localStorage.removeItem('plexus_admin_key');
    localStorage.removeItem('plexus_auth_type');
    localStorage.removeItem('plexus_key_name');
    setAdminKey(null);
    setAuthType(null);
    setKeyName(null);
  };

  return (
    <AuthContext.Provider
      value={{
        adminKey,
        isAuthenticated: !!adminKey,
        authType,
        keyName,
        isAdmin: authType === 'admin',
        isRestoring,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
