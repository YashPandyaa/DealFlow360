import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

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

export const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState<boolean>(true);
  const [activeQuotationId, setActiveQuotationId] = useState<string | null>(null);
  const [isReloading, setIsReloading] = useState<boolean>(false);
  const [lastReloadedAt, setLastReloadedAt] = useState<Date | null>(null);
  const [reloadListeners] = useState<Set<() => Promise<void> | void>>(() => new Set());

  // Simulate user profile resolution
  useEffect(() => {
    const timer = setTimeout(() => {
      setCurrentUser({
        id: 'usr_101',
        name: 'Sarah Chen',
        email: 'sarah.chen@dealflow.co',
        role: 'Senior Account Executive',
      });
      setIsLoadingUser(false);
    }, 250);

    return () => clearTimeout(timer);
  }, []);

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

export const useWorkspace = (): WorkspaceContextType => {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
};

export default WorkspaceContext;
