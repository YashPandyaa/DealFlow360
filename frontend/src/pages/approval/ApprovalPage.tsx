import React from 'react';
import { CheckCircle2 } from 'lucide-react';

export const ApprovalPage: React.FC = () => {
  return (
    <div className="page-container">
      <div className="page-header">
        <div className="page-badge">
          <CheckCircle2 size={16} />
          <span>Approval</span>
        </div>
        <h1 className="page-title">Approval & Governance</h1>
        <p className="page-subtitle">
          Review pending quote approvals, escalation chains, audit history, and sign-offs.
        </p>
      </div>

      <div className="placeholder-card">
        <div className="card-header">
          <h3>Approval Center</h3>
          <span className="status-tag status-dev">Ready for Workflow Logic</span>
        </div>
        <p className="card-description">
          This route (<code>/approval</code>) manages manager/finance approval queues, status actions, and notification tracking.
        </p>
        <div className="details-grid">
          <div className="detail-item">
            <span className="detail-label">Route</span>
            <span className="detail-val">/approval</span>
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

export default ApprovalPage;
