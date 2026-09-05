import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../../context/WorkspaceContext';
import { apiFetch } from '../../utils/api';
import {
  CreditCard,
  Receipt,
  Calendar,
  DollarSign,
  AlertCircle,
  CheckCircle,
  Plus,
  Minus,
  XCircle,
  FileSpreadsheet,
  RefreshCw,
  TrendingUp,
  RotateCcw,
  FileText
} from 'lucide-react';

export default function BillingScreen() {
  const { activeQuotationId, reloadCounter, user } = useWorkspace();
  const navigate = useNavigate();

  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Active Tab: 'INVOICES' | 'SUBSCRIPTIONS' | 'CREDIT_NOTES'
  const [activeTab, setActiveTab] = useState('INVOICES');

  // Modals
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('BANK_TRANSFER');
  const [paymentReference, setPaymentReference] = useState('');

  const [qtyModalOpen, setQtyModalOpen] = useState(false);
  const [selectedSub, setSelectedSub] = useState(null);
  const [newSubQuantity, setNewSubQuantity] = useState(1);

  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const normalizeRole = (r) => (r || '').toUpperCase();
  const userRole = normalizeRole(user?.role);
  const canModifyFinance = ['FINANCE', 'FINANCE_OPERATIONS', 'ADMIN'].includes(userRole);

  const fetchFinanceData = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch('/finance/dashboard');
      setDashboardData(data);
    } catch (err) {
      setError(err.message || 'Failed to load finance & billing dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFinanceData();
  }, [reloadCounter]);

  // Handle Recording Payment
  const handleOpenPaymentModal = (inv) => {
    setSelectedInvoice(inv);
    setPaymentAmount(inv.outstandingAmount.toFixed(2));
    setPaymentReference('');
    setPaymentModalOpen(true);
  };

  const handleConfirmPayment = async () => {
    if (!selectedInvoice) return;
    const amt = Number(paymentAmount);
    if (!amt || amt <= 0) {
      setError('Please enter a valid payment amount');
      return;
    }

    setActionLoading(true);
    setError('');
    setSuccessMsg('');

    try {
      const res = await apiFetch(`/finance/invoices/${selectedInvoice.id}/payments`, {
        method: 'POST',
        body: JSON.stringify({
          amount: amt,
          paymentMethod,
          reference: paymentReference
        })
      });

      setSuccessMsg(res.message || 'Payment recorded successfully!');
      setPaymentModalOpen(false);
      await fetchFinanceData();
    } catch (err) {
      setError(err.message || 'Failed to record payment');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Subscription Quantity Modification
  const handleOpenQtyModal = (sub) => {
    setSelectedSub(sub);
    setNewSubQuantity(sub.quantity);
    setQtyModalOpen(true);
  };

  const handleConfirmQtyChange = async () => {
    if (!selectedSub) return;
    setActionLoading(true);
    setError('');
    setSuccessMsg('');

    try {
      const res = await apiFetch('/finance/subscriptions/modify-quantity', {
        method: 'POST',
        body: JSON.stringify({
          subscriptionId: selectedSub.id,
          newQuantity: Number(newSubQuantity)
        })
      });

      if (res.action === 'CHARGE') {
        setSuccessMsg(`Quantity updated to ${newSubQuantity}. Immediate prorated charge generated: +$${res.proratedAmount.toFixed(2)}`);
      } else if (res.action === 'CREDIT') {
        setSuccessMsg(`Quantity reduced to ${newSubQuantity}. Prorated Credit Note issued: $${Math.abs(res.proratedAmount).toFixed(2)}`);
      } else {
        setSuccessMsg('Subscription quantity updated.');
      }

      setQtyModalOpen(false);
      await fetchFinanceData();
    } catch (err) {
      setError(err.message || 'Failed to update subscription quantity');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Subscription Cancellation
  const handleOpenCancelModal = (sub) => {
    setSelectedSub(sub);
    setCancelReason('');
    setCancelModalOpen(true);
  };

  const handleConfirmCancel = async () => {
    if (!selectedSub || !cancelReason.trim()) {
      setError('Mandatory cancellation reason required');
      return;
    }

    setActionLoading(true);
    setError('');
    setSuccessMsg('');

    try {
      const res = await apiFetch('/finance/subscriptions/cancel', {
        method: 'POST',
        body: JSON.stringify({
          subscriptionId: selectedSub.id,
          reason: cancelReason.trim()
        })
      });

      if (res.creditNote) {
        setSuccessMsg(`Subscription cancelled. Credit Note issued for unused days: $${res.creditNote.amount.toFixed(2)}`);
      } else {
        setSuccessMsg('Subscription cancelled successfully.');
      }

      setCancelModalOpen(false);
      await fetchFinanceData();
    } catch (err) {
      setError(err.message || 'Failed to cancel subscription');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="empty-state">
        <RefreshCw className="spinner" size={32} color="#059669" />
        <p style={{ color: '#64748b', marginTop: '0.5rem' }}>Loading Finance & Billing Engine Data...</p>
      </div>
    );
  }

  const kpis = dashboardData?.kpis || {};
  const invoices = dashboardData?.invoices || [];
  const subscriptions = dashboardData?.subscriptions || [];
  const creditNotes = dashboardData?.creditNotes || [];

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a' }}>Finance, Invoicing & Billing</h1>
          <p style={{ fontSize: '0.85rem', color: '#64748b' }}>
            Hybrid billing, payment reconciliation, recurring subscription proration & credit notes ledger.
          </p>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: 'flex', gap: '0.5rem', backgroundColor: '#f1f5f9', padding: '0.25rem', borderRadius: '8px' }}>
          <button
            onClick={() => setActiveTab('INVOICES')}
            className={`btn btn-sm ${activeTab === 'INVOICES' ? 'btn-primary' : 'btn-ghost'}`}
          >
            Invoices ({invoices.length})
          </button>
          <button
            onClick={() => setActiveTab('SUBSCRIPTIONS')}
            className={`btn btn-sm ${activeTab === 'SUBSCRIPTIONS' ? 'btn-primary' : 'btn-ghost'}`}
          >
            Subscriptions ({subscriptions.length})
          </button>
          <button
            onClick={() => setActiveTab('CREDIT_NOTES')}
            className={`btn btn-sm ${activeTab === 'CREDIT_NOTES' ? 'btn-primary' : 'btn-ghost'}`}
          >
            Credit Notes ({creditNotes.length})
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="alert alert-success" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <CheckCircle size={18} />
          <span>{successMsg}</span>
        </div>
      )}

      {/* KPI METRICS DASHBOARD CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
        <div className="card" style={{ padding: '1rem' }}>
          <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Total Outstanding Balance</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#dc2626', marginTop: '0.25rem' }}>
            ${kpis.totalOutstandingAmount?.toFixed(2)}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
            {kpis.openInvoicesCount} Open / {kpis.overdueInvoicesCount} Overdue Invoices
          </div>
        </div>

        <div className="card" style={{ padding: '1rem' }}>
          <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Collected Payments</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#059669', marginTop: '0.25rem' }}>
            ${kpis.paidInvoicesAmount?.toFixed(2)}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
            {kpis.paidInvoicesCount} Paid Invoices
          </div>
        </div>

        <div className="card" style={{ padding: '1rem' }}>
          <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Recurring Monthly Revenue (MRR)</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#2563eb', marginTop: '0.25rem' }}>
            ${kpis.recurringMonthlyRevenue?.toFixed(2)}/mo
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
            {kpis.activeSubscriptionsCount} Active Subscriptions
          </div>
        </div>

        <div className="card" style={{ padding: '1rem' }}>
          <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Total Credit Notes Issued</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#d97706', marginTop: '0.25rem' }}>
            ${kpis.creditNotesTotalAmount?.toFixed(2)}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
            {kpis.creditNotesCount} Issued Adjustments
          </div>
        </div>
      </div>

      {/* TAB 1: INVOICES LEDGER */}
      {activeTab === 'INVOICES' && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Receipt size={18} color="#2563eb" />
            <span>One-Time & Recurring Orders Invoice Ledger</span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Invoice Number</th>
                  <th>Customer</th>
                  <th>Total Amount</th>
                  <th>Paid Amount</th>
                  <th>Outstanding</th>
                  <th>Due Date</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td style={{ fontWeight: 700, color: '#0f172a' }}>{inv.invoiceNumber}</td>
                    <td>{inv.customerName || 'Customer'}</td>
                    <td style={{ fontWeight: 600 }}>${inv.totalAmount.toFixed(2)}</td>
                    <td style={{ color: '#059669', fontWeight: 600 }}>${inv.paidAmount.toFixed(2)}</td>
                    <td style={{ color: inv.outstandingAmount > 0 ? '#dc2626' : '#059669', fontWeight: 700 }}>
                      ${inv.outstandingAmount.toFixed(2)}
                    </td>
                    <td>{new Date(inv.dueDate).toLocaleDateString()}</td>
                    <td>
                      <span className={`badge ${inv.status === 'PAID' ? 'badge-green' : inv.status === 'PARTIALLY_PAID' ? 'badge-amber' : inv.status === 'OVERDUE' ? 'badge-red' : 'badge-blue'}`}>
                        {inv.status}
                      </span>
                    </td>
                    <td>
                      {inv.outstandingAmount > 0 && inv.status !== 'CANCELLED' && canModifyFinance && (
                        <button onClick={() => handleOpenPaymentModal(inv)} className="btn btn-sm btn-success">
                          Record Payment
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: SUBSCRIPTIONS LEDGER */}
      {activeTab === 'SUBSCRIPTIONS' && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Calendar size={18} color="#7c3aed" />
            <span>Active Recurring Subscriptions & Billing Schedules</span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Plan Name</th>
                  <th>Billing Cycle</th>
                  <th>Quantity</th>
                  <th>Cycle Total</th>
                  <th>Status</th>
                  <th>Current Period</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {subscriptions.map((sub) => (
                  <tr key={sub.id}>
                    <td style={{ fontWeight: 700, color: '#0f172a' }}>{sub.plan?.name || 'Subscription Plan'}</td>
                    <td><span className="badge badge-purple">{sub.plan?.billingCycle}</span></td>
                    <td style={{ fontWeight: 700 }}>{sub.quantity} units</td>
                    <td style={{ fontWeight: 700, color: '#059669' }}>
                      ${(sub.quantity * (sub.plan?.pricePerCycle || 0)).toFixed(2)}
                    </td>
                    <td>
                      <span className={`badge ${sub.status === 'ACTIVE' ? 'badge-green' : 'badge-red'}`}>
                        {sub.status}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: '#64748b' }}>
                      {new Date(sub.currentPeriodStart).toLocaleDateString()} - {new Date(sub.currentPeriodEnd).toLocaleDateString()}
                    </td>
                    <td>
                      {sub.status === 'ACTIVE' && canModifyFinance && (
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                          <button onClick={() => handleOpenQtyModal(sub)} className="btn btn-sm btn-outline">
                            Modify Qty
                          </button>
                          <button onClick={() => handleOpenCancelModal(sub)} className="btn btn-sm btn-danger">
                            Cancel
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: CREDIT NOTES LEDGER */}
      {activeTab === 'CREDIT_NOTES' && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <RotateCcw size={18} color="#d97706" />
            <span>Credit Notes & Billing Adjustments Ledger</span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Credit Note Ref</th>
                  <th>Reason / Explanation</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Created By</th>
                  <th>Created Date</th>
                </tr>
              </thead>
              <tbody>
                {creditNotes.map((cn) => (
                  <tr key={cn.id}>
                    <td style={{ fontWeight: 700, color: '#0f172a' }}>{cn.creditNoteNumber}</td>
                    <td style={{ fontStyle: 'italic', color: '#475569' }}>"{cn.reason}"</td>
                    <td style={{ fontWeight: 700, color: '#d97706' }}>${cn.amount.toFixed(2)}</td>
                    <td><span className="badge badge-amber">{cn.status}</span></td>
                    <td>{cn.createdBy || 'Finance'}</td>
                    <td>{new Date(cn.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* RECORD PAYMENT MODAL */}
      {paymentModalOpen && selectedInvoice && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
          <div className="card" style={{ width: '100%', maxWidth: '480px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>Record Payment for {selectedInvoice.invoiceNumber}</h3>
            <p style={{ fontSize: '0.8rem', color: '#475569' }}>
              Outstanding Balance: <strong style={{ color: '#dc2626' }}>${selectedInvoice.outstandingAmount.toFixed(2)}</strong>
            </p>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Payment Amount ($)</label>
              <input
                type="number"
                step="0.01"
                className="form-input"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Payment Method</label>
              <select className="form-select" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                <option value="BANK_TRANSFER">Bank Transfer (ACH / Wire)</option>
                <option value="CREDIT_CARD">Credit Card</option>
                <option value="CHECK">Check</option>
                <option value="ONLINE">Online Portal</option>
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Reference / Transaction ID</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. TXN-998823"
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button onClick={() => setPaymentModalOpen(false)} className="btn btn-outline" disabled={actionLoading}>Cancel</button>
              <button onClick={handleConfirmPayment} className="btn btn-success" disabled={actionLoading}>
                {actionLoading ? <span className="spinner" /> : <span>Confirm Payment</span>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODIFY SUBSCRIPTION QTY MODAL */}
      {qtyModalOpen && selectedSub && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
          <div className="card" style={{ width: '100%', maxWidth: '480px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>Modify Subscription Quantity</h3>
            <p style={{ fontSize: '0.8rem', color: '#475569' }}>
              Current Plan: <strong>{selectedSub.plan?.name}</strong> (Current Qty: {selectedSub.quantity})
            </p>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">New Quantity</label>
              <input
                type="number"
                min="1"
                className="form-input"
                value={newSubQuantity}
                onChange={(e) => setNewSubQuantity(e.target.value)}
              />
            </div>

            <div style={{ backgroundColor: '#f8fafc', padding: '0.75rem', borderRadius: '6px', fontSize: '0.8rem', color: '#475569' }}>
              ℹ Quantity increases create an immediate prorated charge for remaining days in the cycle. Quantity decreases issue a Credit Note.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button onClick={() => setQtyModalOpen(false)} className="btn btn-outline" disabled={actionLoading}>Cancel</button>
              <button onClick={handleConfirmQtyChange} className="btn btn-primary" disabled={actionLoading}>
                {actionLoading ? <span className="spinner" /> : <span>Apply Quantity & Prorate</span>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CANCEL SUBSCRIPTION MODAL */}
      {cancelModalOpen && selectedSub && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
          <div className="card" style={{ width: '100%', maxWidth: '480px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>Cancel Subscription</h3>
            <p style={{ fontSize: '0.8rem', color: '#475569' }}>
              Cancelling <strong>{selectedSub.plan?.name}</strong> will calculate unused cycle days and issue a Credit Note.
            </p>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Mandatory Cancellation Reason</label>
              <textarea
                className="form-textarea"
                rows="3"
                placeholder="Explain why subscription is being cancelled..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button onClick={() => setCancelModalOpen(false)} className="btn btn-outline" disabled={actionLoading}>Cancel</button>
              <button onClick={handleConfirmCancel} className="btn btn-danger" disabled={actionLoading || !cancelReason.trim()}>
                {actionLoading ? <span className="spinner" /> : <span>Confirm Cancellation</span>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
