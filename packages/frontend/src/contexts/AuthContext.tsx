import React, { createContext, useContext, useState, useEffect } from 'react';
import { verifyAdminKey } from '../lib/api';

interface AuthContextType {
  adminKey: string | null;
  isAuthenticated: boolean;
  login: (key: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [adminKey, setAdminKey] = useState<string | null>(null);

  // Initialize from local storage — re-verify with the backend so a stale or
  // wrong key stored from before this fix doesn't grant access.
  useEffect(() => {
    const storedKey = localStorage.getItem('plexus_admin_key');
    if (storedKey) {
      verifyAdminKey(storedKey).then((valid) => {
        if (valid) {
          setAdminKey(storedKey);
        } else {
          localStorage.removeItem('plexus_admin_key');
        }
      });
    }
  }, []);

  const login = async (key: string): Promise<boolean> => {
    const valid = await verifyAdminKey(key);
    if (valid) {
      localStorage.setItem('plexus_admin_key', key);
      setAdminKey(key);
    }
    return valid;
  };

  const logout = () => {
    localStorage.removeItem('plexus_admin_key');
    setAdminKey(null);
  };

  return (
    <AuthContext.Provider
      value={{
        adminKey,
        isAuthenticated: !!adminKey,
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
