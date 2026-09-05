import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../../context/WorkspaceContext';
import { apiFetch } from '../../utils/api';
import {
  ShoppingBag,
  FileText,
  Clock,
  CheckCircle2,
  AlertCircle,
  Download,
  ChevronRight,
  RefreshCw,
  ExternalLink
} from 'lucide-react';

export default function CustomerRoleDashboard() {
  const { user } = useWorkspace();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchDashboard = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/dashboards/customer');
      setData(res);
    } catch (err) {
      console.error('Failed to fetch customer dashboard:', err);
      setError(err.message || 'Failed to load Customer Portal dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  const getCustomerStatusBadge = (status) => {
    switch (status) {
      case 'SENT': return { label: 'Quote Ready for Review', class: 'badge-blue' };
      case 'PENDING_APPROVAL': return { label: 'Under Review', class: 'badge-amber' };
      case 'UNDER_NEGOTIATION': return { label: 'Counter-Offer Submitted', class: 'badge-purple' };
      case 'APPROVED': case 'READY_FOR_FULFILLMENT': case 'CONFIRMED': case 'FULFILLED':
        return { label: 'Confirmed / Active Order', class: 'badge-green' };
      case 'REJECTED': return { label: 'Declined', class: 'badge-red' };
      default: return { label: status, class: 'badge-secondary' };
    }
  };

  if (loading) {
    return (
      <div className="animate-fade-in" style={{ padding: '2rem', textAlign: 'center' }}>
        <div className="spinner" style={{ margin: '0 auto 1rem' }}></div>
        <p style={{ color: '#64748b' }}>Loading Customer Portal...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card empty-state animate-fade-in" style={{ padding: '3rem 1.5rem' }}>
        <AlertCircle size={48} color="#ef4444" />
        <h2 style={{ color: '#0f172a', marginTop: '0.75rem' }}>Customer Portal Error</h2>
        <p style={{ color: '#64748b', fontSize: '0.9rem' }}>{error}</p>
        <button onClick={fetchDashboard} className="btn btn-primary" style={{ marginTop: '1rem' }}>
          Retry
        </button>
      </div>
    );
  }

  const summary = data?.summary || {};
  const quotations = data?.quotations || [];

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* BANNER / HEADER */}
      <div
        className="card"
        style={{
          padding: '1.75rem',
          background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)',
          color: '#ffffff',
          borderRadius: '12px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ShoppingBag size={24} color="#60a5fa" />
              <span style={{ fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#93c5fd' }}>
                Customer Self-Service Portal
              </span>
            </div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: '0.5rem 0 0.25rem 0', color: '#ffffff' }}>
              Welcome, {user?.name || user?.email || 'Valued Customer'}
            </h1>
            <p style={{ fontSize: '0.92rem', color: '#dbeafe', margin: 0, maxWidth: '600px' }}>
              Review active quotations, submit counter-offers, approve order proposals, and track confirmed orders seamlessly.
            </p>
          </div>

          <button
            onClick={fetchDashboard}
            className="btn"
            style={{
              background: 'rgba(255, 255, 255, 0.15)',
              color: '#fff',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              backdropFilter: 'blur(4px)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <RefreshCw size={16} /> Refresh Quotes
          </button>
        </div>
      </div>

      {/* OVERVIEW METRIC CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        
        <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid #2563eb' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Total Quotations</span>
            <FileText size={20} color="#2563eb" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#0f172a', marginTop: '0.5rem' }}>
            {summary.totalQuotations || 0}
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid #f59e0b' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Quotes In Review</span>
            <Clock size={20} color="#f59e0b" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#d97706', marginTop: '0.5rem' }}>
            {summary.pendingQuotesCount || 0}
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid #8b5cf6' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Counter-Offers</span>
            <AlertCircle size={20} color="#8b5cf6" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#7c3aed', marginTop: '0.5rem' }}>
            {summary.underNegotiationCount || 0}
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid #10b981' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Confirmed Orders</span>
            <CheckCircle2 size={20} color="#10b981" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#059669', marginTop: '0.5rem' }}>
            {summary.confirmedOrdersCount || 0}
          </div>
        </div>

      </div>

      {/* MY QUOTATIONS TABLE */}
      <div className="card" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileText size={20} color="#2563eb" />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#0f172a', margin: 0 }}>
              My Quotations & Proposal History
            </h3>
          </div>
        </div>

        {quotations.length === 0 ? (
          <div className="empty-state" style={{ padding: '3rem', textAlign: 'center' }}>
            <ShoppingBag size={48} color="#cbd5e1" />
            <h4 style={{ color: '#0f172a', marginTop: '0.75rem' }}>No Quotations Found</h4>
            <p style={{ color: '#64748b', fontSize: '0.9rem', maxWidth: '400px', margin: '0.25rem auto 0' }}>
              Your account doesn't have any quotations listed yet. Contact your sales representative to generate a proposal.
            </p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table" style={{ width: '100%', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '0.75rem', textAlign: 'left' }}>Quote #</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left' }}>Date</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right' }}>Total Amount</th>
                  <th style={{ padding: '0.75rem', textAlign: 'center' }}>Status</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {quotations.map((q) => {
                  const badge = getCustomerStatusBadge(q.status);
                  return (
                    <tr key={q.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.75rem', fontWeight: 600, color: '#0f172a' }}>
                        {q.quoteNumber}
                      </td>
                      <td style={{ padding: '0.75rem', color: '#64748b', fontSize: '0.85rem' }}>
                        {new Date(q.createdAt).toLocaleDateString()}
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                        ${q.totalAmount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                        <span className={`badge ${badge.class}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                        <button
                          onClick={() => navigate(`/portal/quotation/${q.id}`)}
                          className="btn btn-primary"
                          style={{ padding: '0.3rem 0.75rem', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                        >
                          View & Respond <ChevronRight size={14} />
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

    </div>
  );
}
