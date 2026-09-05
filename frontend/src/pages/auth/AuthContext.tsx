import React, { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface AuthContextType {
  token: string | null;
  user: AuthUser | null;
  isLoading: boolean;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
  simulate401: () => void;
}

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Check for existing token on app load
    const storedToken = localStorage.getItem('dealflow_token');
    const storedUserStr = localStorage.getItem('dealflow_user');

    if (storedToken && storedUserStr) {
      try {
        // Mock token expiry check (if token is exactly "EXPIRED_TOKEN")
        if (storedToken === 'EXPIRED_TOKEN') {
          throw new Error('Token expired');
        }
        
        const parsedUser = JSON.parse(storedUserStr);
        setToken(storedToken);
        setUser(parsedUser);
      } catch (e) {
        // Token invalid or expired
        localStorage.removeItem('dealflow_token');
        localStorage.removeItem('dealflow_user');
      }
    }
    
    setIsLoading(false);
  }, []);

  const login = (newToken: string, newUser: AuthUser) => {
    localStorage.setItem('dealflow_token', newToken);
    localStorage.setItem('dealflow_user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  };

  const logout = () => {
    localStorage.removeItem('dealflow_token');
    localStorage.removeItem('dealflow_user');
    setToken(null);
    setUser(null);
    navigate('/auth');
  };

  const simulate401 = () => {
    // Called when a mock API intercepts a 401
    logout();
  };

  return (
    <AuthContext.Provider value={{ token, user, isLoading, login, logout, simulate401 }}>
      {children}
    </AuthContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
