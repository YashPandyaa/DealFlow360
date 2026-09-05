import React from 'react';
import { Lock } from 'lucide-react';

export const AuthPage: React.FC = () => {
  return (
    <div className="page-container">
      <div className="page-header">
        <div className="page-badge">
          <Lock size={16} />
          <span>Authentication</span>
        </div>
        <h1 className="page-title">Auth & Access Control</h1>
        <p className="page-subtitle">
          Placeholder for login, registration, SSO, and user authentication management.
        </p>
      </div>

      <div className="placeholder-card">
        <div className="card-header">
          <h3>Authentication Module</h3>
          <span className="status-tag status-dev">Ready for Dev B / Auth Integration</span>
        </div>
        <p className="card-description">
          This route (<code>/auth</code>) is reserved for authentication workflows, session validation, and credential handling.
        </p>
        <div className="details-grid">
          <div className="detail-item">
            <span className="detail-label">Route</span>
            <span className="detail-val">/auth</span>
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

export default AuthPage;
