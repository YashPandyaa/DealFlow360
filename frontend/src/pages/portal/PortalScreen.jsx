import React, { useState, useEffect } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { useWorkspace } from '../../context/WorkspaceContext';
import { apiFetch } from '../../utils/api';
import {
  ShieldCheck,
  Send,
  CheckCircle,
  AlertCircle,
  FileText,
  Mail,
  ArrowRight,
  ArrowLeft,
  MessageSquare,
  LogOut,
  Clock,
  Briefcase,
  ChevronRight,
  Truck,
  Repeat,
  Receipt,
  User,
  Search,
  Check,
  X,
  Plus
} from 'lucide-react';

export default function PortalScreen() {
  const [searchParams] = useSearchParams();
  const tokenParam = searchParams.get('token');
  const quoteIdParam = searchParams.get('quoteId');
  const { login, logout, token, user } = useWorkspace();

  // Navigation Tab State
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'quotations' | 'negotiations' | 'orders' | 'subscriptions' | 'invoices' | 'profile'

  // Authentication State
  const [email, setEmail] = useState('');
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [generatedToken, setGeneratedToken] = useState('');
  const [verifying, setVerifying] = useState(false);

  // Data States
  const [quotations, setQuotations] = useState([]);
  const [selectedQuoteId, setSelectedQuoteId] = useState('');
  const [quotation, setQuotation] = useState(null);
  const [comments, setComments] = useState([]);
  const [orders, setOrders] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [invoices, setInvoices] = useState([]);

  // Filter & Search States
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Form States
  const [counterDiscount, setCounterDiscount] = useState(0);
  const [newComment, setNewComment] = useState('');
  const [selectedLineId, setSelectedLineId] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Status States
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // 1. Verify Magic Link token if present in URL
  const handleVerifyToken = async (tokenToVerify) => {
    const activeToken = tokenToVerify || tokenParam || generatedToken;
    if (!activeToken) return;
    setVerifying(true);
    setError('');

    try {
      const data = await apiFetch(`/auth/portal/verify?token=${activeToken}`);
      login(data.token, data.user);
      setSuccessMsg('Portal magic link verified successfully!');
      window.history.replaceState({}, '', '/portal');
    } catch (err) {
      if (token && user?.role === 'CUSTOMER') {
        window.history.replaceState({}, '', '/portal');
      } else {
        setError(err.message || 'Invalid or expired magic link token');
      }
    } finally {
      setVerifying(false);
    }
  };

  useEffect(() => {
    if (tokenParam) {
      handleVerifyToken(tokenParam);
    }
  }, [tokenParam]);

  // 2. Fetch All Customer Data
  const fetchAllCustomerData = async () => {
    if (!token || user?.role !== 'CUSTOMER') return;
    setLoading(true);
    setError('');

    try {
      // Parallel fetch of customer workspace endpoints
      const [quotesRes, ordersRes, subsRes, invRes] = await Promise.allSettled([
        apiFetch('/quotations'),
        apiFetch('/warehouses/orders'),
        apiFetch('/subscriptions'),
        apiFetch('/subscriptions/invoices')
      ]);

      if (quotesRes.status === 'fulfilled') {
        const list = Array.isArray(quotesRes.value) ? quotesRes.value : [quotesRes.value];
        setQuotations(list);

        let targetId = selectedQuoteId;
        if (!targetId && quoteIdParam) {
          const found = list.find((q) => q.quoteNumber === quoteIdParam || q.id === quoteIdParam);
          if (found) targetId = found.id;
        }
        if (!targetId && list.length > 0) {
          targetId = list[0].id;
        }
        if (targetId) {
          setSelectedQuoteId(targetId);
          fetchSingleQuotation(targetId);
        }
      }

      if (ordersRes.status === 'fulfilled') {
        setOrders(Array.isArray(ordersRes.value) ? ordersRes.value : []);
      }

      if (subsRes.status === 'fulfilled') {
        setSubscriptions(Array.isArray(subsRes.value) ? subsRes.value : []);
      }

      if (invRes.status === 'fulfilled') {
        setInvoices(Array.isArray(invRes.value) ? invRes.value : []);
      }
    } catch (err) {
      setError(err.message || 'Failed to load customer workspace data');
    } finally {
      setLoading(false);
    }
  };

  const fetchSingleQuotation = async (qId) => {
    if (!qId) return;
    try {
      const [detail, commentsList] = await Promise.all([
        apiFetch(`/quotations/${qId}`),
        apiFetch(`/quotations/${qId}/comments`).catch(() => [])
      ]);
      setQuotation(detail);
      setComments(Array.isArray(commentsList) ? commentsList : []);
    } catch (err) {
      console.error('Error fetching quotation details:', err);
    }
  };

  useEffect(() => {
    fetchAllCustomerData();
  }, [token, user]);

  const handleSelectQuote = (qId) => {
    setSelectedQuoteId(qId);
    fetchSingleQuotation(qId);
    setActiveTab('quotations');
  };

  // 3. Request Magic Link
  const handleRequestMagicLink = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await apiFetch('/auth/portal/request-link', {
        method: 'POST',
        body: JSON.stringify({ email })
      });

      setMagicLinkSent(true);
      setGeneratedToken(data.token);
    } catch (err) {
      setError(err.message || 'Failed to generate portal magic link');
    } finally {
      setLoading(false);
    }
  };

  // 4. Submit Counter-Offer / Discount Proposal
  const handleSubmitCounterOffer = async () => {
    if (!quotation?.id) return;
    setSubmitting(true);
    setError('');
    setSuccessMsg('');

    try {
      const result = await apiFetch(`/approvals/${quotation.id}/reopen`, {
        method: 'POST',
        body: JSON.stringify({
          customerTier: quotation.customerTier || 'GOLD',
          discountProposal: counterDiscount
        })
      });

      if (result.requiresApproval) {
        setSuccessMsg(`Discount request submitted! Target discount of ${counterDiscount}% requires Sales Manager approval.`);
      } else {
        setSuccessMsg('Quotation updated and accepted!');
      }

      await fetchAllCustomerData();
      if (selectedQuoteId) fetchSingleQuotation(selectedQuoteId);
    } catch (err) {
      setError(err.message || 'Failed to submit discount counter-offer proposal');
    } finally {
      setSubmitting(false);
    }
  };

  // 5. Add Line Item or Quotation Comment
  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!quotation?.id || !newComment.trim()) return;
    setSubmitting(true);
    setError('');

    try {
      await apiFetch(`/quotations/${quotation.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({
          comment: newComment.trim(),
          lineId: selectedLineId || undefined
        })
      });
      setNewComment('');
      setSelectedLineId('');
      setSuccessMsg('Comment added successfully!');
      fetchSingleQuotation(quotation.id);
    } catch (err) {
      setError(err.message || 'Failed to add comment');
    } finally {
      setSubmitting(false);
    }
  };

  // 6. Confirm Quotation
  const handleConfirmQuotation = async () => {
    if (!quotation?.id) return;
    setConfirming(true);
    setError('');

    try {
      await apiFetch(`/quotations/${quotation.id}/confirm`, {
        method: 'POST'
      });
      setSuccessMsg('Quotation confirmed successfully! Order processing initiated.');
      setShowConfirmModal(false);
      await fetchAllCustomerData();
      if (selectedQuoteId) fetchSingleQuotation(selectedQuoteId);
    } catch (err) {
      setError(err.message || 'Failed to confirm quotation');
    } finally {
      setConfirming(false);
    }
  };

  // VIEW 1: Magic Link Access Form
  if (!token || user?.role !== 'CUSTOMER') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%)', padding: '1rem' }}>
        <div className="card-glass animate-fade-in" style={{ width: '100%', maxWidth: '440px', padding: '2.5rem 2rem' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '52px', height: '52px', borderRadius: '12px', background: '#ecfdf5', color: '#059669', marginBottom: '1rem', border: '1px solid #a7f3d0' }}>
              <ShieldCheck size={28} />
            </div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: '700', color: '#0f172a', letterSpacing: '-0.02em' }}>Customer Portal</h1>
            <p style={{ color: '#475569', fontSize: '0.875rem', marginTop: '0.25rem' }}>DealFlow360 Self-Governing Sales Operations</p>
          </div>

          {verifying && (
            <div className="empty-state">
              <span className="spinner" />
              <p style={{ marginTop: '0.5rem' }}>Verifying authentication token...</p>
            </div>
          )}

          {error && (
            <div className="badge-red" style={{ padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.25rem', fontSize: '0.85rem' }}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {magicLinkSent ? (
            <div className="badge-green" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1.25rem', borderRadius: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '700' }}>
                <CheckCircle size={18} />
                <span>Magic Link Ready!</span>
              </div>
              <p style={{ fontSize: '0.8rem' }}>Click below to enter your Customer Workspace:</p>
              <button
                type="button"
                onClick={() => handleVerifyToken(generatedToken)}
                className="btn btn-success btn-sm"
                disabled={verifying}
              >
                {verifying ? <span className="spinner" /> : <><span>Access Customer Portal</span><ArrowRight size={14} /></>}
              </button>
            </div>
          ) : (
            <form onSubmit={handleRequestMagicLink}>
              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label className="form-label">Customer Email Address</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="customerb@globex.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="btn btn-success" style={{ width: '100%', padding: '0.75rem' }} disabled={loading}>
                {loading ? <span className="spinner" /> : <><span>Request Magic Link Access</span><Mail size={18} /></>}
              </button>
            </form>
          )}

          <div style={{ marginTop: '1.75rem', paddingTop: '1.25rem', borderTop: '1px solid #e2e8f0', textAlign: 'center' }}>
            <Link to="/login" style={{ color: '#475569', fontSize: '0.875rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontWeight: '500' }}>
              <ArrowLeft size={16} />
              <span>Back to Login / Main Application</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Filtered Quotations
  const filteredQuotations = quotations.filter((q) => {
    const matchesSearch = !searchQuery ||
      (q.quoteNumber && q.quoteNumber.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (q.customerName && q.customerName.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStatus = statusFilter === 'ALL' || q.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const pendingQuotations = quotations.filter((q) => q.status === 'PENDING_APPROVAL' || q.status === 'SENT');
  const approvedQuotations = quotations.filter((q) => q.status === 'APPROVED' || q.status === 'READY_FOR_FULFILLMENT');
  const confirmedQuotations = quotations.filter((q) => q.status === 'CONFIRMED' || q.status === 'FULFILLED');

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', color: '#0f172a', padding: '1.5rem 1rem' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

        {/* TOP HEADER & BRANDING */}
        <header className="card card-glass" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div style={{ width: '42px', height: '42px', borderRadius: '12px', backgroundColor: '#ecfdf5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #a7f3d0' }}>
              <ShieldCheck size={24} />
            </div>
            <div>
              <h1 style={{ fontSize: '1.35rem', fontWeight: '800', color: '#0f172a', letterSpacing: '-0.02em' }}>DealFlow360 Customer Portal</h1>
              <p style={{ fontSize: '0.8rem', color: '#475569' }}>Welcome back, <strong style={{ color: '#0f172a' }}>{user.name || user.email}</strong></p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span className="badge badge-purple" style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}>
              Tier: GOLD CUSTOMER
            </span>
            <Link to="/login" className="btn btn-outline btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: '#475569', textDecoration: 'none' }}>
              <ArrowLeft size={14} />
              <span>Back to Login</span>
            </Link>
            <button onClick={() => logout()} className="btn btn-outline btn-sm" style={{ color: '#dc2626', borderColor: '#fecaca' }}>
              <LogOut size={14} />
              <span>Sign Out</span>
            </button>
          </div>
        </header>

        {/* ALERT NOTIFICATIONS */}
        {error && (
          <div className="badge-red" style={{ padding: '0.85rem 1.25rem', borderRadius: '8px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="badge-green" style={{ padding: '0.85rem 1.25rem', borderRadius: '8px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CheckCircle size={16} />
            <span>{successMsg}</span>
          </div>
        )}

        {/* CUSTOMER PORTAL NAVIGATION TABS */}
        <nav style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem', overflowX: 'auto' }}>
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`btn btn-sm ${activeTab === 'dashboard' ? 'btn-success' : 'btn-outline'}`}
            style={{ borderRadius: '8px' }}
          >
            <Briefcase size={15} />
            <span>Dashboard</span>
          </button>
          <button
            onClick={() => setActiveTab('quotations')}
            className={`btn btn-sm ${activeTab === 'quotations' ? 'btn-success' : 'btn-outline'}`}
            style={{ borderRadius: '8px' }}
          >
            <FileText size={15} />
            <span>My Quotations ({quotations.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('negotiations')}
            className={`btn btn-sm ${activeTab === 'negotiations' ? 'btn-success' : 'btn-outline'}`}
            style={{ borderRadius: '8px' }}
          >
            <MessageSquare size={15} />
            <span>Negotiation Center ({pendingQuotations.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('orders')}
            className={`btn btn-sm ${activeTab === 'orders' ? 'btn-success' : 'btn-outline'}`}
            style={{ borderRadius: '8px' }}
          >
            <Truck size={15} />
            <span>Orders & Fulfillment ({orders.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('subscriptions')}
            className={`btn btn-sm ${activeTab === 'subscriptions' ? 'btn-success' : 'btn-outline'}`}
            style={{ borderRadius: '8px' }}
          >
            <Repeat size={15} />
            <span>Subscriptions ({subscriptions.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('invoices')}
            className={`btn btn-sm ${activeTab === 'invoices' ? 'btn-success' : 'btn-outline'}`}
            style={{ borderRadius: '8px' }}
          >
            <Receipt size={15} />
            <span>Invoices & Billing ({invoices.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('profile')}
            className={`btn btn-sm ${activeTab === 'profile' ? 'btn-success' : 'btn-outline'}`}
            style={{ borderRadius: '8px' }}
          >
            <User size={15} />
            <span>Profile</span>
          </button>
        </nav>

        {/* ==================================================================== */}
        {/* TAB 1: DASHBOARD OVERVIEW */}
        {/* ==================================================================== */}
        {activeTab === 'dashboard' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* KPI STAT CARDS */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
              <div className="card" style={{ padding: '1.25rem', cursor: 'pointer' }} onClick={() => setActiveTab('quotations')}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: '600', textTransform: 'uppercase' }}>Active Quotations</span>
                  <FileText size={20} style={{ color: '#2563eb' }} />
                </div>
                <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#0f172a' }}>{quotations.length}</div>
                <span style={{ fontSize: '0.75rem', color: '#2563eb' }}>Click to view list &rarr;</span>
              </div>

              <div className="card" style={{ padding: '1.25rem', cursor: 'pointer' }} onClick={() => setActiveTab('negotiations')}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: '600', textTransform: 'uppercase' }}>Under Negotiation</span>
                  <Clock size={20} style={{ color: '#d97706' }} />
                </div>
                <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#d97706' }}>{pendingQuotations.length}</div>
                <span style={{ fontSize: '0.75rem', color: '#d97706' }}>Action required &rarr;</span>
              </div>

              <div className="card" style={{ padding: '1.25rem', cursor: 'pointer' }} onClick={() => setActiveTab('orders')}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: '600', textTransform: 'uppercase' }}>Confirmed Orders</span>
                  <Truck size={20} style={{ color: '#059669' }} />
                </div>
                <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#059669' }}>{confirmedQuotations.length}</div>
                <span style={{ fontSize: '0.75rem', color: '#059669' }}>Track delivery &rarr;</span>
              </div>

              <div className="card" style={{ padding: '1.25rem', cursor: 'pointer' }} onClick={() => setActiveTab('invoices')}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: '600', textTransform: 'uppercase' }}>Total Invoices</span>
                  <Receipt size={20} style={{ color: '#7c3aed' }} />
                </div>
                <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#7c3aed' }}>{invoices.length}</div>
                <span style={{ fontSize: '0.75rem', color: '#7c3aed' }}>View billing &rarr;</span>
              </div>
            </div>

            {/* ACTION REQUIRED BANNER */}
            {approvedQuotations.length > 0 && (
              <div className="card card-glass" style={{ borderLeft: '4px solid #059669', padding: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <CheckCircle size={24} style={{ color: '#059669' }} />
                  <div>
                    <h4 style={{ fontWeight: '700', color: '#0f172a', fontSize: '1rem' }}>Quotation Approved & Ready for Confirmation</h4>
                    <p style={{ fontSize: '0.8rem', color: '#475569' }}>You have {approvedQuotations.length} quotation(s) approved by sales management ready for your final confirmation.</p>
                  </div>
                </div>
                <button onClick={() => handleSelectQuote(approvedQuotations[0].id)} className="btn btn-success btn-sm">
                  <span>Review & Confirm</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            )}

            {/* RECENT QUOTATIONS DIRECTORY */}
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#0f172a' }}>Recent Quotations</h3>
                <button onClick={() => setActiveTab('quotations')} className="btn btn-outline btn-sm">View All</button>
              </div>

              {loading ? (
                <div className="empty-state"><span className="spinner" /></div>
              ) : quotations.length === 0 ? (
                <div className="empty-state"><p style={{ color: '#475569' }}>No quotations available.</p></div>
              ) : (
                <div className="table-container">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Quote Number</th>
                        <th>Customer</th>
                        <th>Status</th>
                        <th>Total Amount</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quotations.slice(0, 5).map((q) => (
                        <tr key={q.id}>
                          <td style={{ fontWeight: '700', color: '#0f172a' }}>{q.quoteNumber || q.id.slice(0, 8)}</td>
                          <td>{q.customerName || 'Customer'}</td>
                          <td>
                            <span className={`badge ${q.status === 'APPROVED' || q.status === 'CONFIRMED' ? 'badge-green' : q.status === 'PENDING_APPROVAL' ? 'badge-amber' : 'badge-blue'}`}>
                              {q.status}
                            </span>
                          </td>
                          <td style={{ fontWeight: '700', color: '#059669' }}>${(q.amount || q.totalAmount || 0).toFixed(2)}</td>
                          <td>
                            <button onClick={() => handleSelectQuote(q.id)} className="btn btn-outline btn-sm">
                              <span>Details</span>
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

        {/* ==================================================================== */}
        {/* TAB 2: MY QUOTATIONS & DETAILS */}
        {/* ==================================================================== */}
        {activeTab === 'quotations' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* SEARCH & FILTERS */}
            <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '240px', position: 'relative' }}>
                <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                <input
                  type="text"
                  className="form-input"
                  placeholder="Search quote number..."
                  style={{ paddingLeft: '36px' }}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <select className="form-select" style={{ width: '180px' }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="ALL">All Statuses</option>
                <option value="DRAFT">DRAFT</option>
                <option value="SENT">SENT</option>
                <option value="PENDING_APPROVAL">PENDING APPROVAL</option>
                <option value="APPROVED">APPROVED</option>
                <option value="CONFIRMED">CONFIRMED</option>
              </select>
            </div>

            {/* QUOTATION LIST & DETAILS SPLIT VIEW */}
            <div style={{ display: 'grid', gridTemplateColumns: selectedQuoteId ? 'minmax(0, 5fr) minmax(0, 7fr)' : '1fr', gap: '1.5rem', alignItems: 'start' }}>
              {/* QUOTATIONS TABLE */}
              <div className="card">
                <h3 style={{ fontSize: '1rem', fontWeight: '700', color: '#0f172a', marginBottom: '1rem' }}>Quotations Directory</h3>
                {filteredQuotations.length === 0 ? (
                  <div className="empty-state"><p style={{ color: '#475569' }}>No matching quotations found.</p></div>
                ) : (
                  <div className="table-container">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Quote Number</th>
                          <th>Status</th>
                          <th>Total</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredQuotations.map((q) => {
                          const isSelected = q.id === selectedQuoteId;
                          return (
                            <tr key={q.id} style={{ backgroundColor: isSelected ? '#ecfdf5' : 'transparent' }}>
                              <td style={{ fontWeight: '700', color: '#0f172a', fontSize: '0.85rem' }}>{q.quoteNumber || q.id.slice(0, 8)}</td>
                              <td>
                                <span className={`badge ${q.status === 'APPROVED' || q.status === 'CONFIRMED' ? 'badge-green' : q.status === 'PENDING_APPROVAL' ? 'badge-amber' : 'badge-blue'}`} style={{ fontSize: '0.7rem' }}>
                                  {q.status}
                                </span>
                              </td>
                              <td style={{ fontWeight: '700', color: '#059669', fontSize: '0.85rem' }}>${(q.amount || q.totalAmount || 0).toFixed(2)}</td>
                              <td>
                                <button onClick={() => handleSelectQuote(q.id)} className={`btn btn-sm ${isSelected ? 'btn-success' : 'btn-outline'}`}>
                                  <span>View</span>
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

              {/* QUOTATION FULL DETAIL & LINE ITEM COMMENTING */}
              {quotation && (
                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.85rem' }}>
                    <div>
                      <h3 style={{ fontSize: '1.15rem', fontWeight: '800', color: '#0f172a' }}>Quotation {quotation.quoteNumber}</h3>
                      <span style={{ fontSize: '0.8rem', color: '#475569' }}>Customer Tier: {quotation.customerTier || 'GOLD'}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span className={`badge ${quotation.status === 'APPROVED' || quotation.status === 'CONFIRMED' ? 'badge-green' : 'badge-amber'}`}>
                        {quotation.status}
                      </span>

                      {(quotation.status === 'APPROVED' || quotation.status === 'READY_FOR_FULFILLMENT') && (
                        <button onClick={() => setShowConfirmModal(true)} className="btn btn-success btn-sm">
                          <Check size={14} />
                          <span>Confirm Quotation</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* LINE ITEMS TABLE */}
                  <div className="table-container">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Item / Product</th>
                          <th>Category</th>
                          <th>Qty</th>
                          <th>Unit Price</th>
                          <th>Total</th>
                          <th>Comment</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(quotation.lines || []).map((line) => (
                          <tr key={line.id}>
                            <td style={{ fontWeight: '600', color: '#0f172a' }}>{line.product?.name || 'Enterprise Product'}</td>
                            <td><span className="badge badge-purple">{line.product?.category || 'Hardware'}</span></td>
                            <td>{line.quantity}</td>
                            <td>${(line.unitPrice || 0).toFixed(2)}</td>
                            <td style={{ fontWeight: '700', color: '#059669' }}>${(line.lineTotal || line.totalPrice || 0).toFixed(2)}</td>
                            <td>
                              <button
                                onClick={() => setSelectedLineId(line.id)}
                                className={`btn btn-xs ${selectedLineId === line.id ? 'btn-success' : 'btn-outline'}`}
                              >
                                <Plus size={12} />
                                <span>Comment</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '0.5rem' }}>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '0.8rem', color: '#475569' }}>Total Amount: </span>
                      <strong style={{ fontSize: '1.5rem', color: '#059669', marginLeft: '0.5rem' }}>${(quotation.totalAmount || 0).toFixed(2)}</strong>
                    </div>
                  </div>

                  {/* ADD COMMENT FORM */}
                  <div style={{ backgroundColor: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <h4 style={{ fontSize: '0.85rem', fontWeight: '700', color: '#0f172a', marginBottom: '0.5rem' }}>
                      {selectedLineId ? 'Add Line Item Comment' : 'Add General Quotation Comment'}
                    </h4>
                    <form onSubmit={handleAddComment} style={{ display: 'flex', gap: '0.5rem' }}>
                      <input
                        type="text"
                        className="form-input"
                        placeholder={selectedLineId ? 'Enter line item comment...' : 'Enter quotation comment...'}
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        required
                      />
                      <button type="submit" className="btn btn-success btn-sm" disabled={submitting}>
                        <Send size={14} />
                        <span>Send</span>
                      </button>
                      {selectedLineId && (
                        <button type="button" onClick={() => setSelectedLineId('')} className="btn btn-outline btn-sm">
                          <X size={14} />
                        </button>
                      )}
                    </form>
                  </div>

                  {/* COMMENTS LOG */}
                  {comments.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <h4 style={{ fontSize: '0.85rem', fontWeight: '700', color: '#475569' }}>Quotation Comments Trail</h4>
                      {comments.map((c) => (
                        <div key={c.id} style={{ backgroundColor: '#f8fafc', padding: '0.75rem', borderRadius: '6px', fontSize: '0.85rem', border: '1px solid #e2e8f0' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#059669', fontWeight: '600', marginBottom: '0.25rem' }}>
                            <span>{c.user?.name || 'Customer'}</span>
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{new Date(c.createdAt).toLocaleTimeString()}</span>
                          </div>
                          <p style={{ color: '#0f172a' }}>{c.comment}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* TAB 3: NEGOTIATION CENTER */}
        {/* ==================================================================== */}
        {activeTab === 'negotiations' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="card card-glass" style={{ padding: '1.5rem' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '800', color: '#0f172a', marginBottom: '0.5rem' }}>Discount Negotiation & Counter Offer Center</h3>
              <p style={{ fontSize: '0.85rem', color: '#475569' }}>
                Request discount adjustments or custom pricing. Requests exceeding your tier allowance automatically trigger DealFlow360 backend risk recalculation and Sales Manager approval workflow.
              </p>
            </div>

            {quotation ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 6fr) minmax(0, 6fr)', gap: '1.5rem' }}>
                <div className="card">
                  <h4 style={{ fontWeight: '700', color: '#0f172a', marginBottom: '0.75rem' }}>Target Quotation: #{quotation.quoteNumber}</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem', color: '#475569' }}>
                    <div>Current Customer Tier: <strong style={{ color: '#7c3aed' }}>{quotation.customerTier || 'GOLD'} (Max Allowed: 15%)</strong></div>
                    <div>Current Status: <strong style={{ color: '#059669' }}>{quotation.status}</strong></div>
                    <div>Current Quotation Total: <strong style={{ color: '#059669' }}>${(quotation.totalAmount || 0).toFixed(2)}</strong></div>
                  </div>
                </div>

                <div className="card card-glass">
                  <h4 style={{ fontWeight: '700', color: '#0f172a', marginBottom: '0.75rem' }}>Request Discount Counter Offer</h4>
                  <div className="form-group" style={{ marginBottom: '1rem' }}>
                    <label className="form-label">Requested Target Discount %</label>
                    <input
                      type="number"
                      className="form-input"
                      value={counterDiscount}
                      onChange={(e) => setCounterDiscount(parseFloat(e.target.value) || 0)}
                      min="0"
                      max="50"
                    />
                    <span style={{ fontSize: '0.75rem', color: '#475569', marginTop: '0.25rem', display: 'block' }}>
                      Example: Gold Tier allowed discount is 15%. Proposing 20% triggers Manager approval.
                    </span>
                  </div>

                  <button onClick={handleSubmitCounterOffer} className="btn btn-success" style={{ width: '100%' }} disabled={submitting}>
                    {submitting ? <span className="spinner" /> : <><Send size={16} /><span>Submit Counter Discount Request</span></>}
                  </button>
                </div>
              </div>
            ) : (
              <div className="empty-state"><p style={{ color: '#475569' }}>Select a quotation from 'My Quotations' tab to begin negotiation.</p></div>
            )}
          </div>
        )}

        {/* ==================================================================== */}
        {/* TAB 4: ORDERS & FULFILLMENT TRACKING */}
        {/* ==================================================================== */}
        {activeTab === 'orders' && (
          <div className="card">
            <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#0f172a', marginBottom: '1rem' }}>Confirmed Orders & Delivery Tracking</h3>
            {orders.length === 0 ? (
              <div className="empty-state"><Truck size={36} style={{ color: '#64748b' }} /><p style={{ color: '#475569', marginTop: '0.5rem' }}>No confirmed orders tracked yet.</p></div>
            ) : (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Order Number</th>
                      <th>Order Date</th>
                      <th>Items Count</th>
                      <th>Status</th>
                      <th>Fulfillment Status</th>
                      <th>Est. Delivery</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => (
                      <tr key={o.id}>
                        <td style={{ fontWeight: '700', color: '#0f172a' }}>{o.orderNumber || o.id.slice(0, 8)}</td>
                        <td>{new Date(o.orderDate).toLocaleDateString()}</td>
                        <td>{o.itemsCount || 1} line item(s)</td>
                        <td><span className="badge badge-green">{o.status}</span></td>
                        <td><span className="badge badge-purple">{o.fulfillmentStatus}</span></td>
                        <td style={{ fontWeight: '600', color: '#2563eb' }}>{o.expectedDelivery || 'Scheduled'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ==================================================================== */}
        {/* TAB 5: SUBSCRIPTIONS CENTER */}
        {/* ==================================================================== */}
        {activeTab === 'subscriptions' && (
          <div className="card">
            <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#0f172a', marginBottom: '1rem' }}>Active Customer Subscriptions</h3>
            {subscriptions.length === 0 ? (
              <div className="empty-state"><Repeat size={36} style={{ color: '#64748b' }} /><p style={{ color: '#475569', marginTop: '0.5rem' }}>No active recurring subscriptions linked.</p></div>
            ) : (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Plan Name</th>
                      <th>Billing Cycle</th>
                      <th>Quantity</th>
                      <th>Price / Cycle</th>
                      <th>Status</th>
                      <th>Start Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subscriptions.map((s) => (
                      <tr key={s.id}>
                        <td style={{ fontWeight: '700', color: '#0f172a' }}>{s.plan?.name || 'Enterprise SaaS Plan'}</td>
                        <td><span className="badge badge-purple">{s.plan?.billingCycle || 'MONTHLY'}</span></td>
                        <td>{s.quantity}</td>
                        <td style={{ fontWeight: '700', color: '#059669' }}>${(s.plan?.pricePerCycle || 0).toFixed(2)}</td>
                        <td><span className="badge badge-green">{s.status}</span></td>
                        <td>{new Date(s.startDate).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ==================================================================== */}
        {/* TAB 6: INVOICES & BILLING */}
        {/* ==================================================================== */}
        {activeTab === 'invoices' && (
          <div className="card">
            <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#0f172a', marginBottom: '1rem' }}>Customer Invoices & Billing Trail</h3>
            {invoices.length === 0 ? (
              <div className="empty-state"><Receipt size={36} style={{ color: '#64748b' }} /><p style={{ color: '#475569', marginTop: '0.5rem' }}>No billing invoices generated yet.</p></div>
            ) : (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Invoice Number</th>
                      <th>Order #</th>
                      <th>Invoice Date</th>
                      <th>Due Date</th>
                      <th>Amount</th>
                      <th>Payment Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => (
                      <tr key={inv.id}>
                        <td style={{ fontWeight: '700', color: '#0f172a' }}>{inv.invoiceNumber}</td>
                        <td>{inv.quoteNumber || inv.orderId.slice(0, 8)}</td>
                        <td>{new Date(inv.date).toLocaleDateString()}</td>
                        <td>{new Date(inv.dueDate).toLocaleDateString()}</td>
                        <td style={{ fontWeight: '700', color: '#059669' }}>${(inv.amount || 0).toFixed(2)}</td>
                        <td>
                          <span className={`badge ${inv.status === 'PAID' ? 'badge-green' : 'badge-amber'}`}>
                            {inv.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ==================================================================== */}
        {/* TAB 7: PROFILE */}
        {/* ==================================================================== */}
        {activeTab === 'profile' && (
          <div className="card card-glass" style={{ maxWidth: '600px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#0f172a', marginBottom: '1rem' }}>Customer Account Profile</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.9rem', color: '#475569' }}>
              <div><strong>Account Name:</strong> {user.name || 'Globex Customer B'}</div>
              <div><strong>Email Address:</strong> {user.email}</div>
              <div><strong>Authenticated Role:</strong> <span className="badge badge-green">CUSTOMER</span></div>
              <div><strong>Account Tier:</strong> <span className="badge badge-purple">GOLD</span></div>
              <div><strong>Portal Access:</strong> Authorized & Scoped</div>
            </div>
          </div>
        )}
      </div>

      {/* CONFIRM QUOTATION MODAL */}
      {showConfirmModal && quotation && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div className="card animate-fade-in" style={{ width: '100%', maxWidth: '480px', padding: '1.75rem', backgroundColor: '#ffffff' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: '800', color: '#0f172a', marginBottom: '0.75rem' }}>Confirm Quotation</h3>
            <p style={{ fontSize: '0.85rem', color: '#475569', marginBottom: '1.25rem' }}>
              Are you sure you want to accept and confirm quotation <strong>#{quotation.quoteNumber}</strong> for a total amount of <strong style={{ color: '#059669' }}>${(quotation.totalAmount || 0).toFixed(2)}</strong>?
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button onClick={() => setShowConfirmModal(false)} className="btn btn-outline btn-sm">Cancel</button>
              <button onClick={handleConfirmQuotation} className="btn btn-success btn-sm" disabled={confirming}>
                {confirming ? <span className="spinner" /> : <><span>Confirm & Place Order</span><Check size={16} /></>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

