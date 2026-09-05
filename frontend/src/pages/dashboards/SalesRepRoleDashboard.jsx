import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../../context/WorkspaceContext';
import { apiFetch } from '../../utils/api';
import {
  FileText,
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  PlusCircle,
  ArrowRight,
  TrendingUp,
  Briefcase,
  Layers,
  ChevronRight,
  Filter,
  ShieldCheck,
  CheckSquare
} from 'lucide-react';

export default function SalesRepRoleDashboard() {
  const { user } = useWorkspace();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'PENDING_APPROVAL' | 'APPROVED' | 'DRAFT' | 'CONFIRMED'

  const fetchDashboard = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/dashboards/sales-rep');
      setData(res);
    } catch (err) {
      console.error('Failed to fetch sales rep dashboard:', err);
      setError(err.message || 'Failed to load Sales Rep dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  const getStatusBadge = (status, currentStep) => {
    switch (status) {
      case 'DRAFT':
        return { label: 'Draft', class: 'badge-secondary' };
      case 'PENDING_APPROVAL':
        return {
          label: currentStep === 'FINANCE' ? 'Pending Finance Review' : 'Pending Manager Review',
          class: 'badge-amber'
        };
      case 'APPROVED':
      case 'READY_FOR_FULFILLMENT':
        return { label: 'Approved', class: 'badge-green' };
      case 'REJECTED':
        return { label: 'Rejected', class: 'badge-red' };
      case 'SENT':
        return { label: 'Sent to Customer', class: 'badge-blue' };
      case 'UNDER_NEGOTIATION':
        return { label: 'Counter-Offer Pending', class: 'badge-purple' };
      case 'CONFIRMED':
      case 'FULFILLED':
        return { label: 'Order Confirmed', class: 'badge-green' };
      default:
        return { label: status, class: 'badge-secondary' };
    }
  };

  if (loading) {
    return (
      <div className="animate-fade-in" style={{ padding: '2rem', textAlign: 'center' }}>
        <div className="spinner" style={{ margin: '0 auto 1rem' }}></div>
        <p style={{ color: '#64748b' }}>Loading Sales Representative Workspace...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card empty-state animate-fade-in" style={{ padding: '3rem 1.5rem' }}>
        <AlertTriangle size={48} color="#ef4444" />
        <h2 style={{ color: '#0f172a', marginTop: '0.75rem' }}>Sales Dashboard Error</h2>
        <p style={{ color: '#64748b', fontSize: '0.9rem' }}>{error}</p>
        <button onClick={fetchDashboard} className="btn btn-primary" style={{ marginTop: '1rem' }}>
          Retry
        </button>
      </div>
    );
  }

  const overview = data?.overview || {};
  const myQuotations = data?.myQuotations || [];
  const myDealsHealth = data?.myDealsHealth || [];

  // Filtered quotations based on selected tab
  const filteredQuotations = myQuotations.filter((q) => {
    if (statusFilter === 'ALL') return true;
    if (statusFilter === 'PENDING_APPROVAL') return q.status === 'PENDING_APPROVAL';
    if (statusFilter === 'APPROVED') return q.status === 'APPROVED' || q.status === 'READY_FOR_FULFILLMENT';
    if (statusFilter === 'DRAFT') return q.status === 'DRAFT';
    if (statusFilter === 'CONFIRMED') return q.status === 'CONFIRMED' || q.status === 'FULFILLED';
    return true;
  });

  const pendingApprovalQuotes = myQuotations.filter((q) => q.status === 'PENDING_APPROVAL');
  const approvedQuotes = myQuotations.filter((q) => q.status === 'APPROVED' || q.status === 'READY_FOR_FULFILLMENT');

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* HEADER BAR */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <Briefcase size={28} color="#2563eb" />
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
              Sales Representative Dashboard
            </h1>
          </div>
          <p style={{ color: '#64748b', fontSize: '0.9rem', marginTop: '0.25rem', margin: 0 }}>
            Welcome back, <strong>{user?.name || 'Sales Rep'}</strong>. Track your quotation approval status and deal pipeline.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={() => navigate('/workspace/quotation/new')}
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}
          >
            <PlusCircle size={18} />
            Create New Quotation
          </button>
        </div>
      </div>

      {/* KPI METRIC CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        
        <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid #2563eb' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Total Pipeline Value</span>
            <DollarSign size={20} color="#2563eb" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#0f172a', marginTop: '0.5rem' }}>
            ${overview.totalSalesValue?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || '0.00'}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
            Across {overview.totalQuotations || 0} quotations
          </div>
        </div>

        {/* PENDING APPROVAL CARD (CLICKABLE FILTER) */}
        <div
          className="card"
          onClick={() => setStatusFilter(statusFilter === 'PENDING_APPROVAL' ? 'ALL' : 'PENDING_APPROVAL')}
          style={{
            padding: '1.25rem',
            borderLeft: '4px solid #f59e0b',
            cursor: 'pointer',
            backgroundColor: statusFilter === 'PENDING_APPROVAL' ? '#fffbeb' : '#ffffff'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Pending Approval</span>
            <Clock size={20} color="#f59e0b" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#d97706', marginTop: '0.5rem' }}>
            {overview.pendingApprovalCount || 0}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#d97706', marginTop: '0.25rem', fontWeight: 500 }}>
            Awaiting Manager/Finance review
          </div>
        </div>

        {/* APPROVED QUOTES CARD (CLICKABLE FILTER) */}
        <div
          className="card"
          onClick={() => setStatusFilter(statusFilter === 'APPROVED' ? 'ALL' : 'APPROVED')}
          style={{
            padding: '1.25rem',
            borderLeft: '4px solid #10b981',
            cursor: 'pointer',
            backgroundColor: statusFilter === 'APPROVED' ? '#ecfdf5' : '#ffffff'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Approved Quotes</span>
            <CheckCircle size={20} color="#10b981" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#059669', marginTop: '0.5rem' }}>
            {overview.approvedCount || 0}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#059669', marginTop: '0.25rem', fontWeight: 500 }}>
            Ready for customer dispatch
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid #8b5cf6' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Confirmed Orders</span>
            <TrendingUp size={20} color="#8b5cf6" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#7c3aed', marginTop: '0.5rem' }}>
            {overview.confirmedCount || 0}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
            Accepted & converting to order
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid #64748b' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Draft Quotes</span>
            <FileText size={20} color="#64748b" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#475569', marginTop: '0.5rem' }}>
            {overview.draftCount || 0}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
            In progress drafts
          </div>
        </div>

      </div>

      {/* TWO COLUMN CONTENT AREA */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
        
        {/* RECENT QUOTATIONS TABLE WITH STATUS FILTER TABS */}
        <div className="card" style={{ padding: '1.5rem' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FileText size={20} color="#2563eb" />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#0f172a', margin: 0 }}>
                My Quotations & Approval Status
              </h3>
            </div>

            {/* FILTER TABS */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              {[
                { id: 'ALL', label: `All (${myQuotations.length})` },
                { id: 'PENDING_APPROVAL', label: `Pending (${pendingApprovalQuotes.length})` },
                { id: 'APPROVED', label: `Approved (${approvedQuotes.length})` },
                { id: 'DRAFT', label: `Drafts (${overview.draftCount || 0})` }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setStatusFilter(tab.id)}
                  className={`btn btn-sm ${statusFilter === tab.id ? 'btn-primary' : 'btn-outline'}`}
                  style={{ fontSize: '0.78rem', padding: '0.25rem 0.6rem' }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {filteredQuotations.length === 0 ? (
            <div className="empty-state" style={{ padding: '2rem', textAlign: 'center' }}>
              <FileText size={36} color="#94a3b8" />
              <p style={{ color: '#64748b', marginTop: '0.5rem' }}>No quotations match filter '{statusFilter}'.</p>
              <button
                onClick={() => setStatusFilter('ALL')}
                className="btn btn-secondary"
                style={{ marginTop: '0.75rem' }}
              >
                Clear Filter
              </button>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table" style={{ width: '100%', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ padding: '0.75rem', textAlign: 'left' }}>Quote #</th>
                    <th style={{ padding: '0.75rem', textAlign: 'left' }}>Customer</th>
                    <th style={{ padding: '0.75rem', textAlign: 'right' }}>Total Amount</th>
                    <th style={{ padding: '0.75rem', textAlign: 'center' }}>Approval Status</th>
                    <th style={{ padding: '0.75rem', textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredQuotations.map((q) => {
                    const currentStep = q.approvalRequests?.[0]?.currentStep;
                    const badge = getStatusBadge(q.status, currentStep);
                    return (
                      <tr key={q.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '0.75rem', fontWeight: 600, color: '#0f172a' }}>
                          {q.quoteNumber}
                        </td>
                        <td style={{ padding: '0.75rem', color: '#475569' }}>
                          {q.customerName || 'Standard Customer'}
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 600, color: '#0f172a' }}>
                          ${q.totalAmount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                          <span className={`badge ${badge.class}`}>
                            {badge.label}
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                          <button
                            onClick={() => navigate(q.status === 'PENDING_APPROVAL' || q.status === 'APPROVED' ? `/workspace/approvals/${q.approvalRequests?.[0]?.id || q.id}` : `/workspace/quotations/${q.id}`)}
                            className="btn btn-secondary"
                            style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
                          >
                            View Details
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* DEAL HEALTH & URGENT APPROVAL TRACKER */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* PENDING APPROVAL TRACKER */}
          <div className="card" style={{ padding: '1.5rem', borderLeft: '4px solid #f59e0b' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <Clock size={20} color="#f59e0b" />
              <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#0f172a', margin: 0 }}>
                Pending Approvals ({pendingApprovalQuotes.length})
              </h3>
            </div>

            {pendingApprovalQuotes.length === 0 ? (
              <p style={{ color: '#64748b', fontSize: '0.85rem' }}>No quotations currently waiting for approval.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {pendingApprovalQuotes.map((q) => {
                  const step = q.approvalRequests?.[0]?.currentStep || 'MANAGER';
                  return (
                    <div
                      key={q.id}
                      onClick={() => navigate(`/workspace/approvals/${q.approvalRequests?.[0]?.id || q.id}`)}
                      style={{
                        padding: '0.85rem',
                        borderRadius: '8px',
                        background: '#fffbeb',
                        border: '1px solid #fef3c7',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#0f172a' }}>
                          {q.quoteNumber} - {q.customerName || 'Customer'}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#d97706', marginTop: '0.15rem', fontWeight: 500 }}>
                          ${q.totalAmount?.toLocaleString()} &bull; Pending {step} Review
                        </div>
                      </div>
                      <ChevronRight size={18} color="#d97706" />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* APPROVED QUOTES READY FOR CUSTOMER */}
          <div className="card" style={{ padding: '1.5rem', borderLeft: '4px solid #10b981' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <CheckSquare size={20} color="#10b981" />
              <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#0f172a', margin: 0 }}>
                Approved Quotes ({approvedQuotes.length})
              </h3>
            </div>

            {approvedQuotes.length === 0 ? (
              <p style={{ color: '#64748b', fontSize: '0.85rem' }}>No recently approved quotes ready for dispatch.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {approvedQuotes.map((q) => (
                  <div
                    key={q.id}
                    onClick={() => navigate(`/workspace/quotations/${q.id}`)}
                    style={{
                      padding: '0.85rem',
                      borderRadius: '8px',
                      background: '#ecfdf5',
                      border: '1px solid #a7f3d0',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#0f172a' }}>
                        {q.quoteNumber} - {q.customerName || 'Customer'}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#059669', marginTop: '0.15rem', fontWeight: 500 }}>
                        ${q.totalAmount?.toLocaleString()} &bull; Approved
                      </div>
                    </div>
                    <ChevronRight size={18} color="#059669" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* QUICK SHORTCUTS */}
          <div className="card" style={{ padding: '1.5rem', background: '#eff6ff', borderColor: '#bfdbfe' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#1e40af', marginTop: 0, marginBottom: '0.75rem' }}>
              Rep Tools & Actions
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <button
                onClick={() => navigate('/workspace/quotation/new')}
                className="btn btn-primary"
                style={{ width: '100%', justifyContent: 'center' }}
              >
                + Create Quotation
              </button>
              <button
                onClick={() => navigate('/workspace/pipeline')}
                className="btn btn-secondary"
                style={{ width: '100%', justifyContent: 'center', background: '#fff' }}
              >
                Pipeline Overview
              </button>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
