import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../../context/WorkspaceContext';
import { apiFetch } from '../../utils/api';
import {
  CheckSquare,
  ShieldAlert,
  Clock,
  TrendingUp,
  DollarSign,
  AlertTriangle,
  ChevronRight,
  ShieldCheck,
  CheckCircle,
  XCircle,
  FileText
} from 'lucide-react';

export default function ManagerRoleDashboard() {
  const { setActiveQuotationId, reloadCounter } = useWorkspace();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchManagerData = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/dashboards/manager');
      setData(res);
    } catch (err) {
      setError(err.message || 'Failed to load Sales Manager Dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchManagerData();
  }, [reloadCounter]);

  const handleInspectQuote = (quoteId) => {
    setActiveQuotationId(quoteId);
    navigate('/workspace/approval');
  };

  const getRiskBadgeClass = (level) => {
    switch (level?.toUpperCase()) {
      case 'CRITICAL': return 'badge-red';
      case 'HIGH': return 'badge-amber';
      case 'MEDIUM': return 'badge-purple';
      default: return 'badge-green';
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      
      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#0f172a' }}>Sales Manager Governance Dashboard</h1>
            <span className="badge badge-amber">Approvals & Team Oversight</span>
          </div>
          <p style={{ color: '#475569', fontSize: '0.85rem' }}>
            Monitor risk-triggered approval requests, evaluate team discount compliance & authorize quotations
          </p>
        </div>

        <button onClick={() => navigate('/workspace/approval')} className="btn btn-primary">
          <CheckSquare size={16} />
          <span>Open Full Approval Queue</span>
        </button>
      </div>

      {error && (
        <div className="badge-red" style={{ padding: '0.75rem 1rem', borderRadius: '8px', fontSize: '0.85rem' }}>
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      {loading || !data ? (
        <div className="empty-state">
          <span className="spinner" style={{ width: '2rem', height: '2rem' }} />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* KPI METRICS GRID */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            
            <div className="card card-glass" style={{ padding: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: '600', color: '#475569' }}>PENDING APPROVALS</div>
              <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#d97706' }}>{data.metrics.pendingApprovalsCount}</div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Deals requiring review</div>
            </div>

            <div className="card card-glass" style={{ padding: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: '600', color: '#475569' }}>VALUE AWAITING APPROVAL</div>
              <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#2563eb' }}>${data.metrics.totalValueAwaitingApproval.toLocaleString()}</div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Gross deal value</div>
            </div>

            <div className="card card-glass" style={{ padding: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: '600', color: '#475569' }}>HIGH / CRITICAL RISK DEALS</div>
              <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#dc2626' }}>{data.metrics.highRiskCount + data.metrics.criticalRiskCount}</div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                <strong style={{ color: '#dc2626' }}>{data.metrics.criticalRiskCount}</strong> Critical Risk
              </div>
            </div>

            <div className="card card-glass" style={{ padding: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: '600', color: '#475569' }}>APPROVED TODAY</div>
              <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#059669' }}>{data.metrics.approvedToday}</div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Authorizations cleared</div>
            </div>

            <div className="card card-glass" style={{ padding: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: '600', color: '#475569' }}>REJECTED TODAY</div>
              <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#dc2626' }}>{data.metrics.rejectedToday}</div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Deals sent back</div>
            </div>

          </div>

          {/* APPROVAL QUEUE TABLE */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: '700', color: '#0f172a' }}>Priority Approval Requests Queue</h3>
              <span className="badge badge-purple">{data.approvalQueue.length} Pending</span>
            </div>

            {data.approvalQueue.length === 0 ? (
              <div className="empty-state" style={{ padding: '2.5rem 1rem' }}>
                <ShieldCheck size={38} color="#059669" />
                <p style={{ marginTop: '0.5rem', color: '#475569' }}>All sales quotations are within governance limits. No pending approvals.</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Quote Number</th>
                      <th>Customer Account</th>
                      <th>Sales Representative</th>
                      <th>Total Amount</th>
                      <th>Discount %</th>
                      <th>Risk Score & Level</th>
                      <th>Required Action</th>
                      <th style={{ textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.approvalQueue.map((item) => (
                      <tr key={item.id} style={{ cursor: 'pointer' }} onClick={() => handleInspectQuote(item.quotationId)}>
                        <td style={{ fontWeight: '700', color: '#2563eb' }}>{item.quoteNumber}</td>
                        <td style={{ fontWeight: '600', color: '#0f172a' }}>{item.customerName}</td>
                        <td>{item.salesRepName}</td>
                        <td style={{ fontWeight: '700', color: '#059669' }}>${item.totalAmount.toFixed(2)}</td>
                        <td><span className="badge badge-purple">{item.discountPercent}%</span></td>
                        <td>
                          <span className={`badge ${getRiskBadgeClass(item.riskLevel)}`}>
                            {item.riskScore} ({item.riskLevel})
                          </span>
                        </td>
                        <td><span className="badge badge-amber">{item.currentStep}</span></td>
                        <td style={{ textAlign: 'right' }}>
                          <button onClick={() => handleInspectQuote(item.quotationId)} className="btn btn-primary btn-sm">
                            Inspect & Act
                            <ChevronRight size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      )}

    </div>
  );
}
