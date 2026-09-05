import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../../context/WorkspaceContext';
import { apiFetch } from '../../utils/api';
import {
  BarChart2,
  TrendingUp,
  DollarSign,
  ShieldAlert,
  Users,
  Package,
  Layers,
  Calendar,
  Filter,
  CheckCircle,
  XCircle,
  AlertOctagon,
  Clock,
  ChevronRight,
  ShieldCheck,
  CreditCard,
  Percent,
  FileText
} from 'lucide-react';

export default function AdminDashboard() {
  const { user } = useWorkspace();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'sales' | 'risk' | 'discounts' | 'products' | 'fulfillment' | 'billing'

  // Filter State
  const [datePreset, setDatePreset] = useState('30D');
  const [salesRepId, setSalesRepId] = useState('');
  const [customerTier, setCustomerTier] = useState('');
  const [category, setCategory] = useState('');

  // Data State
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Discount Governance Rule State
  const [tierRules, setTierRules] = useState([]);
  const [categoryRules, setCategoryRules] = useState([]);
  const [customerRules, setCustomerRules] = useState([]);
  const [ruleFilterTier, setRuleFilterTier] = useState('ALL');
  const [ruleFilterCategory, setRuleFilterCategory] = useState('ALL');
  
  // Rule Modals State
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [ruleType, setRuleType] = useState('category'); // 'tier' | 'category' | 'customer'
  const [ruleForm, setRuleForm] = useState({
    customerTier: 'BRONZE',
    category: 'Hardware',
    customerId: '',
    customerName: '',
    maxDiscountPercent: 10.0,
    isActive: true
  });
  const [ruleActionLoading, setRuleActionLoading] = useState(false);

  const fetchDiscountRules = async () => {
    try {
      const [tiers, categories, customers] = await Promise.all([
        apiFetch('/discounts/tiers').catch(() => []),
        apiFetch('/discounts/category-ceilings').catch(() => []),
        apiFetch('/discounts/customer-limits').catch(() => [])
      ]);
      setTierRules(Array.isArray(tiers) ? tiers : []);
      setCategoryRules(Array.isArray(categories) ? categories : []);
      setCustomerRules(Array.isArray(customers) ? customers : []);
    } catch (err) {
      console.warn('Failed to load discount rules:', err);
    }
  };

  const fetchAdminStats = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (datePreset && datePreset !== 'ALL') params.append('datePreset', datePreset);
      if (salesRepId) params.append('salesRepId', salesRepId);
      if (customerTier) params.append('customerTier', customerTier);
      if (category) params.append('category', category);

      const data = await apiFetch(`/admin/statistics/overview?${params.toString()}`);
      setStats(data);
    } catch (err) {
      if (err.status === 403 || err.message?.includes('Forbidden') || err.message?.includes('403')) {
        setError('Forbidden: Only ADMIN users can access Admin statistics.');
      } else {
        setError(err.message || 'Failed to fetch Admin statistics');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminStats();
    fetchDiscountRules();
  }, [datePreset, salesRepId, customerTier, category]);

  const getRiskBadgeClass = (level) => {
    switch (level?.toUpperCase()) {
      case 'CRITICAL': return 'badge-red';
      case 'HIGH': return 'badge-amber';
      case 'MEDIUM': return 'badge-purple';
      default: return 'badge-green';
    }
  };

  if (error && error.includes('Forbidden')) {
    return (
      <div className="card empty-state animate-fade-in" style={{ padding: '3rem 1.5rem' }}>
        <ShieldAlert size={48} color="#dc2626" />
        <h2 style={{ color: '#0f172a', marginTop: '0.75rem' }}>Access Restricted (403 Forbidden)</h2>
        <p style={{ color: '#475569', fontSize: '0.9rem', maxWidth: '480px' }}>
          This section requires <strong>ADMIN</strong> privileges. You are currently logged in with role <strong>{user?.role || 'USER'}</strong>.
        </p>
        <button onClick={() => navigate('/workspace/pipeline')} className="btn btn-primary" style={{ marginTop: '1rem' }}>
          Return to Pipeline
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      
      {/* HEADER BAR */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#0f172a' }}>Admin Executive Statistics</h1>
            <span className="badge badge-purple">Enterprise Analytics</span>
          </div>
          <p style={{ color: '#475569', fontSize: '0.85rem' }}>
            Real-time authoritative platform analytics, governance risk metrics & sales performance
          </p>
        </div>

        {/* FILTER BAR */}
        <div className="card card-glass" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.85rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', fontWeight: '600', color: '#475569' }}>
            <Calendar size={14} />
            <span>Range:</span>
          </div>

          <select className="form-select" value={datePreset} onChange={(e) => setDatePreset(e.target.value)} style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}>
            <option value="TODAY">Today</option>
            <option value="7D">Last 7 Days</option>
            <option value="30D">Last 30 Days</option>
            <option value="THIS_MONTH">This Month</option>
            <option value="LAST_MONTH">Last Month</option>
            <option value="THIS_YEAR">This Year</option>
            <option value="ALL">All Time</option>
          </select>

          <select className="form-select" value={customerTier} onChange={(e) => setCustomerTier(e.target.value)} style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}>
            <option value="">All Tiers</option>
            <option value="GOLD">Gold Tier</option>
            <option value="SILVER">Silver Tier</option>
            <option value="BRONZE">Bronze Tier</option>
          </select>

          <select className="form-select" value={category} onChange={(e) => setCategory(e.target.value)} style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}>
            <option value="">All Categories</option>
            <option value="Hardware">Hardware</option>
            <option value="Services">Services</option>
            <option value="Subscriptions">Subscriptions</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="badge-red" style={{ padding: '0.75rem 1rem', borderRadius: '8px', fontSize: '0.85rem' }}>
          <AlertOctagon size={16} />
          <span>{error}</span>
        </div>
      )}

      {loading || !stats ? (
        <div className="empty-state">
          <span className="spinner" style={{ width: '2rem', height: '2rem' }} />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* TOP KPI CARDS GRID */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            
            {/* KPI 1: TOTAL QUOTATIONS */}
            <div className="card card-glass" style={{ padding: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: '600', color: '#475569' }}>TOTAL QUOTATIONS</span>
                <FileText size={18} color="#2563eb" />
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#0f172a' }}>{stats.quotations.total}</div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                <strong style={{ color: '#d97706' }}>{stats.quotations.pending_approval}</strong> Pending Approval
              </div>
            </div>

            {/* KPI 2: CONFIRMED SALES VALUE */}
            <div className="card card-glass" style={{ padding: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: '600', color: '#475569' }}>CONFIRMED REVENUE</span>
                <DollarSign size={18} color="#059669" />
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#059669' }}>${stats.sales.total_confirmed_sales.toLocaleString()}</div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                Avg Deal: <strong>${stats.sales.average_deal_value.toLocaleString()}</strong>
              </div>
            </div>

            {/* KPI 3: AVERAGE RISK SCORE */}
            <div className="card card-glass" style={{ padding: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: '600', color: '#475569' }}>AVG GOVERNANCE RISK</span>
                <AlertOctagon size={18} color={stats.risk.average_score > 50 ? '#dc2626' : '#d97706'} />
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: '800', color: stats.risk.average_score > 50 ? '#dc2626' : '#d97706' }}>
                {stats.risk.average_score} <span style={{ fontSize: '0.9rem', fontWeight: '600', color: '#64748b' }}>/ 100</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                <strong style={{ color: '#dc2626' }}>{stats.risk.high + stats.risk.critical}</strong> High/Critical Deals
              </div>
            </div>

            {/* KPI 4: CONVERSION RATE */}
            <div className="card card-glass" style={{ padding: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: '600', color: '#475569' }}>CONVERSION RATE</span>
                <TrendingUp size={18} color="#7c3aed" />
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#7c3aed' }}>{stats.sales.conversion_rate}%</div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                <strong style={{ color: '#059669' }}>{stats.quotations.confirmed}</strong> Confirmed Deals
              </div>
            </div>

            {/* KPI 5: AVERAGE DISCOUNT */}
            <div className="card card-glass" style={{ padding: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: '600', color: '#475569' }}>AVG DISCOUNT</span>
                <Percent size={18} color="#2563eb" />
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#2563eb' }}>{stats.discounts.average_discount_percent}%</div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                Violations: <strong style={{ color: '#dc2626' }}>{stats.discounts.quotations_with_violations}</strong>
              </div>
            </div>
          </div>

          {/* NAVIGATION TABS */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem', overflowX: 'auto' }}>
            {[
              { id: 'overview', label: 'Executive Overview' },
              { id: 'sales', label: 'Sales & Revenue' },
              { id: 'risk', label: 'Risk & Governance' },
              { id: 'discounts', label: 'Discount Analysis' },
              { id: 'products', label: 'Product Performance' },
              { id: 'fulfillment', label: 'Fulfillment & Inventory' },
              { id: 'billing', label: 'Billing & Subscriptions' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`btn btn-sm ${activeTab === tab.id ? 'btn-primary' : 'btn-outline'}`}
                style={{ whiteSpace: 'nowrap' }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* ================================================================== */}
          {/* TAB 1: EXECUTIVE OVERVIEW                                          */}
          {/* ================================================================== */}
          {activeTab === 'overview' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '1.25rem' }}>
              
              {/* QUOTATION STATUS BREAKDOWN */}
              <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: '700', color: '#0f172a' }}>Quotation Pipeline Status Breakdown</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  {[
                    { label: 'Draft Quotations', count: stats.quotations.draft, color: '#64748b' },
                    { label: 'Sent to Customer', count: stats.quotations.sent, color: '#2563eb' },
                    { label: 'Pending Manager Approval', count: stats.quotations.pending_approval, color: '#d97706' },
                    { label: 'Approved & Ready for Fulfillment', count: stats.quotations.approved, color: '#059669' },
                    { label: 'Under Negotiation / Counter-Offer', count: stats.quotations.under_negotiation, color: '#7c3aed' },
                    { label: 'Confirmed / Fulfilled Orders', count: stats.quotations.confirmed, color: '#059669' },
                    { label: 'Rejected Quotations', count: stats.quotations.rejected, color: '#dc2626' }
                  ].map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f8fafc', padding: '0.65rem 0.85rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                      <span style={{ fontSize: '0.85rem', color: '#0f172a', fontWeight: '500' }}>{item.label}</span>
                      <span className="badge" style={{ backgroundColor: '#ffffff', color: item.color, border: '1px solid #e2e8f0', fontWeight: '700', fontSize: '0.85rem' }}>
                        {item.count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* REVENUE BY CUSTOMER TIER & TOP CUSTOMERS */}
              <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: '700', color: '#0f172a' }}>Top Revenue Generating Customers</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  {stats.customers.top_customers.map((cust, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f8fafc', padding: '0.75rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                      <div>
                        <div style={{ fontWeight: '700', color: '#0f172a', fontSize: '0.875rem' }}>{cust.customerName}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{cust.count} Deals</div>
                      </div>
                      <div style={{ fontWeight: '800', color: '#059669', fontSize: '1rem' }}>
                        ${cust.totalValue.toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ================================================================== */}
          {/* TAB 2: SALES & REVENUE PERFORMANCE                                 */}
          {/* ================================================================== */}
          {activeTab === 'sales' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '1.25rem' }}>
              
              {/* SALES BY SALES REP */}
              <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: '700', color: '#0f172a' }}>Sales Performance by Sales Representative</h3>
                <div style={{ overflowX: 'auto' }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Sales Representative</th>
                        <th>Deals Count</th>
                        <th>Total Quotation Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.sales.sales_by_rep.map((rep, idx) => (
                        <tr key={idx}>
                          <td style={{ fontWeight: '600', color: '#0f172a' }}>{rep.repName}</td>
                          <td>{rep.count}</td>
                          <td style={{ fontWeight: '700', color: '#059669' }}>${rep.totalValue.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* SALES BY PRODUCT CATEGORY */}
              <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: '700', color: '#0f172a' }}>Sales Volume by Product Category</h3>
                <div style={{ overflowX: 'auto' }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Category</th>
                        <th>Quantity Sold</th>
                        <th>Total Category Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.sales.sales_by_category.map((cat, idx) => (
                        <tr key={idx}>
                          <td><span className="badge badge-purple">{cat.category}</span></td>
                          <td style={{ fontWeight: '600' }}>{cat.qty}</td>
                          <td style={{ fontWeight: '700', color: '#059669' }}>${cat.totalValue.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================== */}
          {/* TAB 3: RISK & GOVERNANCE                                           */}
          {/* ================================================================== */}
          {activeTab === 'risk' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              
              {/* RISK DISTRIBUTION GRID */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
                <div className="card" style={{ backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0', textAlign: 'center', padding: '1rem' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#047857' }}>LOW RISK (0-25)</div>
                  <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#047857', marginTop: '0.2rem' }}>{stats.risk.low}</div>
                </div>

                <div className="card" style={{ backgroundColor: '#faf5ff', border: '1px solid #e9d5ff', textAlign: 'center', padding: '1rem' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#6b21a8' }}>MEDIUM RISK (26-50)</div>
                  <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#6b21a8', marginTop: '0.2rem' }}>{stats.risk.medium}</div>
                </div>

                <div className="card" style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', textAlign: 'center', padding: '1rem' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#b45309' }}>HIGH RISK (51-75)</div>
                  <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#b45309', marginTop: '0.2rem' }}>{stats.risk.high}</div>
                </div>

                <div className="card" style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', textAlign: 'center', padding: '1rem' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#b91c1c' }}>CRITICAL RISK (76-100)</div>
                  <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#b91c1c', marginTop: '0.2rem' }}>{stats.risk.critical}</div>
                </div>
              </div>

              {/* TOP RISKY QUOTATIONS TABLE */}
              <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: '700', color: '#0f172a' }}>Top Risky Quotations Requiring Governance Monitoring</h3>
                <div style={{ overflowX: 'auto' }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Quote Number</th>
                        <th>Customer Account</th>
                        <th>Risk Score</th>
                        <th>Risk Level</th>
                        <th>Discount %</th>
                        <th>Status</th>
                        <th style={{ textAlign: 'right' }}>Inspect</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.risk.top_risky_quotations.map((item, idx) => (
                        <tr key={idx} style={{ cursor: 'pointer' }} onClick={() => navigate('/workspace/approval')}>
                          <td style={{ fontWeight: '700', color: '#2563eb' }}>{item.quoteNumber}</td>
                          <td style={{ fontWeight: '600', color: '#0f172a' }}>{item.customerName}</td>
                          <td style={{ fontWeight: '700', color: item.riskScore > 50 ? '#dc2626' : '#d97706' }}>{item.riskScore}</td>
                          <td>
                            <span className={`badge ${getRiskBadgeClass(item.riskLevel)}`}>
                              {item.riskLevel}
                            </span>
                          </td>
                          <td><span className="badge badge-purple">{item.discountPercent}%</span></td>
                          <td><span className="badge badge-blue">{item.status}</span></td>
                          <td style={{ textAlign: 'right' }}>
                            <button onClick={() => navigate('/workspace/approval')} className="btn btn-outline btn-sm">
                              Review
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

          {/* ================================================================== */}
          {/* TAB 4: DISCOUNTS ANALYSIS                                          */}
          {/* ================================================================== */}
          {/* ================================================================== */}
          {/* TAB 4: DISCOUNTS ANALYSIS & GOVERNANCE RULE MANAGEMENT             */}
          {/* ================================================================== */}
          {activeTab === 'discounts' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              
              {/* METRICS CARDS */}
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '1.25rem' }}>
                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: '700', color: '#0f172a' }}>Platform Discount Metrics Summary</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.875rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', backgroundColor: '#f8fafc', padding: '0.75rem', borderRadius: '6px' }}>
                      <span>Average Platform Discount:</span>
                      <strong style={{ color: '#2563eb' }}>{stats.discounts.average_discount_percent}%</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', backgroundColor: '#f8fafc', padding: '0.75rem', borderRadius: '6px' }}>
                      <span>Maximum Single Line Discount:</span>
                      <strong style={{ color: '#dc2626' }}>{stats.discounts.maximum_discount_percent}%</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', backgroundColor: '#f8fafc', padding: '0.75rem', borderRadius: '6px' }}>
                      <span>Total Dollar Discounts Conceded:</span>
                      <strong style={{ color: '#dc2626' }}>-${stats.discounts.total_discount_amount.toLocaleString()}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', backgroundColor: '#f8fafc', padding: '0.75rem', borderRadius: '6px' }}>
                      <span>Quotations with Discount Violations:</span>
                      <strong style={{ color: '#d97706' }}>{stats.discounts.quotations_with_violations} Deals</strong>
                    </div>
                  </div>
                </div>

                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: '700', color: '#0f172a' }}>Approval Engine Conversion Rates</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.875rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', backgroundColor: '#f8fafc', padding: '0.75rem', borderRadius: '6px' }}>
                      <span>Total Approval Requests Processed:</span>
                      <strong style={{ color: '#0f172a' }}>{stats.discounts.number_of_approval_requests}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', backgroundColor: '#ecfdf5', padding: '0.75rem', borderRadius: '6px' }}>
                      <span>Governance Approval Rate:</span>
                      <strong style={{ color: '#059669' }}>{stats.discounts.approval_rate}% Approved</strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* ADMIN DISCOUNT GOVERNANCE RULE MANAGEMENT */}
              <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                  <div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#0f172a' }}>Discount Governance Rules Configuration</h3>
                    <p style={{ fontSize: '0.8rem', color: '#475569' }}>Configure Customer Tier Ceilings, Category Discount Ceilings, and Customer-Specific Limits</p>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    {/* Filters */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem' }}>
                      <Filter size={14} color="#64748b" />
                      <span style={{ fontWeight: '600', color: '#475569' }}>Tier:</span>
                    </div>
                    <select
                      className="form-select"
                      value={ruleFilterTier}
                      onChange={(e) => setRuleFilterTier(e.target.value)}
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                    >
                      <option value="ALL">All Tiers</option>
                      <option value="GOLD">Gold Tier</option>
                      <option value="SILVER">Silver Tier</option>
                      <option value="BRONZE">Bronze Tier</option>
                    </select>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem' }}>
                      <span style={{ fontWeight: '600', color: '#475569' }}>Category:</span>
                    </div>
                    <select
                      className="form-select"
                      value={ruleFilterCategory}
                      onChange={(e) => setRuleFilterCategory(e.target.value)}
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                    >
                      <option value="ALL">All Categories</option>
                      <option value="Hardware">Hardware</option>
                      <option value="Software">Software</option>
                      <option value="Services">Services / Service</option>
                      <option value="Subscriptions">Subscriptions</option>
                    </select>

                    <button
                      onClick={() => {
                        setEditingRule(null);
                        setRuleForm({ customerTier: 'BRONZE', category: 'Hardware', customerId: '', customerName: '', maxDiscountPercent: 10.0, isActive: true });
                        setShowAddModal(true);
                      }}
                      className="btn btn-primary btn-sm"
                    >
                      + Create Rule
                    </button>
                  </div>
                </div>

                {/* RULES TABLE */}
                <div style={{ overflowX: 'auto' }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Rule Type</th>
                        <th>Target (Tier / Category / Customer)</th>
                        <th>Maximum Allowed Discount %</th>
                        <th>Status</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Customer Tier Ceilings */}
                      {tierRules
                        .filter((r) => ruleFilterTier === 'ALL' || r.customerTier === ruleFilterTier)
                        .map((r) => (
                          <tr key={`tier-${r.id}`}>
                            <td><span className="badge badge-purple">Customer Tier Ceiling</span></td>
                            <td style={{ fontWeight: '700', color: '#0f172a' }}>{r.customerTier} Tier</td>
                            <td><span className="badge badge-blue" style={{ fontSize: '0.85rem' }}>{r.maxDiscountPercent}% Max</span></td>
                            <td><span className="badge badge-green">Active</span></td>
                            <td style={{ textAlign: 'right' }}>
                              <button
                                onClick={() => {
                                  setEditingRule({ type: 'tier', id: r.id });
                                  setRuleType('tier');
                                  setRuleForm({ ...ruleForm, customerTier: r.customerTier, maxDiscountPercent: r.maxDiscountPercent });
                                  setShowAddModal(true);
                                }}
                                className="btn btn-outline btn-sm"
                                style={{ marginRight: '0.35rem' }}
                              >
                                Edit
                              </button>
                              <button
                                onClick={async () => {
                                  if (confirm(`Delete tier rule for ${r.customerTier}?`)) {
                                    await apiFetch(`/discounts/tiers/${r.id}`, { method: 'DELETE' });
                                    fetchDiscountRules();
                                  }
                                }}
                                className="btn btn-outline btn-sm"
                                style={{ color: '#dc2626' }}
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}

                      {/* Category Discount Ceilings */}
                      {categoryRules
                        .filter((r) => ruleFilterCategory === 'ALL' || r.category.toLowerCase().includes(ruleFilterCategory.toLowerCase()))
                        .map((r) => (
                          <tr key={`cat-${r.id}`}>
                            <td><span className="badge badge-blue">Category Discount Ceiling</span></td>
                            <td style={{ fontWeight: '700', color: '#0f172a' }}>{r.category}</td>
                            <td><span className="badge badge-purple" style={{ fontSize: '0.85rem' }}>{r.maxDiscountPercent}% Max</span></td>
                            <td><span className="badge badge-green">Active</span></td>
                            <td style={{ textAlign: 'right' }}>
                              <button
                                onClick={() => {
                                  setEditingRule({ type: 'category', id: r.id });
                                  setRuleType('category');
                                  setRuleForm({ ...ruleForm, category: r.category, maxDiscountPercent: r.maxDiscountPercent });
                                  setShowAddModal(true);
                                }}
                                className="btn btn-outline btn-sm"
                                style={{ marginRight: '0.35rem' }}
                              >
                                Edit
                              </button>
                              <button
                                onClick={async () => {
                                  if (confirm(`Delete category ceiling for ${r.category}?`)) {
                                    await apiFetch(`/discounts/category-ceilings/${r.id}`, { method: 'DELETE' });
                                    fetchDiscountRules();
                                  }
                                }}
                                className="btn btn-outline btn-sm"
                                style={{ color: '#dc2626' }}
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}

                      {/* Customer Specific Discount Limits */}
                      {customerRules.map((r) => (
                        <tr key={`cust-${r.id}`}>
                          <td><span className="badge badge-amber">Customer Discount Limit</span></td>
                          <td style={{ fontWeight: '700', color: '#0f172a' }}>{r.customerName || r.customerId}</td>
                          <td><span className="badge badge-green" style={{ fontSize: '0.85rem' }}>{r.maxDiscountPercent}% Max</span></td>
                          <td><span className="badge badge-green">Active</span></td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              onClick={() => {
                                setEditingRule({ type: 'customer', id: r.id });
                                setRuleType('customer');
                                setRuleForm({ ...ruleForm, customerId: r.customerId, customerName: r.customerName || r.customerId, maxDiscountPercent: r.maxDiscountPercent });
                                setShowAddModal(true);
                              }}
                              className="btn btn-outline btn-sm"
                              style={{ marginRight: '0.35rem' }}
                            >
                              Edit
                            </button>
                            <button
                              onClick={async () => {
                                if (confirm(`Delete customer limit for ${r.customerName || r.customerId}?`)) {
                                  await apiFetch(`/discounts/customer-limits/${r.id}`, { method: 'DELETE' });
                                  fetchDiscountRules();
                                }
                              }}
                              className="btn btn-outline btn-sm"
                              style={{ color: '#dc2626' }}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

          {/* CREATE / EDIT DISCOUNT GOVERNANCE RULE MODAL */}
          {showAddModal && (
            <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
              <div className="card" style={{ width: '100%', maxWidth: '480px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#0f172a' }}>
                  {editingRule ? 'Edit Discount Governance Rule' : 'Create New Discount Governance Rule'}
                </h3>

                <div className="form-group">
                  <label className="form-label">Rule Type</label>
                  <select
                    className="form-select"
                    value={ruleType}
                    onChange={(e) => setRuleType(e.target.value)}
                    disabled={Boolean(editingRule)}
                  >
                    <option value="category">Category Discount Ceiling (e.g. Hardware, Services)</option>
                    <option value="tier">Customer Tier Ceiling (e.g. Bronze, Silver, Gold)</option>
                    <option value="customer">Customer-Specific Limit</option>
                  </select>
                </div>

                {ruleType === 'tier' && (
                  <div className="form-group">
                    <label className="form-label">Customer Tier</label>
                    <select
                      className="form-select"
                      value={ruleForm.customerTier}
                      onChange={(e) => setRuleForm({ ...ruleForm, customerTier: e.target.value })}
                    >
                      <option value="BRONZE">BRONZE Tier</option>
                      <option value="SILVER">SILVER Tier</option>
                      <option value="GOLD">GOLD Tier</option>
                    </select>
                  </div>
                )}

                {ruleType === 'category' && (
                  <div className="form-group">
                    <label className="form-label">Product Category Name</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. Hardware, Software, Services"
                      value={ruleForm.category}
                      onChange={(e) => setRuleForm({ ...ruleForm, category: e.target.value })}
                    />
                  </div>
                )}

                {ruleType === 'customer' && (
                  <>
                    <div className="form-group">
                      <label className="form-label">Customer ID / Email</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="e.g. CUST-A or customer@acme.com"
                        value={ruleForm.customerId}
                        onChange={(e) => setRuleForm({ ...ruleForm, customerId: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Customer Name</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="e.g. Acme Corp"
                        value={ruleForm.customerName}
                        onChange={(e) => setRuleForm({ ...ruleForm, customerName: e.target.value })}
                      />
                    </div>
                  </>
                )}

                <div className="form-group">
                  <label className="form-label">Maximum Allowed Discount %</label>
                  <input
                    type="number"
                    className="form-input"
                    min="0"
                    max="100"
                    step="0.5"
                    value={ruleForm.maxDiscountPercent}
                    onChange={(e) => setRuleForm({ ...ruleForm, maxDiscountPercent: parseFloat(e.target.value) || 0 })}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                  <button onClick={() => setShowAddModal(false)} className="btn btn-outline" disabled={ruleActionLoading}>
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      setRuleActionLoading(true);
                      try {
                        if (ruleType === 'tier') {
                          if (editingRule) {
                            await apiFetch(`/discounts/tiers/${editingRule.id}`, {
                              method: 'PUT',
                              body: JSON.stringify({ customerTier: ruleForm.customerTier, maxDiscountPercent: ruleForm.maxDiscountPercent })
                            });
                          } else {
                            await apiFetch('/discounts/tiers', {
                              method: 'POST',
                              body: JSON.stringify({ customerTier: ruleForm.customerTier, maxDiscountPercent: ruleForm.maxDiscountPercent })
                            });
                          }
                        } else if (ruleType === 'category') {
                          if (editingRule) {
                            await apiFetch(`/discounts/category-ceilings/${editingRule.id}`, {
                              method: 'PUT',
                              body: JSON.stringify({ category: ruleForm.category, maxDiscountPercent: ruleForm.maxDiscountPercent })
                            });
                          } else {
                            await apiFetch('/discounts/category-ceilings', {
                              method: 'POST',
                              body: JSON.stringify({ category: ruleForm.category, maxDiscountPercent: ruleForm.maxDiscountPercent })
                            });
                          }
                        } else if (ruleType === 'customer') {
                          await apiFetch('/discounts/customer-limits', {
                            method: 'POST',
                            body: JSON.stringify({ customerId: ruleForm.customerId, customerName: ruleForm.customerName, maxDiscountPercent: ruleForm.maxDiscountPercent })
                          });
                        }
                        setShowAddModal(false);
                        fetchDiscountRules();
                      } catch (err) {
                        alert(err.message || 'Failed to save rule');
                      } finally {
                        setRuleActionLoading(false);
                      }
                    }}
                    className="btn btn-primary"
                    disabled={ruleActionLoading}
                  >
                    {ruleActionLoading ? <span className="spinner" /> : <span>Save Rule</span>}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================== */}
          {/* TAB 5: PRODUCT PERFORMANCE                                         */}
          {/* ================================================================== */}
          {activeTab === 'products' && (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: '700', color: '#0f172a' }}>Top Performing Products by Revenue</h3>
              <div style={{ overflowX: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Product Name</th>
                      <th>Category</th>
                      <th>Quantity Sold</th>
                      <th>Total Revenue</th>
                      <th>Average Discount</th>
                      <th>Target Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.products.top_selling.map((prod, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: '700', color: '#0f172a' }}>{prod.name}</td>
                        <td><span className="badge badge-purple">{prod.category}</span></td>
                        <td style={{ fontWeight: '600' }}>{prod.quantitySold}</td>
                        <td style={{ fontWeight: '700', color: '#059669' }}>${prod.revenue.toLocaleString()}</td>
                        <td><span className="badge badge-blue">{prod.averageDiscount}%</span></td>
                        <td><span className="badge badge-green">{prod.marginPercent}%</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ================================================================== */}
          {/* TAB 6: FULFILLMENT & INVENTORY                                     */}
          {/* ================================================================== */}
          {activeTab === 'fulfillment' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.25rem' }}>
              <div className="card" style={{ textAlign: 'center', padding: '1.5rem' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: '600', color: '#475569' }}>AWAITING FULFILLMENT</div>
                <div style={{ fontSize: '2rem', fontWeight: '800', color: '#d97706', marginTop: '0.25rem' }}>{stats.fulfillment.awaiting_fulfillment}</div>
              </div>

              <div className="card" style={{ textAlign: 'center', padding: '1.5rem' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: '600', color: '#475569' }}>FULLY FULFILLED ORDERS</div>
                <div style={{ fontSize: '2rem', fontWeight: '800', color: '#059669', marginTop: '0.25rem' }}>{stats.fulfillment.fully_fulfilled}</div>
              </div>

              <div className="card" style={{ textAlign: 'center', padding: '1.5rem' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: '600', color: '#475569' }}>PARTIALLY ALLOCATED</div>
                <div style={{ fontSize: '2rem', fontWeight: '800', color: '#7c3aed', marginTop: '0.25rem' }}>{stats.fulfillment.partially_fulfilled}</div>
              </div>
            </div>
          )}

          {/* ================================================================== */}
          {/* TAB 7: BILLING & SUBSCRIPTIONS                                     */}
          {/* ================================================================== */}
          {activeTab === 'billing' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.25rem' }}>
              <div className="card" style={{ textAlign: 'center', padding: '1.25rem' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: '600', color: '#475569' }}>TOTAL INVOICES</div>
                <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#0f172a', marginTop: '0.25rem' }}>{stats.billing.total_invoices}</div>
              </div>

              <div className="card" style={{ textAlign: 'center', padding: '1.25rem' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: '600', color: '#475569' }}>PAID INVOICES</div>
                <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#059669', marginTop: '0.25rem' }}>{stats.billing.paid_invoices}</div>
              </div>

              <div className="card" style={{ textAlign: 'center', padding: '1.25rem' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: '600', color: '#475569' }}>PENDING INVOICES</div>
                <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#d97706', marginTop: '0.25rem' }}>{stats.billing.pending_invoices}</div>
              </div>

              <div className="card" style={{ textAlign: 'center', padding: '1.25rem' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: '600', color: '#475569' }}>ACTIVE SUBSCRIPTIONS</div>
                <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#7c3aed', marginTop: '0.25rem' }}>{stats.billing.active_subscriptions}</div>
              </div>
            </div>
          )}

        </div>
      )}

    </div>
  );
}
