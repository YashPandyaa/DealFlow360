import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Check, X, ShieldAlert, ArrowLeftRight, Clock, User, AlertCircle, ArrowRight } from 'lucide-react';
import './Approval.css';

// --- TYPES ---
type ActionType = 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'RETURNED_FOR_REVISION';
type StepStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface ApprovalHistoryAction {
  id: string;
  actorName: string;
  actorRole: string;
  action: ActionType;
  reason?: string;
  timestamp: string;
}

export interface ApprovalStep {
  roleRequired: string; // 'Manager', 'Finance', etc.
  status: StepStatus;
}

export interface ApprovalRequest {
  id: string;
  quotationId: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVISION_NEEDED' | 'NOT_REQUIRED';
  isReopened: boolean;
  blendedRiskScore: number;
  flaggedLines: string[];
  chain: ApprovalStep[]; 
  history: ApprovalHistoryAction[];
}

// --- MOCK SCENARIOS ---
const MOCK_SCENARIOS: Record<string, ApprovalRequest> = {
  pendingManager: {
    id: 'req_1',
    quotationId: 'Q-1001',
    status: 'PENDING',
    isReopened: false,
    blendedRiskScore: 35,
    flaggedLines: ["Line 1 'Wifi 6 AP' discount exceeds 30% threshold (45%)"],
    chain: [
      { roleRequired: 'Manager', status: 'PENDING' }
    ],
    history: [
      { id: 'h1', actorName: 'Sarah Rep', actorRole: 'Sales Rep', action: 'SUBMITTED', timestamp: new Date(Date.now() - 3600000).toISOString() }
    ]
  },
  pendingFinance: {
    id: 'req_2',
    quotationId: 'Q-1002',
    status: 'PENDING',
    isReopened: false,
    blendedRiskScore: 78,
    flaggedLines: [
      "Total order discount exceeds 20%",
      "Payment terms non-standard (Net 90)"
    ],
    chain: [
      { roleRequired: 'Manager', status: 'APPROVED' },
      { roleRequired: 'Finance', status: 'PENDING' }
    ],
    history: [
      { id: 'h1', actorName: 'Sarah Rep', actorRole: 'Sales Rep', action: 'SUBMITTED', timestamp: new Date(Date.now() - 86400000).toISOString() },
      { id: 'h2', actorName: 'Mike Manager', actorRole: 'Manager', action: 'APPROVED', reason: 'Discount is justified for this strategic account.', timestamp: new Date(Date.now() - 3600000).toISOString() }
    ]
  },
  reopened: {
    id: 'req_3',
    quotationId: 'Q-1003',
    status: 'PENDING',
    isReopened: true,
    blendedRiskScore: 45,
    flaggedLines: ["Customer requested additional 5% off services"],
    chain: [
      { roleRequired: 'Manager', status: 'PENDING' }
    ],
    history: [
      { id: 'h1', actorName: 'Sarah Rep', actorRole: 'Sales Rep', action: 'SUBMITTED', timestamp: new Date(Date.now() - 172800000).toISOString() },
      { id: 'h2', actorName: 'Mike Manager', actorRole: 'Manager', action: 'APPROVED', timestamp: new Date(Date.now() - 170000000).toISOString() },
      { id: 'h3', actorName: 'Sarah Rep', actorRole: 'Sales Rep', action: 'SUBMITTED', reason: 'Customer counter-offer.', timestamp: new Date(Date.now() - 3600000).toISOString() }
    ]
  },
  notRequired: {
    id: 'req_4',
    quotationId: 'Q-1004',
    status: 'NOT_REQUIRED',
    isReopened: false,
    blendedRiskScore: 12,
    flaggedLines: [],
    chain: [],
    history: []
  }
};

const ROLES = ['Sales Rep', 'Manager', 'Finance'];

export const ApprovalPage: React.FC = () => {
  // Test Controls
  const [activeScenario, setActiveScenario] = useState<string>('pendingManager');
  const [impersonatedRole, setImpersonatedRole] = useState<string>('Manager');
  
  // State
  const [data, setData] = useState<ApprovalRequest>(MOCK_SCENARIOS.pendingManager);
  const [activeAction, setActiveAction] = useState<'REJECT' | 'RETURN' | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Switch scenario
  useEffect(() => {
    setData(JSON.parse(JSON.stringify(MOCK_SCENARIOS[activeScenario])));
    setActiveAction(null);
    setActionReason('');
  }, [activeScenario]);

  // Derived state
  const currentStepIndex = data.chain.findIndex(s => s.status === 'PENDING');
  const currentStep = currentStepIndex !== -1 ? data.chain[currentStepIndex] : null;
  const canAct = currentStep && currentStep.roleRequired === impersonatedRole;

  // Actions
  const handleAction = async (actionType: 'APPROVE' | 'REJECT' | 'RETURN') => {
    if (actionType !== 'APPROVE' && !actionReason.trim()) return;

    setIsSubmitting(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 800));

    setData(prev => {
      const next = { ...prev, chain: [...prev.chain], history: [...prev.history] };
      
      const newHistoryEntry: ApprovalHistoryAction = {
        id: crypto.randomUUID(),
        actorName: `Test ${impersonatedRole}`,
        actorRole: impersonatedRole,
        action: actionType === 'APPROVE' ? 'APPROVED' : actionType === 'REJECT' ? 'REJECTED' : 'RETURNED_FOR_REVISION',
        reason: actionReason,
        timestamp: new Date().toISOString()
      };
      
      next.history.unshift(newHistoryEntry); // Prepend to history

      if (currentStepIndex !== -1) {
        if (actionType === 'APPROVE') {
          next.chain[currentStepIndex].status = 'APPROVED';
          // Check if it was the last step
          if (currentStepIndex === next.chain.length - 1) {
            next.status = 'APPROVED';
          }
        } else if (actionType === 'REJECT') {
          next.chain[currentStepIndex].status = 'REJECTED';
          next.status = 'REJECTED';
        } else if (actionType === 'RETURN') {
          next.chain[currentStepIndex].status = 'REJECTED'; // Mark current as rejected/returned
          next.status = 'REVISION_NEEDED';
        }
      }

      return next;
    });

    setIsSubmitting(false);
    setActiveAction(null);
    setActionReason('');
  };

  // Render Helpers
  const renderIcon = (action: ActionType) => {
    switch(action) {
      case 'APPROVED': return <Check size={16} className="icon-app" />;
      case 'REJECTED': return <X size={16} className="icon-rej" />;
      case 'RETURNED_FOR_REVISION': return <ArrowLeftRight size={16} className="icon-rev" />;
      default: return <User size={16} className="icon-sub" />;
    }
  };

  if (data.status === 'NOT_REQUIRED') {
    return (
      <div className="page-container appr-container">
        <div className="appr-test-controls">
          <div className="appr-test-group">
            <strong>Scenario:</strong>
            <select className="appr-select" value={activeScenario} onChange={e => setActiveScenario(e.target.value)}>
              {Object.keys(MOCK_SCENARIOS).map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
        </div>
        <div className="appr-card" style={{ padding: '40px', textAlign: 'center' }}>
          <CheckCircle2 size={48} color="#10b981" style={{ margin: '0 auto 16px' }} />
          <h2>No Approval Required</h2>
          <p style={{ color: '#6b7280' }}>This quotation falls within standard thresholds and has bypassed the approval queue.</p>
          <Link to="/fulfillment" className="appr-fulfill-link">Proceed to Fulfillment <ArrowRight size={14} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: '4px' }} /></Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container appr-container">
      {/* Test Controls */}
      <div className="appr-test-controls">
        <div className="appr-test-group">
          <strong>Scenario:</strong>
          <select className="appr-select" value={activeScenario} onChange={e => setActiveScenario(e.target.value)}>
            {Object.keys(MOCK_SCENARIOS).map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
        <div className="appr-test-group">
          <strong>Impersonate Role:</strong>
          <select className="appr-select" value={impersonatedRole} onChange={e => setImpersonatedRole(e.target.value)}>
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>

      <div className="page-header" style={{ marginBottom: 0 }}>
        <div>
          <div className="page-badge">
            <CheckCircle2 size={16} />
            <span>Governance & Approval Matrix</span>
          </div>
          <h1 className="page-title">Approval Queue — {data.quotationId}</h1>
        </div>
      </div>

      {data.isReopened && (
        <div className="appr-banner appr-banner-reopened">
          <AlertCircle size={20} />
          <span><strong>New Request (Reopened):</strong> This quotation was previously approved but has been reopened due to a counter-offer or modification.</span>
        </div>
      )}

      {data.status === 'APPROVED' && (
        <div className="appr-banner appr-banner-success" style={{ flexDirection: 'column', alignItems: 'flex-start', padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '1.25rem' }}>
            <CheckCircle2 size={28} />
            <span><strong>Approved!</strong> All required gates have signed off.</span>
          </div>
          <Link to="/fulfillment" className="appr-fulfill-link" style={{ marginTop: '24px' }}>Proceed to Fulfillment <ArrowRight size={14} style={{ display: 'inline', verticalAlign: 'middle', marginLeft: '4px' }} /></Link>
        </div>
      )}

      <div className="appr-grid">
        {/* Main Column */}
        <div className="appr-main">
          
          <div className="appr-card">
            <div className="appr-card-header">
              <h3 className="appr-card-title"><ShieldAlert size={18} /> Risk Assessment</h3>
            </div>
            <div className="appr-card-body" style={{ display: 'flex', gap: '32px', alignItems: 'flex-start' }}>
              <div style={{ textAlign: 'center' }}>
                <div className={`appr-risk-score ${data.blendedRiskScore > 75 ? 'appr-risk-high' : data.blendedRiskScore > 40 ? 'appr-risk-med' : 'appr-risk-low'}`}>
                  {data.blendedRiskScore}
                </div>
                <div style={{ fontSize: '0.875rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>Blended Risk Score</div>
              </div>
              
              <div>
                <strong style={{ fontSize: '0.875rem' }}>Flagged Risk Factors:</strong>
                {data.flaggedLines.length > 0 ? (
                  <ul className="appr-flagged-list">
                    {data.flaggedLines.map((line, i) => <li key={i}>{line}</li>)}
                  </ul>
                ) : (
                  <p style={{ color: '#6b7280', fontSize: '0.875rem', marginTop: '8px' }}>No specific lines flagged.</p>
                )}
              </div>
            </div>
          </div>

          <div className="appr-card">
            <div className="appr-card-header">
              <h3 className="appr-card-title"><Clock size={18} /> Full Audit Trail</h3>
            </div>
            <div className="appr-card-body">
              <div className="appr-timeline">
                {data.history.map(entry => (
                  <div key={entry.id} className="appr-timeline-item">
                    <div className={`appr-timeline-icon icon-${entry.action.toLowerCase().substring(0,3)}`}>
                      {renderIcon(entry.action)}
                    </div>
                    <div className="appr-timeline-content">
                      <div className="appr-timeline-head">
                        <div>
                          <span className="appr-timeline-actor">{entry.actorName}</span>
                          <span className="appr-timeline-role">({entry.actorRole})</span>
                        </div>
                        <div className="appr-timeline-time">{new Date(entry.timestamp).toLocaleString()}</div>
                      </div>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#4b5563' }}>
                        {entry.action.replace(/_/g, ' ')}
                      </div>
                      {entry.reason && (
                        <div className="appr-timeline-reason">
                          "{entry.reason}"
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>

        {/* Sidebar */}
        <div className="appr-sidebar">
          
          <div className="appr-card">
            <div className="appr-card-header">
              <h3 className="appr-card-title">Approval Chain</h3>
            </div>
            <div className="appr-card-body">
              <div className="appr-chain">
                {data.chain.map((step, idx) => (
                  <div key={idx} className={`appr-step ${step.status === 'PENDING' ? 'is-pending' : ''}`}>
                    <div className="appr-step-left">
                      {step.status === 'APPROVED' ? <CheckCircle2 size={16} color="#16a34a" /> : 
                       step.status === 'REJECTED' ? <X size={16} color="#dc2626" /> : 
                       <Clock size={16} color="#4338ca" />}
                      {step.roleRequired}
                    </div>
                    <div className={`appr-step-status status-${step.status.toLowerCase().substring(0,4)}`}>
                      {step.status === 'PENDING' ? 'Awaiting' : step.status}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Action Bar */}
          {data.status === 'PENDING' && (
            <div className="appr-card">
              <div className="appr-card-header">
                <h3 className="appr-card-title">Your Action Required</h3>
              </div>
              <div className="appr-card-body">
                {!canAct ? (
                  <div className="appr-readonly">
                    <p style={{ margin: '0 0 8px 0', fontWeight: 600 }}>Read-only View</p>
                    <p style={{ margin: 0, fontSize: '0.75rem' }}>
                      You are logged in as <strong>{impersonatedRole}</strong>. 
                      This step requires action from a <strong>{currentStep?.roleRequired}</strong>.
                    </p>
                  </div>
                ) : (
                  <div className="appr-actions">
                    {!activeAction ? (
                      <>
                        <button type="button" className="appr-btn btn-approve" onClick={() => handleAction('APPROVE')} disabled={isSubmitting}>
                          <Check size={16} /> Approve Quote
                        </button>
                        <div style={{ display: 'flex', gap: '12px' }}>
                          <button type="button" className="appr-btn btn-return" onClick={() => setActiveAction('RETURN')} disabled={isSubmitting}>
                            <ArrowLeftRight size={16} /> Return
                          </button>
                          <button type="button" className="appr-btn btn-reject" onClick={() => setActiveAction('REJECT')} disabled={isSubmitting}>
                            <X size={16} /> Reject
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="appr-reason-box">
                        <h4 style={{ margin: '0 0 8px 0', fontSize: '0.875rem' }}>
                          Reason for {activeAction === 'REJECT' ? 'Rejection' : 'Revision'} (Required)
                        </h4>
                        <textarea 
                          className="appr-textarea"
                          placeholder="Please provide details..."
                          value={actionReason}
                          onChange={e => setActionReason(e.target.value)}
                        />
                        <div className="appr-btn-group">
                          <button type="button" className="appr-btn btn-cancel" onClick={() => { setActiveAction(null); setActionReason(''); }}>
                            Cancel
                          </button>
                          <button 
                            type="button" 
                            className="appr-btn btn-submit-reason"
                            onClick={() => handleAction(activeAction)}
                            disabled={!actionReason.trim() || isSubmitting}
                          >
                            {isSubmitting ? 'Submitting...' : 'Submit Decision'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default ApprovalPage;
