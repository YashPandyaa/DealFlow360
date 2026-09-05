import React, { createContext, useContext, useState, useEffect } from 'react';

const WorkspaceContext = createContext(null);

export const WorkspaceProvider = ({ children }) => {
  const [token, setToken] = useState(() => localStorage.getItem('dealflow_token') || '');
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('dealflow_user');
    return savedUser ? JSON.parse(savedUser) : null;
  });
  const [activeQuotationId, setActiveQuotationIdState] = useState(() => localStorage.getItem('dealflow_active_quotation_id') || '');
  const [reloadCounter, setReloadCounter] = useState(0);

  const login = (newToken, newUser) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('dealflow_token', newToken);
    localStorage.setItem('dealflow_user', JSON.stringify(newUser));
  };

  const logout = () => {
    setToken('');
    setUser(null);
    setActiveQuotationIdState('');
    localStorage.removeItem('dealflow_token');
    localStorage.removeItem('dealflow_user');
    localStorage.removeItem('dealflow_active_quotation_id');
  };

  const setActiveQuotationId = (id) => {
    setActiveQuotationIdState(id);
    if (id) {
      localStorage.setItem('dealflow_active_quotation_id', id);
    } else {
      localStorage.removeItem('dealflow_active_quotation_id');
    }
  };

  const reloadData = () => {
    setReloadCounter((prev) => prev + 1);
  };

  return (
    <WorkspaceContext.Provider
      value={{
        token,
        user,
        activeQuotationId,
        setActiveQuotationId,
        login,
        logout,
        reloadData,
        reloadCounter
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
};

export const useWorkspace = () => {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
};

export default WorkspaceContext;
