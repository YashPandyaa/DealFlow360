import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { GitPullRequest, ListFilter, LayoutGrid, ArrowRight, CheckCircle, Plus } from 'lucide-react';
import { useWorkspace } from '../workspace';

interface MockDeal {
  id: string;
  quoteNumber: string;
  client: string;
  amount: string;
  stage: 'Draft' | 'Internal Review' | 'Customer Review' | 'Approved' | 'Closed Won';
  updatedAt: string;
}

const INITIAL_DEALS: MockDeal[] = [
  { id: 'Q-2026-001', quoteNumber: 'Q-8492', client: 'Acme Global Corp', amount: '$148,000', stage: 'Draft', updatedAt: '10 mins ago' },
  { id: 'Q-2026-002', quoteNumber: 'Q-8493', client: 'Apex CyberTech', amount: '$74,500', stage: 'Internal Review', updatedAt: '25 mins ago' },
  { id: 'Q-2026-003', quoteNumber: 'Q-8494', client: 'Starlight Financial', amount: '$320,000', stage: 'Approved', updatedAt: '1 hour ago' },
  { id: 'Q-2026-004', quoteNumber: 'Q-8495', client: 'Nexus Retail Group', amount: '$92,000', stage: 'Customer Review', updatedAt: '2 hours ago' },
];

export const PipelinePage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { activeQuotationId, setActiveQuotationId, registerReloadListener } = useWorkspace();
  const [scenario, setScenario] = useState<'DEFAULT' | 'EMPTY'>('DEFAULT');
  const [reloadNotice, setReloadNotice] = useState<string | null>(null);

  const deals = scenario === 'EMPTY' ? [] : INITIAL_DEALS;

  const isListView = searchParams.get('view') === 'list';

  // Register reload listener to refresh mock data on top-nav Reload Data click
  useEffect(() => {
    const unregister = registerReloadListener(() => {
      setReloadNotice(`Data synced at ${new Date().toLocaleTimeString()}`);
      setTimeout(() => setReloadNotice(null), 3000);
    });
    return unregister;
  }, [registerReloadListener]);

  const handleSelectQuote = (quoteId: string) => {
    setActiveQuotationId(quoteId);
  };

  const handleOpenInBuilder = (quoteId: string) => {
    setActiveQuotationId(quoteId);
    navigate(`/quotation-builder/${quoteId}`);
  };

  const handleNewQuotation = () => {
    setActiveQuotationId(null);
    navigate('/quotation-builder');
  };

  return (
    <div className="page-container">
      {/* Test Controls */}
      <div style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid var(--border-color)', marginBottom: '16px', display: 'flex', gap: '12px', alignItems: 'center' }}>
        <strong style={{ fontSize: '0.85rem' }}>Scenario:</strong>
        <select 
          value={scenario} 
          onChange={e => setScenario(e.target.value as any)}
          style={{ background: 'transparent', color: 'white', border: '1px solid var(--border-color)', padding: '4px', borderRadius: '4px', fontSize: '0.85rem' }}
        >
          <option value="DEFAULT" style={{ color: 'black' }}>Default (4 quotes)</option>
          <option value="EMPTY" style={{ color: 'black' }}>Empty Pipeline</option>
        </select>
      </div>

      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="page-badge">
            <GitPullRequest size={16} />
            <span>{isListView ? 'Quotations List' : 'Pipeline Kanban'}</span>
          </div>
          <h1 className="page-title">
            {isListView ? 'Quotations Register' : 'Deal Pipeline Board'}
          </h1>
          <p className="page-subtitle">
            {isListView 
              ? 'Tabular view of active quotations, approval statuses, and values.' 
              : 'Stage-by-stage Kanban opportunity tracking with drag-and-drop progression.'}
          </p>
        </div>

        {/* View Toggle Switches and New Quote */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '8px', background: 'rgba(0,0,0,0.3)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <button
              type="button"
              onClick={() => setSearchParams({ view: 'list' })}
              className={`action-btn ${isListView ? 'action-btn-reload' : ''}`}
              style={{ fontSize: '0.8rem', padding: '6px 10px' }}
            >
              <ListFilter size={14} />
              <span>List View</span>
            </button>
            <button
              type="button"
              onClick={() => setSearchParams({})}
              className={`action-btn ${!isListView ? 'action-btn-reload' : ''}`}
              style={{ fontSize: '0.8rem', padding: '6px 10px' }}
            >
              <LayoutGrid size={14} />
              <span>Kanban View</span>
            </button>
          </div>
          
          <button
            type="button"
            onClick={handleNewQuotation}
            className="action-btn"
            style={{ background: '#4f46e5', color: 'white', borderColor: '#4338ca', fontSize: '0.8rem', padding: '8px 12px', height: '100%' }}
          >
            <Plus size={14} />
            <span>New Quotation</span>
          </button>
        </div>
      </div>

      {reloadNotice && (
        <div style={{ padding: '8px 16px', background: 'rgba(99, 102, 241, 0.15)', border: '1px solid rgba(99, 102, 241, 0.3)', borderRadius: '8px', color: '#c7d2fe', fontSize: '0.85rem' }}>
          ✓ {reloadNotice}
        </div>
      )}

      {/* Content depending on view mode */}
      {deals.length === 0 ? (
        <div style={{ 
          textAlign: 'center', 
          padding: '64px 20px', 
          background: 'var(--bg-secondary)', 
          border: '1px dashed var(--border-color)',
          borderRadius: '12px'
        }}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: '8px' }}>Your Pipeline is Empty</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '24px', fontSize: '0.9rem' }}>
            There are currently no active quotations in your pipeline. Get started by creating your first quote.
          </p>
          <button
            type="button"
            onClick={handleNewQuotation}
            className="action-btn"
            style={{ background: '#4f46e5', color: 'white', borderColor: '#4338ca', fontSize: '0.9rem', padding: '10px 16px', margin: '0 auto' }}
          >
            <Plus size={16} />
            <span>Create First Quotation</span>
          </button>
        </div>
      ) : isListView ? (
        <div className="placeholder-card" style={{ padding: '0', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: '1rem', color: '#fff' }}>All Active Quotations</h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{deals.length} records</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.02)', color: 'var(--text-muted)' }}>
                <th style={{ padding: '12px 20px' }}>Quote #</th>
                <th style={{ padding: '12px 20px' }}>Client</th>
                <th style={{ padding: '12px 20px' }}>Amount</th>
                <th style={{ padding: '12px 20px' }}>Stage</th>
                <th style={{ padding: '12px 20px' }}>Updated</th>
                <th style={{ padding: '12px 20px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {deals.map((deal) => {
                const isSelected = activeQuotationId === deal.id;
                return (
                  <tr 
                    key={deal.id} 
                    style={{ 
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      background: isSelected ? 'rgba(99, 102, 241, 0.08)' : 'transparent' 
                    }}
                  >
                    <td style={{ padding: '12px 20px', fontWeight: 600, color: '#e0e7ff' }}>
                      {deal.quoteNumber}
                    </td>
                    <td style={{ padding: '12px 20px' }}>{deal.client}</td>
                    <td style={{ padding: '12px 20px', fontWeight: 600 }}>{deal.amount}</td>
                    <td style={{ padding: '12px 20px' }}>
                      <span className="status-tag status-active">{deal.stage}</span>
                    </td>
                    <td style={{ padding: '12px 20px', color: 'var(--text-muted)' }}>{deal.updatedAt}</td>
                    <td style={{ padding: '12px 20px', textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={() => handleSelectQuote(deal.id)}
                        className="action-btn"
                        style={{ fontSize: '0.75rem', padding: '4px 8px', marginRight: '6px' }}
                      >
                        {isSelected ? '✓ Selected' : 'Set Active'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenInBuilder(deal.id)}
                        className="action-btn action-btn-reload"
                        style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                      >
                        <span>Open Builder</span>
                        <ArrowRight size={12} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
          {['Draft', 'Internal Review', 'Customer Review', 'Approved'].map((stageName) => {
            const stageDeals = deals.filter(d => d.stage === stageName);
            return (
              <div 
                key={stageName}
                style={{ 
                  background: 'var(--bg-secondary)', 
                  border: '1px solid var(--border-color)', 
                  borderRadius: '10px', 
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#fff' }}>{stageName}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{stageDeals.length}</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {stageDeals.map((deal) => (
                    <div 
                      key={deal.id}
                      onClick={() => handleOpenInBuilder(deal.id)}
                      style={{ 
                        background: activeQuotationId === deal.id ? 'rgba(99, 102, 241, 0.15)' : 'var(--bg-tertiary)',
                        border: activeQuotationId === deal.id ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid rgba(255,255,255,0.06)',
                        borderRadius: '8px',
                        padding: '12px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#c7d2fe' }}>{deal.quoteNumber}</span>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{deal.amount}</span>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                        {deal.client}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        <span>{deal.updatedAt}</span>
                        {activeQuotationId === deal.id && (
                          <span style={{ color: '#34d399', display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <CheckCircle size={10} /> Active
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PipelinePage;
