import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useWorkspace } from '../../context/WorkspaceContext';
import {
  Layers,
  LayoutGrid,
  FileText,
  Truck,
  CreditCard,
  BarChart3,
  RefreshCw,
  LogOut,
  User,
  Shield,
  FileSpreadsheet,
  CheckSquare,
  MessageSquare
} from 'lucide-react';

import RoleNavigation from '../../components/navigation/RoleNavigation';

export default function WorkspaceLayout({ children }) {
  const { user, logout, reloadData, activeQuotationId } = useWorkspace();
  const navigate = useNavigate();
  const location = useLocation();
  const [reloading, setReloading] = useState(false);

  const handleReload = () => {
    setReloading(true);
    reloadData();
    setTimeout(() => setReloading(false), 500);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="app-container">
      {/* Top Navigation Header */}
      <header
        style={{
          height: '64px',
          backgroundColor: '#ffffff',
          borderBottom: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px 0 rgba(15, 23, 42, 0.05)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 1.5rem',
          position: 'sticky',
          top: 0,
          zIndex: 50
        }}
      >
        {/* Left Section: Brand & Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <div
            onClick={() => navigate('/workspace/pipeline')}
            style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', cursor: 'pointer' }}
          >
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                boxShadow: '0 2px 10px rgba(37, 99, 235, 0.25)'
              }}
            >
              <Layers size={20} />
            </div>
            <span style={{ fontSize: '1.15rem', fontWeight: '700', color: '#0f172a', letterSpacing: '-0.02em' }}>
              DealFlow360
            </span>
          </div>

          <RoleNavigation />
        </div>

        {/* Right Section: Actions & Profile */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          {activeQuotationId && (
            <div
              className="badge badge-purple"
              style={{ padding: '0.3rem 0.65rem', fontSize: '0.725rem', cursor: 'pointer' }}
              onClick={() => navigate('/workspace/quotation-builder')}
            >
              <FileSpreadsheet size={13} />
              <span>Active Quote: {activeQuotationId.slice(0, 12)}...</span>
            </div>
          )}

          <button
            onClick={handleReload}
            className="btn btn-secondary btn-sm"
            title="Reload Workspace Data"
            disabled={reloading}
          >
            <RefreshCw size={14} className={reloading ? 'spinner' : ''} />
            <span>Reload Data</span>
          </button>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.35rem 0.75rem',
              backgroundColor: '#f8fafc',
              borderRadius: '8px',
              border: '1px solid #e2e8f0'
            }}
          >
            <div
              style={{
                width: '26px',
                height: '26px',
                borderRadius: '50%',
                backgroundColor: '#2563eb',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.75rem',
                fontWeight: '700'
              }}
            >
              {user?.name ? user.name[0].toUpperCase() : 'U'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
              <span style={{ fontSize: '0.8rem', fontWeight: '600', color: '#0f172a' }}>
                {user?.name || 'User'}
              </span>
              <span style={{ fontSize: '0.675rem', color: '#64748b', fontWeight: '500' }}>
                {user?.role || 'REP'}
              </span>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="btn btn-outline btn-sm"
            title="Close Workspace"
            style={{ color: '#dc2626', borderColor: '#fecaca' }}
          >
            <LogOut size={14} />
          </button>
        </div>
      </header>

      {/* Main Workspace Workspace Content */}
      <main className="main-content">
        {children || <Outlet />}
      </main>
    </div>
  );
}
