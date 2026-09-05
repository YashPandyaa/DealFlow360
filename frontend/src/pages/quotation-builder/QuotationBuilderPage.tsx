import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { FileSpreadsheet, Plus, Save } from 'lucide-react';
import { useWorkspace } from '../workspace';

export const QuotationBuilderPage: React.FC = () => {
  const { id } = useParams<{ id?: string }>();
  const { activeQuotationId, setActiveQuotationId, registerReloadListener, isReloading } = useWorkspace();
  const [syncedNotice, setSyncedNotice] = useState<string | null>(null);

  const currentId = id || activeQuotationId;

  // Sync route param with active quotation context
  useEffect(() => {
    if (id && id !== activeQuotationId) {
      setActiveQuotationId(id);
    }
  }, [id, activeQuotationId, setActiveQuotationId]);

  // Listen for Reload Data events from Workspace top nav
  useEffect(() => {
    const unregister = registerReloadListener(() => {
      setSyncedNotice(`Pricing and line items re-calculated at ${new Date().toLocaleTimeString()}`);
      setTimeout(() => setSyncedNotice(null), 3000);
    });
    return unregister;
  }, [registerReloadListener]);

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="page-badge">
            <FileSpreadsheet size={16} />
            <span>CPQ Quotation Engine</span>
          </div>
          <h1 className="page-title">
            {currentId ? `Quotation Builder — #${currentId}` : 'New Quotation Builder'}
          </h1>
          <p className="page-subtitle">
            Configure line items, discount margins, and pricing terms. Triggering Reload Data refreshes inventory stock and dynamic rate cards.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="button" className="action-btn" style={{ fontSize: '0.85rem' }}>
            <Plus size={14} />
            <span>Add Item</span>
          </button>
          <button type="button" className="action-btn action-btn-reload" style={{ fontSize: '0.85rem' }}>
            <Save size={14} />
            <span>Save Quote</span>
          </button>
        </div>
      </div>

      {syncedNotice && (
        <div style={{ padding: '8px 16px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '8px', color: '#34d399', fontSize: '0.85rem' }}>
          ✓ {syncedNotice}
        </div>
      )}

      <div className="placeholder-card">
        <div className="card-header">
          <h3>Quotation Configuration Surface</h3>
          <span className="status-tag status-dev">
            {currentId ? `Loaded Quotation: ${currentId}` : 'No Quote ID bound'}
          </span>
        </div>
        <p className="card-description">
          This builder is subscribed to <code>WorkspaceContext</code>. Dev B or builder modules can read <code>activeQuotationId</code>, <code>currentUser</code>, and subscribe to <code>registerReloadListener()</code> for live pricing recalculations.
        </p>

        <div className="details-grid">
          <div className="detail-item">
            <span className="detail-label">Active Quotation ID</span>
            <span className="detail-val">{currentId || 'None (New Draft)'}</span>
          </div>
          <div className="detail-item">
            <span className="detail-label">Reload State</span>
            <span className="detail-val">{isReloading ? 'Fetching latest rates...' : 'Idle & Ready'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuotationBuilderPage;
