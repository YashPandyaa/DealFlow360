import React, { createContext, useContext, useState, useCallback } from 'react';

import { useAuth } from '../auth/AuthContext';

// We map AuthUser to User (or just use AuthUser properties)
export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarUrl?: string;
}

export interface WorkspaceContextType {
  currentUser: User | null;
  isLoadingUser: boolean;
  activeQuotationId: string | null;
  setActiveQuotationId: (id: string | null) => void;
  reloadData: () => Promise<void>;
  isReloading: boolean;
  lastReloadedAt: Date | null;
  clearWorkspace: () => void;
  registerReloadListener: (listener: () => Promise<void> | void) => () => void;
}

// eslint-disable-next-line react-refresh/only-export-components
export const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  
  // No longer simulate loading user internally since AuthContext handles it,
  // but we map AuthContext user directly to our WorkspaceContext currentUser
  const currentUser = user as User | null;
  const isLoadingUser = false; // Because ProtectedRoute already waits for AuthContext to load
  const [activeQuotationId, setActiveQuotationId] = useState<string | null>(null);
  const [isReloading, setIsReloading] = useState<boolean>(false);
  const [lastReloadedAt, setLastReloadedAt] = useState<Date | null>(null);
  const [reloadListeners] = useState<Set<() => Promise<void> | void>>(() => new Set());

  const registerReloadListener = useCallback((listener: () => Promise<void> | void) => {
    reloadListeners.add(listener);
    return () => {
      reloadListeners.delete(listener);
    };
  }, [reloadListeners]);

  const reloadData = useCallback(async () => {
    if (isReloading) return;
    setIsReloading(true);

    try {
      const promises = Array.from(reloadListeners).map(fn => {
        try {
          return Promise.resolve(fn());
        } catch (e) {
          console.warn('Error in reload listener:', e);
          return Promise.resolve();
        }
      });

      await Promise.all([
        ...promises,
        new Promise(resolve => setTimeout(resolve, 600))
      ]);

      setLastReloadedAt(new Date());
    } finally {
      setIsReloading(false);
    }
  }, [isReloading, reloadListeners]);

  const clearWorkspace = useCallback(() => {
    setActiveQuotationId(null);
    setLastReloadedAt(null);
  }, []);

  return (
    <WorkspaceContext.Provider
      value={{
        currentUser,
        isLoadingUser,
        activeQuotationId,
        setActiveQuotationId,
        reloadData,
        isReloading,
        lastReloadedAt,
        clearWorkspace,
        registerReloadListener,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useWorkspace = (): WorkspaceContextType => {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
};

export default WorkspaceContext;
