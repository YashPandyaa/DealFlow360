import React from 'react';
import { NavLink, Outlet, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { 
  FileText, 
  Columns3, 
  RotateCw, 
  Sliders, 
  LogOut, 
  FileSpreadsheet, 
  CheckCircle2 
} from 'lucide-react';
import { useWorkspace } from './WorkspaceContext';
import './WorkspaceLayout.css';

export const WorkspaceLayout: React.FC = () => {
  const { 
    currentUser, 
    isLoadingUser, 
    activeQuotationId, 
    reloadData, 
    isReloading, 
    lastReloadedAt, 
    clearWorkspace 
  } = useWorkspace();

  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const currentViewParam = searchParams.get('view');
  const isPipelinePath = location.pathname.startsWith('/pipeline');
  const isQuotationsPath = location.pathname.startsWith('/quotations');

  // Determine whether Quotations or Pipeline Kanban is active
  const isQuotationsActive = isQuotationsPath || (isPipelinePath && currentViewParam === 'list');
  const isPipelineActive = (isPipelinePath && currentViewParam !== 'list') || location.pathname === '/workspace/pipeline';

  const handleCloseWorkspace = () => {
    clearWorkspace();
    navigate('/auth');
  };

  const handleGoToBackend = () => {
    navigate('/dashboard');
  };

  return (
    <div className="workspace-wrapper">
      {/* Top Navigation Bar */}
      <header className="workspace-topbar">
        {/* Left Nav Group */}
        <div className="workspace-nav-left">
          <span className="workspace-title-badge">Sales Workspace</span>
          
          <nav className="workspace-nav-tabs" aria-label="Workspace Views">
            {/* 1. Quotations List View */}
            <NavLink
              to="/pipeline?view=list"
              className={`workspace-tab ${isQuotationsActive ? 'active' : ''}`}
            >
              <FileText size={15} />
              <span>Quotations</span>
            </NavLink>

            {/* 2. Pipeline Kanban View */}
            <NavLink
              to="/pipeline"
              className={`workspace-tab ${isPipelineActive ? 'active' : ''}`}
            >
              <Columns3 size={15} />
              <span>Pipeline</span>
            </NavLink>

            {/* 3. Quotation Builder Tab */}
            <NavLink
              to={activeQuotationId ? `/quotation-builder/${activeQuotationId}` : '/quotation-builder'}
              className={({ isActive }) => `workspace-tab ${isActive ? 'active' : ''}`}
            >
              <FileSpreadsheet size={15} />
              <span>Builder</span>
              {activeQuotationId && <span className="workspace-tab-badge">Active</span>}
            </NavLink>

            {/* 4. Approval Tab */}
            <NavLink
              to="/approval"
              className={({ isActive }) => `workspace-tab ${isActive ? 'active' : ''}`}
            >
              <CheckCircle2 size={15} />
              <span>Approval</span>
            </NavLink>
          </nav>
        </div>

        {/* Right Nav Group: User status & Action Buttons */}
        <div className="workspace-nav-right">
          {/* User state / Loading skeleton */}
          {isLoadingUser ? (
            <div className="user-skeleton" title="Loading user..." />
          ) : currentUser ? (
            <div className="user-status-pill">
              <span className="user-status-name">{currentUser.name}</span>
              <span className="user-status-role">{currentUser.role}</span>
            </div>
          ) : null}

          {/* Action 1: Reload Data Button */}
          <button
            type="button"
            className={`action-btn action-btn-reload ${isReloading ? 'reloading' : ''}`}
            onClick={reloadData}
            disabled={isReloading}
            title={activeQuotationId ? `Reload data for quote ${activeQuotationId}` : 'Reload pipeline and pricing data'}
          >
            <RotateCw size={14} className={isReloading ? 'spin' : ''} />
            <span>{isReloading ? 'Reloading...' : 'Reload Data'}</span>
          </button>

          {/* Action 2: Go to Back-end Button */}
          <button
            type="button"
            className="action-btn action-btn-admin"
            onClick={handleGoToBackend}
            title="Navigate to Back-end Admin Dashboard"
          >
            <Sliders size={14} />
            <span>Go to Back-end</span>
          </button>

          {/* Action 3: Close Workspace Button */}
          <button
            type="button"
            className="action-btn action-btn-close"
            onClick={handleCloseWorkspace}
            title="Close workspace and return to sign in"
          >
            <LogOut size={14} />
            <span>Close Workspace</span>
          </button>
        </div>
      </header>

      {/* Sub-bar showing active quotation context & last reloaded time */}
      <div className="workspace-subbar">
        <div className="active-quote-indicator">
          <span>Active Context:</span>
          {activeQuotationId ? (
            <span className="active-quote-id">Quotation #{activeQuotationId}</span>
          ) : (
            <span>No quote selected (Pipeline overview)</span>
          )}
        </div>
        {lastReloadedAt && (
          <div className="last-refreshed">
            Last reloaded: {lastReloadedAt.toLocaleTimeString()}
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="workspace-content">
        <Outlet />
      </div>
    </div>
  );
};

export default WorkspaceLayout;
