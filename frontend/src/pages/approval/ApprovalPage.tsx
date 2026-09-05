import React, { useEffect, useState } from 'react';
import { CheckCircle2, Check, X } from 'lucide-react';
import { useWorkspace } from '../workspace';

export const ApprovalPage: React.FC = () => {
  const { activeQuotationId, currentUser, registerReloadListener, isReloading } = useWorkspace();
  const [syncedNotice, setSyncedNotice] = useState<string | null>(null);

  // Listen for Reload Data events from Workspace top nav
  useEffect(() => {
    const unregister = registerReloadListener(() => {
      setSyncedNotice(`Approval policies and escalation matrix reloaded at ${new Date().toLocaleTimeString()}`);
      setTimeout(() => setSyncedNotice(null), 3000);
    });
    return unregister;
  }, [registerReloadListener]);

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="page-badge">
            <CheckCircle2 size={16} />
            <span>Governance & Approval Matrix</span>
          </div>
          <h1 className="page-title">Approval Queue</h1>
          <p className="page-subtitle">
            Manage multi-tier discount approval gates, finance thresholds, and contract sign-offs.
          </p>
        </div>

        {activeQuotationId && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" className="action-btn action-btn-close" style={{ fontSize: '0.85rem' }}>
              <X size={14} />
              <span>Reject Quote</span>
            </button>
            <button type="button" className="action-btn" style={{ fontSize: '0.85rem', color: '#34d399', borderColor: 'rgba(52, 211, 153, 0.3)' }}>
              <Check size={14} />
              <span>Approve Quote</span>
            </button>
          </div>
        )}
      </div>

      {syncedNotice && (
        <div style={{ padding: '8px 16px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '8px', color: '#34d399', fontSize: '0.85rem' }}>
          ✓ {syncedNotice}
        </div>
      )}

      <div className="placeholder-card">
        <div className="card-header">
          <h3>Approval Context</h3>
          <span className="status-tag status-dev">
            {activeQuotationId ? `Evaluating #${activeQuotationId}` : 'All Pending Approvals'}
          </span>
        </div>
        <p className="card-description">
          Reviewer: <strong>{currentUser?.name || 'Loading reviewer...'}</strong> ({currentUser?.role}). This screen dynamically synchronizes with <code>WorkspaceContext</code>.
        </p>

        <div className="details-grid">
          <div className="detail-item">
            <span className="detail-label">Active Target Quote</span>
            <span className="detail-val">{activeQuotationId || 'Global Queue'}</span>
          </div>
          <div className="detail-item">
            <span className="detail-label">Sync Status</span>
            <span className="detail-val">{isReloading ? 'Fetching approval rules...' : 'Up to date'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ApprovalPage;
