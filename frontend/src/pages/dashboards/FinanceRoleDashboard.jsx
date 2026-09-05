import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../../context/WorkspaceContext';
import { apiFetch } from '../../utils/api';
import {
  CreditCard,
  DollarSign,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Package,
  Layers,
  FileText,
  Building,
  ArrowRight,
  TrendingUp,
  RefreshCw
} from 'lucide-react';

export default function FinanceRoleDashboard() {
  const { user } = useWorkspace();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchDashboard = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/dashboards/finance');
      setData(res);
    } catch (err) {
      console.error('Failed to fetch finance dashboard:', err);
      setError(err.message || 'Failed to load Finance & Operations dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  if (loading) {
    return (
      <div className="animate-fade-in" style={{ padding: '2rem', textAlign: 'center' }}>
        <div className="spinner" style={{ margin: '0 auto 1rem' }}></div>
        <p style={{ color: '#64748b' }}>Loading Finance & Operations Dashboard...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card empty-state animate-fade-in" style={{ padding: '3rem 1.5rem' }}>
        <AlertTriangle size={48} color="#ef4444" />
        <h2 style={{ color: '#0f172a', marginTop: '0.75rem' }}>Finance Workspace Error</h2>
        <p style={{ color: '#64748b', fontSize: '0.9rem' }}>{error}</p>
        <button onClick={fetchDashboard} className="btn btn-primary" style={{ marginTop: '1rem' }}>
          Retry
        </button>
      </div>
    );
  }

  const metrics = data?.metrics || {};
  const financeApprovals = data?.financeApprovals || [];
  const billingEntries = data?.billingEntries || [];
  const subscriptions = data?.subscriptions || [];
  const fulfillmentOrders = data?.fulfillmentOrders || [];
  const warehouses = data?.warehouses || [];

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* HEADER BAR */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <CreditCard size={28} color="#059669" />
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
              Finance & Operations Dashboard
            </h1>
          </div>
          <p style={{ color: '#64748b', fontSize: '0.9rem', marginTop: '0.25rem', margin: 0 }}>
            Manage financial risk approvals, recurring subscriptions, invoices, and fulfillment operations.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button onClick={fetchDashboard} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
      </div>

      {/* KPI METRIC CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        
        <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid #f59e0b' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Finance Approvals</span>
            <Clock size={20} color="#f59e0b" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#d97706', marginTop: '0.5rem' }}>
            {metrics.financeApprovalsCount || 0}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
            Pending financial review
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid #10b981' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Total Revenue</span>
            <DollarSign size={20} color="#10b981" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#059669', marginTop: '0.5rem' }}>
            ${metrics.totalRevenue?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || '0.00'}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
            Collected payments
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid #2563eb' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Active Subscriptions</span>
            <RefreshCw size={20} color="#2563eb" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#2563eb', marginTop: '0.5rem' }}>
            {metrics.activeSubscriptionsCount || 0}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
            Recurring billing contracts
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid #8b5cf6' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Pending Invoices</span>
            <CreditCard size={20} color="#8b5cf6" />
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#7c3aed', marginTop: '0.5rem' }}>
            {metrics.pendingInvoices || 0}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
            Out of {metrics.totalInvoices || 0} total invoices
          </div>
        </div>

      </div>

      {/* FINANCE APPROVALS QUEUE */}
      <div className="card" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Clock size={20} color="#f59e0b" />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#0f172a', margin: 0 }}>
              Finance Risk Approvals Queue ({financeApprovals.length})
            </h3>
          </div>
        </div>

        {financeApprovals.length === 0 ? (
          <div className="empty-state" style={{ padding: '2rem', textAlign: 'center' }}>
            <CheckCircle2 size={36} color="#10b981" />
            <p style={{ color: '#64748b', marginTop: '0.5rem' }}>No pending finance approvals! All quotes up to date.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table" style={{ width: '100%', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '0.75rem', textAlign: 'left' }}>Quote #</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left' }}>Customer</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left' }}>Sales Rep</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right' }}>Total Amount</th>
                  <th style={{ padding: '0.75rem', textAlign: 'center' }}>Risk Score</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {financeApprovals.map((req) => (
                  <tr key={req.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.75rem', fontWeight: 600, color: '#0f172a' }}>
                      {req.quotation?.quoteNumber || 'N/A'}
                    </td>
                    <td style={{ padding: '0.75rem', color: '#475569' }}>
                      {req.quotation?.customerName || 'Customer'}
                    </td>
                    <td style={{ padding: '0.75rem', color: '#475569' }}>
                      {req.quotation?.user?.name || 'Sales Rep'}
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 600, color: '#0f172a' }}>
                      ${req.quotation?.totalAmount?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                      <span className={`badge ${req.blendedRiskScore > 50 ? 'badge-red' : 'badge-amber'}`}>
                        {req.blendedRiskScore} / 100
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                      <button
                        onClick={() => navigate(`/workspace/approvals/${req.id}`)}
                        className="btn btn-primary"
                        style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
                      >
                        Review Approval
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* TWO COLUMN GRID FOR BILLING & FULFILLMENT */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        
        {/* RECENT BILLING / INVOICING */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <CreditCard size={20} color="#2563eb" />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#0f172a', margin: 0 }}>
                Recent Invoices & Billing
              </h3>
            </div>
            <button
              onClick={() => navigate('/workspace/billing')}
              className="btn btn-secondary"
              style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
            >
              View Billing
            </button>
          </div>

          {billingEntries.length === 0 ? (
            <p style={{ color: '#64748b', fontSize: '0.85rem' }}>No billing entries created yet.</p>
          ) : (
            <div className="table-responsive">
              <table className="table" style={{ width: '100%', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ padding: '0.5rem' }}>Invoice #</th>
                    <th style={{ padding: '0.5rem', textAlign: 'right' }}>Amount</th>
                    <th style={{ padding: '0.5rem', textAlign: 'center' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {billingEntries.map((b) => (
                    <tr key={b.id}>
                      <td style={{ padding: '0.5rem', fontWeight: 500 }}>{b.invoiceNumber || b.id.slice(0, 8)}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 600 }}>${b.amount?.toLocaleString()}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                        <span className={`badge ${b.status === 'PAID' ? 'badge-green' : 'badge-amber'}`}>
                          {b.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* FULFILLMENT ORDERS & WAREHOUSES */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Package size={20} color="#8b5cf6" />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#0f172a', margin: 0 }}>
                Orders Ready for Fulfillment
              </h3>
            </div>
            <button
              onClick={() => navigate('/workspace/fulfillment')}
              className="btn btn-secondary"
              style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
            >
              Fulfillment Hub
            </button>
          </div>

          {fulfillmentOrders.length === 0 ? (
            <p style={{ color: '#64748b', fontSize: '0.85rem' }}>No orders currently awaiting inventory allocation.</p>
          ) : (
            <div className="table-responsive">
              <table className="table" style={{ width: '100%', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ padding: '0.5rem' }}>Quote #</th>
                    <th style={{ padding: '0.5rem' }}>Customer</th>
                    <th style={{ padding: '0.5rem', textAlign: 'center' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {fulfillmentOrders.map((ord) => (
                    <tr key={ord.id}>
                      <td style={{ padding: '0.5rem', fontWeight: 600 }}>{ord.quoteNumber}</td>
                      <td style={{ padding: '0.5rem', color: '#475569' }}>{ord.customerName || 'Customer'}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                        <span className="badge badge-purple">{ord.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
