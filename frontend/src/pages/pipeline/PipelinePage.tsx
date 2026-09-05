import React from 'react';
import { GitPullRequest } from 'lucide-react';

export const PipelinePage: React.FC = () => {
  return (
    <div className="page-container">
      <div className="page-header">
        <div className="page-badge">
          <GitPullRequest size={16} />
          <span>Pipeline</span>
        </div>
        <h1 className="page-title">Pipeline Management</h1>
        <p className="page-subtitle">
          Kanban board, deal stages, pipeline analytics, and progression tracking.
        </p>
      </div>

      <div className="placeholder-card">
        <div className="card-header">
          <h3>Deal Pipeline Board</h3>
          <span className="status-tag status-dev">Ready for Pipeline Features</span>
        </div>
        <p className="card-description">
          This route (<code>/pipeline</code>) will host deal stage columns, drag-and-drop opportunity cards, and conversion funnels.
        </p>
        <div className="details-grid">
          <div className="detail-item">
            <span className="detail-label">Route</span>
            <span className="detail-val">/pipeline</span>
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

export default PipelinePage;
