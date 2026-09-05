import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useWorkspace } from '../../context/WorkspaceContext';
import { apiFetch } from '../../utils/api';
import {
  ShieldAlert,
  CheckCircle,
  XCircle,
  RotateCcw,
  Clock,
  User,
  AlertTriangle,
  FileText,
  ChevronRight,
  ShieldCheck,
  Search,
  Filter,
  ArrowLeft,
  MessageSquare,
  Building,
  Mail,
  Phone,
  Tag,
  DollarSign,
  TrendingUp,
  AlertOctagon,
  HelpCircle,
  Layers,
  ArrowRight
} from 'lucide-react';

export default function ApprovalScreen() {
  const { id: urlParamId } = useParams();
  const { activeQuotationId, setActiveQuotationId, user, reloadCounter } = useWorkspace();
  const navigate = useNavigate();

  const targetQuoteId = urlParamId || activeQuotationId;

  // Mode: 'QUEUE' or 'DETAIL'
  const [viewMode, setViewMode] = useState('QUEUE');
  
  // Queue state
  const [queueItems, setQueueItems] = useState([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [riskFilter, setRiskFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('riskScore');
  const [sortOrder, setSortOrder] = useState('desc');

  // Detail state
  const [detailData, setDetailData] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  
  // Modal states
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [revisionReason, setRevisionReason] = useState('');
  const [approvalComment, setApprovalComment] = useState('');
  
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // 1. Fetch Queue items
  const fetchQueue = async () => {
    setQueueLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.append('search', searchQuery);
      if (riskFilter !== 'ALL') params.append('riskLevel', riskFilter);
      if (statusFilter !== 'ALL') params.append('status', statusFilter);
      if (sortBy) params.append('sortBy', sortBy);
      if (sortOrder) params.append('sortOrder', sortOrder);

      const items = await apiFetch(`/approvals/queue?${params.toString()}`);
      setQueueItems(Array.isArray(items) ? items : []);
    } catch (err) {
      console.warn('Queue fetch error:', err);
    } finally {
      setQueueLoading(false);
    }
  };

  // 2. Fetch Detail view
  const fetchDetail = async (quoteId) => {
    if (!quoteId) return;
    setDetailLoading(true);
    setError('');
    try {
      const data = await apiFetch(`/approvals/${quoteId}/detail`);
      setDetailData(data);
    } catch (err) {
      setError(err.message || 'Failed to load complete approval detail context');
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, [searchQuery, riskFilter, statusFilter, sortBy, sortOrder, reloadCounter]);

  useEffect(() => {
    if (targetQuoteId) {
      setViewMode('DETAIL');
      fetchDetail(targetQuoteId);
    } else {
      setViewMode('QUEUE');
      fetchQueue();
    }
  }, [targetQuoteId]);

  const handleSelectQuote = (quoteId) => {
    setActiveQuotationId(quoteId);
    setViewMode('DETAIL');
    fetchDetail(quoteId);
  };

  const handleBackToQueue = () => {
    setActiveQuotationId('');
    setViewMode('QUEUE');
    if (urlParamId) {
      navigate('/workspace/approval');
    }
    fetchQueue();
  };

  // Handle Approval Submission
  const handleConfirmApproval = async () => {
    if (!detailData?.activeApprovalRequest?.id && !detailData?.quotation?.id) return;
    const reqId = detailData?.activeApprovalRequest?.id || detailData?.quotation?.id;

    setActionLoading(true);
    setError('');
    try {
      await apiFetch(`/approvals/${reqId}/action`, {
        method: 'POST',
        body: JSON.stringify({
          action: 'APPROVED',
          reason: approvalComment || 'Approved by Sales Manager'
        })
      });

      setSuccessMsg('Quotation approved successfully!');
      setShowApproveModal(false);
      setApprovalComment('');
      await fetchDetail(detailData.quotation.id);
      fetchQueue();
    } catch (err) {
      setError(err.message || 'Failed to approve quotation');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Rejection Submission
  const handleConfirmRejection = async () => {
    if (!rejectionReason || rejectionReason.trim() === '') {
      setError('Rejection reason is mandatory.');
      return;
    }
    const reqId = detailData?.activeApprovalRequest?.id || detailData?.quotation?.id;

    setActionLoading(true);
    setError('');
    try {
      await apiFetch(`/approvals/${reqId}/action`, {
        method: 'POST',
        body: JSON.stringify({
          action: 'REJECTED',
          reason: rejectionReason.trim()
        })
      });

      setSuccessMsg('Quotation rejected.');
      setShowRejectModal(false);
      setRejectionReason('');
      await fetchDetail(detailData.quotation.id);
      fetchQueue();
    } catch (err) {
      setError(err.message || 'Failed to reject quotation');
    } finally {
      setActionLoading(false);
    }
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
      
      {/* HEADER BAR */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#0f172a' }}>
              {viewMode === 'QUEUE' ? 'Manager Approval Queue' : `Approval Review: Quote #${detailData?.quotation?.quoteNumber || activeQuotationId?.slice(0, 8)}`}
            </h1>
            {viewMode === 'DETAIL' && (
              <span className={`badge ${getRiskBadgeClass(detailData?.riskAnalysis?.riskLevel)}`}>
                Risk Level: {detailData?.riskAnalysis?.riskLevel || 'LOW'} ({detailData?.riskAnalysis?.blendedRiskScore || 0}/100)
              </span>
            )}
          </div>
          <p style={{ color: '#475569', fontSize: '0.85rem' }}>
            {viewMode === 'QUEUE'
              ? 'Evaluate pending risk score requests, filter governance status & inspect quotation details'
              : 'Complete 360-degree quotation context, line item discounts, risk factors & workflow history'}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {viewMode === 'DETAIL' ? (
            <button onClick={handleBackToQueue} className="btn btn-outline">
              <ArrowLeft size={16} />
              <span>Back to Queue</span>
            </button>
          ) : (
            <a
              href="/portal"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-outline"
              style={{ color: '#059669', borderColor: '#a7f3d0', backgroundColor: '#ecfdf5', textDecoration: 'none' }}
            >
              <MessageSquare size={16} />
              <span>Customer Portal</span>
            </a>
          )}
          <button onClick={() => navigate('/workspace/quotation-builder')} className="btn btn-secondary">
            <FileText size={16} />
            <span>Open Builder</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="badge-red" style={{ padding: '0.75rem 1rem', borderRadius: '8px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="badge-green" style={{ padding: '0.75rem 1rem', borderRadius: '8px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <CheckCircle size={16} />
          <span>{successMsg}</span>
        </div>
      )}

      {/* ==================================================================== */}
      {/* VIEW MODE 1: MANAGER APPROVAL QUEUE LIST VIEW                        */}
      {/* ==================================================================== */}
      {viewMode === 'QUEUE' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* SEARCH & FILTERS BAR */}
          <div className="card card-glass" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
            
            {/* Search Input */}
            <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: '360px' }}>
              <Search size={16} color="#64748b" style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                className="form-input"
                style={{ paddingLeft: '2.25rem' }}
                placeholder="Search by quote number or customer..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Filter Group */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Filter size={14} color="#64748b" />
                <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: '600' }}>Risk Level:</span>
              </div>
              <select className="form-select" value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)} style={{ padding: '0.35rem 0.65rem' }}>
                <option value="ALL">All Risk Levels</option>
                <option value="LOW">Low (0 - 25)</option>
                <option value="MEDIUM">Medium (26 - 50)</option>
                <option value="HIGH">High (51 - 75)</option>
                <option value="CRITICAL">Critical (76 - 100)</option>
              </select>

              <select className="form-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ padding: '0.35rem 0.65rem' }}>
                <option value="ALL">All Statuses</option>
                <option value="PENDING_APPROVAL">Pending Approval</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
                <option value="READY_FOR_FULFILLMENT">Ready for Fulfillment</option>
              </select>

              <select className="form-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ padding: '0.35rem 0.65rem' }}>
                <option value="riskScore">Sort by Risk Score</option>
                <option value="amount">Sort by Amount</option>
                <option value="date">Sort by Date</option>
              </select>

              <button
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                className="btn btn-outline btn-sm"
                title="Toggle sort order"
              >
                {sortOrder === 'asc' ? '↑ Asc' : '↓ Desc'}
              </button>
            </div>
          </div>

          {/* QUEUE ITEMS LIST TABLE */}
          {queueLoading ? (
            <div className="empty-state">
              <span className="spinner" style={{ width: '2rem', height: '2rem' }} />
            </div>
          ) : queueItems.length === 0 ? (
            <div className="card empty-state" style={{ padding: '3rem 1.5rem' }}>
              <ShieldCheck size={42} color="#059669" />
              <h3 style={{ color: '#0f172a', marginTop: '0.5rem' }}>No Quotation Approval Requests Found</h3>
              <p style={{ color: '#475569', fontSize: '0.875rem' }}>All quotations are within governance limits or match your filter criteria.</p>
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
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
                      <th>Governance Status</th>
                      <th style={{ textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {queueItems.map((item) => (
                      <tr key={item.id} style={{ cursor: 'pointer' }} onClick={() => handleSelectQuote(item.quotationId)}>
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
                        <td>
                          <span className={`badge ${item.status === 'PENDING_APPROVAL' ? 'badge-amber' : item.status === 'APPROVED' ? 'badge-green' : 'badge-blue'}`}>
                            {item.status}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectQuote(item.quotationId);
                            }}
                            className="btn btn-primary btn-sm"
                          >
                            <span>Inspect & Act</span>
                            <ChevronRight size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* VIEW MODE 2: COMPLETE 360-DEGREE APPROVAL DETAIL VIEW                 */}
      {/* ==================================================================== */}
      {viewMode === 'DETAIL' && (
        detailLoading ? (
          <div className="empty-state">
            <span className="spinner" style={{ width: '2rem', height: '2rem' }} />
          </div>
        ) : !detailData ? (
          <div className="card empty-state">
            <AlertTriangle size={32} color="#dc2626" />
            <p>Failed to load approval context for this quotation.</p>
            <button onClick={handleBackToQueue} className="btn btn-outline" style={{ marginTop: '1rem' }}>Back to Queue</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            
            {/* ACTION BANNER HEADER */}
            <div className="card card-glass" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <div style={{ fontSize: '0.8rem', color: '#475569', fontWeight: '600', textTransform: 'uppercase' }}>
                  Approval Governance Decision Stage
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#0f172a', marginTop: '0.15rem' }}>
                  Quote #{detailData.quotation.quoteNumber} — Status:{' '}
                  <span className={`badge ${
                    ['APPROVED', 'READY_FOR_FULFILLMENT', 'CONFIRMED', 'FULFILLED', 'ALLOCATED'].includes(detailData.quotation.status?.toUpperCase())
                      ? 'badge-green'
                      : detailData.quotation.status === 'REJECTED'
                      ? 'badge-red'
                      : 'badge-amber'
                  }`}>
                    {detailData.quotation.status}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {['APPROVED', 'READY_FOR_FULFILLMENT', 'CONFIRMED', 'FULFILLED', 'ALLOCATED'].includes(detailData.quotation.status?.toUpperCase()) ? (
                  <button className="btn btn-success" disabled style={{ opacity: 1, cursor: 'default', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <CheckCircle size={16} />
                    <span>Approved</span>
                  </button>
                ) : detailData.quotation.status === 'REJECTED' ? (
                  <button className="btn btn-danger" disabled style={{ opacity: 1, cursor: 'default', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <XCircle size={16} />
                    <span>Rejected</span>
                  </button>
                ) : detailData.quotation.status === 'RETURNED_FOR_REVISION' ? (
                  <button className="btn btn-amber" disabled style={{ opacity: 1, cursor: 'default', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <RotateCcw size={16} />
                    <span>Returned for Revision</span>
                  </button>
                ) : (() => {
                  const normalizeRole = (r) => {
                    const role = (r || '').toUpperCase();
                    if (['SALES_REP', 'REP', 'SALES_REPRESENTATIVE'].includes(role)) return 'REP';
                    if (['SALES_MANAGER', 'MANAGER', 'SALES_MGR', 'APPROVER'].includes(role)) return 'MANAGER';
                    if (['FINANCE', 'FINANCE_OPERATIONS', 'FINANCE_ADMIN', 'OPS'].includes(role)) return 'FINANCE';
                    if (['CUSTOMER', 'PORTAL_USER'].includes(role)) return 'CUSTOMER';
                    if (['ADMIN'].includes(role)) return 'ADMIN';
                    return role;
                  };

                  const userRoleNorm = normalizeRole(user?.role);
                  const isCreator = detailData?.quotation?.userId === user?.id;
                  const currentStep = detailData?.activeApprovalRequest?.currentStep || 'MANAGER';

                  const canUserApprove = (() => {
                    if (!detailData?.quotation || detailData.quotation.status !== 'PENDING_APPROVAL') return false;
                    if (isCreator) return false;
                    if (userRoleNorm === 'REP' || userRoleNorm === 'CUSTOMER') return false;
                    if (userRoleNorm === 'ADMIN') return true;
                    return userRoleNorm === currentStep;
                  })();

                  if (canUserApprove) {
                    return (
                      <>
                        <button
                          onClick={() => setShowRevisionModal(true)}
                          className="btn btn-warning"
                          style={{ backgroundColor: '#d97706', color: '#fff', borderColor: '#d97706' }}
                        >
                          <RotateCcw size={16} />
                          <span>Return for Revision</span>
                        </button>
                        <button
                          onClick={() => setShowRejectModal(true)}
                          className="btn btn-danger"
                        >
                          <XCircle size={16} />
                          <span>Reject Quotation</span>
                        </button>
                        <button
                          onClick={() => setShowApproveModal(true)}
                          className="btn btn-success"
                        >
                          <CheckCircle size={16} />
                          <span>Approve Quotation</span>
                        </button>
                      </>
                    );
                  }

                  return (
                    <div style={{ backgroundColor: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '6px', padding: '0.5rem 0.85rem', fontSize: '0.825rem', color: '#92400e', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <AlertTriangle size={16} color="#d97706" />
                      <span>
                        {isCreator
                          ? `Submitted by you • Awaiting ${currentStep === 'FINANCE' ? 'Finance' : 'Sales Manager'} review`
                          : `Awaiting ${currentStep === 'FINANCE' ? 'Finance' : 'Sales Manager'} review`}
                      </span>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* TWO COLUMN GRID: SUMMARY CARDS */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '1.25rem' }}>
              
              {/* 1. QUOTATION INFORMATION CARD */}
              <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem', fontWeight: '700', color: '#0f172a' }}>
                  <FileText size={18} color="#2563eb" />
                  <span>1. Quotation Information</span>
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.85rem' }}>
                  <div><span style={{ color: '#64748b' }}>Quote Number:</span> <strong style={{ color: '#0f172a' }}>{detailData.quotation.quoteNumber}</strong></div>
                  <div><span style={{ color: '#64748b' }}>Currency:</span> <strong style={{ color: '#0f172a' }}>{detailData.quotation.currency}</strong></div>
                  <div><span style={{ color: '#64748b' }}>Created Date:</span> <span style={{ color: '#0f172a' }}>{new Date(detailData.quotation.createdAt).toLocaleDateString()}</span></div>
                  <div><span style={{ color: '#64748b' }}>Expiration Date:</span> <span style={{ color: '#0f172a' }}>{new Date(detailData.quotation.expirationDate).toLocaleDateString()}</span></div>
                  <div><span style={{ color: '#64748b' }}>Sales Rep:</span> <strong style={{ color: '#0f172a' }}>{detailData.quotation.salesRep.name}</strong></div>
                  <div><span style={{ color: '#64748b' }}>Rep Email:</span> <span style={{ color: '#0f172a' }}>{detailData.quotation.salesRep.email}</span></div>
                </div>
              </div>

              {/* 2. CUSTOMER INFORMATION CARD */}
              <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem', fontWeight: '700', color: '#0f172a' }}>
                  <Building size={18} color="#7c3aed" />
                  <span>2. Customer Information</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.85rem' }}>
                  <div><span style={{ color: '#64748b' }}>Customer Name:</span> <strong style={{ color: '#0f172a' }}>{detailData.customer.name}</strong></div>
                  <div><span style={{ color: '#64748b' }}>Company:</span> <span style={{ color: '#0f172a' }}>{detailData.customer.company}</span></div>
                  <div><span style={{ color: '#64748b' }}>Email:</span> <span style={{ color: '#0f172a' }}>{detailData.customer.email}</span></div>
                  <div><span style={{ color: '#64748b' }}>Phone:</span> <span style={{ color: '#0f172a' }}>{detailData.customer.phone}</span></div>
                  <div><span style={{ color: '#64748b' }}>Customer Tier:</span> <span className="badge badge-purple">{detailData.customer.tier}</span></div>
                  <div><span style={{ color: '#64748b' }}>Allowed Discount Cap:</span> <span className="badge badge-green">{detailData.customer.allowedDiscountLimit}% Max</span></div>
                </div>
              </div>
            </div>

            {/* 3. QUOTATION LINE ITEMS TABLE */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem', fontWeight: '700', color: '#0f172a' }}>
                  <Layers size={18} color="#2563eb" />
                  <span>3. Quotation Line Items ({detailData.lineItems.length})</span>
                </div>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Product Name & SKU</th>
                      <th>Category</th>
                      <th>Qty</th>
                      <th>Original Base</th>
                      <th>Requested Discount</th>
                      <th>Allowed Limit</th>
                      <th>Discount Excess</th>
                      <th>Final Unit Price</th>
                      <th>Line Total</th>
                      <th>Product Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailData.lineItems.map((line) => (
                      <tr key={line.id} style={{ backgroundColor: line.isViolation ? '#fef2f2' : 'transparent' }}>
                        <td>
                          <div style={{ fontWeight: '700', color: '#0f172a' }}>{line.productName}</div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>SKU: {line.sku}</div>
                        </td>
                        <td><span className="badge badge-purple">{line.category}</span></td>
                        <td style={{ fontWeight: '600' }}>{line.quantity}</td>
                        <td>${line.originalBasePrice.toFixed(2)}</td>
                        <td>
                          <span className={`badge ${line.isViolation ? 'badge-red' : 'badge-green'}`}>
                            {line.discountPercent}%
                          </span>
                        </td>
                        <td>
                          <span className="badge badge-blue">
                            {line.allowedDiscountLimit}% Cap
                          </span>
                        </td>
                        <td>
                          {line.discountExcess > 0 ? (
                            <span className="badge badge-red" style={{ fontWeight: 700 }}>
                              +{line.discountExcess}% Excess
                            </span>
                          ) : (
                            <span className="badge badge-green">0% (OK)</span>
                          )}
                        </td>
                        <td style={{ fontWeight: '600' }}>${line.finalUnitPrice.toFixed(2)}</td>
                        <td style={{ fontWeight: '700', color: '#059669' }}>${line.lineTotal.toFixed(2)}</td>
                        <td>
                          <span className="badge badge-purple" title={`Margin Profit: $${line.marginAmount}`}>
                            {line.marginPercent}% Margin
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 4. TOTALS & DISCOUNT ANALYSIS GRID */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 7fr) minmax(0, 5fr)', gap: '1.25rem', alignItems: 'start' }}>
              
              {/* 5. DISCOUNT ANALYSIS CARD */}
              <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem', fontWeight: '700', color: '#0f172a' }}>
                  <TrendingUp size={18} color="#d97706" />
                  <span>5. Itemized Discount Governance Analysis</span>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table className="table" style={{ fontSize: '0.825rem' }}>
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Category</th>
                        <th>Actual Disc</th>
                        <th>Allowed Limit</th>
                        <th>Excess</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailData.discountAnalysis.map((disc, idx) => (
                        <tr key={idx}>
                          <td style={{ fontWeight: '600', color: '#0f172a' }}>{disc.productName}</td>
                          <td>{disc.category}</td>
                          <td style={{ fontWeight: '700', color: disc.excess > 0 ? '#dc2626' : '#0f172a' }}>{disc.actualDiscount}%</td>
                          <td>{disc.allowedDiscount}%</td>
                          <td style={{ color: disc.excess > 0 ? '#dc2626' : '#059669' }}>+{disc.excess}%</td>
                          <td>
                            <span className={`badge ${disc.status === 'Violation' ? 'badge-red' : 'badge-green'}`}>
                              {disc.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 4. QUOTATION TOTALS SUMMARY */}
              <div className="card card-glass" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem', fontWeight: '700', color: '#0f172a' }}>
                  <DollarSign size={18} color="#059669" />
                  <span>4. Quotation Totals Summary</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}>
                    <span>Gross Subtotal:</span>
                    <strong style={{ color: '#0f172a' }}>${detailData.totals.subtotal.toFixed(2)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#dc2626' }}>
                    <span>Total Discount Amount ({detailData.totals.overallDiscountPercent}%):</span>
                    <strong>-${detailData.totals.totalDiscountAmount.toFixed(2)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}>
                    <span>One-Time Charges:</span>
                    <span>${detailData.totals.oneTimeTotal.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}>
                    <span>Recurring Subscriptions:</span>
                    <span>${detailData.totals.recurringTotal.toFixed(2)}</span>
                  </div>
                  <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '0.65rem', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: '1rem', fontWeight: '800', color: '#0f172a' }}>Grand Total:</span>
                    <span style={{ fontSize: '1.5rem', fontWeight: '800', color: '#059669' }}>${detailData.totals.grandTotal.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 6. RISK ANALYSIS & FACTORS CARD */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem', fontWeight: '700', color: '#0f172a' }}>
                  <AlertOctagon size={18} color="#dc2626" />
                  <span>6. Backend Governance Risk Engine Analysis</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <span style={{ fontSize: '0.85rem', color: '#475569' }}>Overall Risk Score:</span>
                  <span className={`badge ${getRiskBadgeClass(detailData.riskAnalysis.riskLevel)}`} style={{ fontSize: '1rem', padding: '0.35rem 0.75rem' }}>
                    {detailData.riskAnalysis.blendedRiskScore} / 100 — {detailData.riskAnalysis.riskLevel}
                  </span>
                </div>
              </div>

              <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#0f172a' }}>Triggered Risk Factors & Governance Overage Explanations:</div>
                <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.825rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  {detailData.riskAnalysis.riskFactors.map((factor, idx) => (
                    <li key={idx} style={{ color: factor.includes('exceeds') ? '#dc2626' : '#0f172a' }}>
                      {factor}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* 8. CUSTOMER NEGOTIATION INFORMATION (IF PRESENT) */}
            {detailData.negotiationInfo && (
              <div className="card" style={{ borderLeft: '4px solid #3b82f6', backgroundColor: '#eff6ff', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem', fontWeight: '700', color: '#1d4ed8' }}>
                  <MessageSquare size={18} />
                  <span>8. Customer Negotiation & Counter-Offer Trail</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', fontSize: '0.85rem' }}>
                  <div><span style={{ color: '#475569' }}>Previous Approved Discount:</span> <strong style={{ color: '#0f172a' }}>{detailData.negotiationInfo.previousDiscountPercent}%</strong></div>
                  <div><span style={{ color: '#475569' }}>Customer Requested Discount:</span> <strong style={{ color: '#dc2626' }}>{detailData.negotiationInfo.requestedDiscountPercent}%</strong></div>
                  <div><span style={{ color: '#475569' }}>Discount Increase:</span> <span className="badge badge-amber">+{detailData.negotiationInfo.discountDeltaPercent}%</span></div>
                </div>

                {detailData.negotiationInfo.customerComments && (
                  <div style={{ backgroundColor: '#ffffff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '0.75rem', fontSize: '0.825rem', color: '#0f172a', fontStyle: 'italic' }}>
                    "{detailData.negotiationInfo.customerComments}"
                  </div>
                )}
              </div>
            )}

            {/* 7. APPROVAL HISTORY STEPPER */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem', fontWeight: '700', color: '#0f172a' }}>
                <Clock size={18} color="#7c3aed" />
                <span>7. Approval Step Audit History & Timeline</span>
              </div>

              {detailData.approvalHistory.length === 0 ? (
                <div className="empty-state" style={{ padding: '1rem' }}>
                  <p style={{ fontSize: '0.85rem', color: '#64748b' }}>No prior approval step actions recorded.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {detailData.approvalHistory.map((step, idx) => (
                    <div key={step.id || idx} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', backgroundColor: '#f8fafc', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: step.action === 'APPROVED' ? '#059669' : step.action === 'REJECTED' ? '#dc2626' : '#d97706', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '0.8rem' }}>
                        {idx + 1}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#0f172a' }}>
                          {step.approverName} ({step.approverRole}) — <span className={`badge ${step.action === 'APPROVED' ? 'badge-green' : 'badge-red'}`}>{step.action}</span>
                        </div>
                        {step.reason && <div style={{ fontSize: '0.8rem', color: '#475569', fontStyle: 'italic' }}>"{step.reason}"</div>}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        {new Date(step.createdAt).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )
      )}

      {/* ==================================================================== */}
      {/* APPROVAL CONFIRMATION MODAL                                          */}
      {/* ==================================================================== */}
      {showApproveModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
          <div className="card" style={{ width: '100%', maxWidth: '480px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#ecfdf5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircle size={22} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#0f172a' }}>Approve Quotation?</h3>
                <p style={{ fontSize: '0.8rem', color: '#475569' }}>Are you sure you want to approve quotation #{detailData?.quotation?.quoteNumber}?</p>
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Optional Manager Approval Comment</label>
              <textarea
                className="form-textarea"
                rows="3"
                placeholder="Enter any optional approval notes..."
                value={approvalComment}
                onChange={(e) => setApprovalComment(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button onClick={() => setShowApproveModal(false)} className="btn btn-outline" disabled={actionLoading}>Cancel</button>
              <button onClick={handleConfirmApproval} className="btn btn-success" disabled={actionLoading}>
                {actionLoading ? <span className="spinner" /> : <span>Confirm Approval</span>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* REJECTION MANDATORY REASON MODAL                                     */}
      {/* ==================================================================== */}
      {showRejectModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
          <div className="card" style={{ width: '100%', maxWidth: '480px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#fef2f2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <XCircle size={22} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#0f172a' }}>Reject Quotation</h3>
                <p style={{ fontSize: '0.8rem', color: '#475569' }}>Please provide a mandatory reason for rejecting this quotation.</p>
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Rejection Reason (Required)</label>
              <textarea
                className="form-textarea"
                rows="3"
                placeholder="Explain why this quotation is being rejected..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button onClick={() => setShowRejectModal(false)} className="btn btn-outline" disabled={actionLoading}>Cancel</button>
              <button onClick={handleConfirmRejection} className="btn btn-danger" disabled={actionLoading || !rejectionReason.trim()}>
                {actionLoading ? <span className="spinner" /> : <span>Confirm Rejection</span>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* RETURN FOR REVISION MANDATORY REASON MODAL                            */}
      {/* ==================================================================== */}
      {showRevisionModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
          <div className="card" style={{ width: '100%', maxWidth: '480px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#fffbe6', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <RotateCcw size={22} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#0f172a' }}>Return Quotation for Revision</h3>
                <p style={{ fontSize: '0.8rem', color: '#475569' }}>Please provide a reason for returning this quotation to the Sales Rep for revision.</p>
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Revision Reason (Required)</label>
              <textarea
                className="form-textarea"
                rows="3"
                placeholder="Explain what needs to be revised..."
                value={revisionReason}
                onChange={(e) => setRevisionReason(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button onClick={() => setShowRevisionModal(false)} className="btn btn-outline" disabled={actionLoading}>Cancel</button>
              <button onClick={handleConfirmRevision} className="btn btn-warning" style={{ backgroundColor: '#d97706', color: '#fff' }} disabled={actionLoading || !revisionReason.trim()}>
                {actionLoading ? <span className="spinner" /> : <span>Confirm Return for Revision</span>}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
