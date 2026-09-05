import React from 'react';
import { LayoutDashboard } from 'lucide-react';

export const WorkspacePage: React.FC = () => {
  return (
    <div className="page-container">
      <div className="page-header">
        <div className="page-badge">
          <LayoutDashboard size={16} />
          <span>Workspace</span>
        </div>
        <h1 className="page-title">DealFlow Workspace</h1>
        <p className="page-subtitle">
          Overview of active deals, recent activities, team metrics, and fast action shortcuts.
        </p>
      </div>

      <div className="placeholder-card">
        <div className="card-header">
          <h3>Workspace Hub</h3>
          <span className="status-tag status-active">Active Workspace Route</span>
        </div>
        <p className="card-description">
          This route (<code>/workspace</code> or default <code>/</code>) serves as the primary dashboard for users managing deal flows.
        </p>
        <div className="details-grid">
          <div className="detail-item">
            <span className="detail-label">Route</span>
            <span className="detail-val">/workspace</span>
          </div>
          <div className="detail-item">
            <span className="detail-label">Status</span>
            <span className="detail-val">Scaffolded Placeholder</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkspacePage;
