import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../../context/WorkspaceContext';
import { apiFetch } from '../../utils/api';
import {
  BarChart3,
  Clock,
  AlertTriangle,
  TrendingUp,
  Bell,
  CheckCircle,
  ArrowRight,
  User,
  DollarSign
} from 'lucide-react';

export default function DealHealthDashboard() {
  const { setActiveQuotationId, reloadCounter } = useWorkspace();
  const navigate = useNavigate();

  const [healthData, setHealthData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [nudgingId, setNudgingId] = useState('');
  const [error, setError] = useState('');
  const [toastMsg, setToastMsg] = useState('');

  const fetchHealthData = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch('/reports/deal-health');
      setHealthData(data);
    } catch (err) {
      setError(err.message || 'Failed to fetch deal health analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealthData();
  }, [reloadCounter]);

  const handleNudge = async (quotationId, e) => {
    e.stopPropagation();
    setNudgingId(quotationId);
    setToastMsg('');

    try {
      await apiFetch(`/reports/deal-health/${quotationId}/nudge`, {
        method: 'POST'
      });
      setToastMsg(`Nudge notification sent to assigned sales rep for deal #${quotationId.slice(0, 8)}!`);
      setTimeout(() => setToastMsg(''), 3000);
    } catch (err) {
      setError('Failed to send nudge notification');
    } finally {
      setNudgingId('');
    }
  };

  const handleOpenDeal = (quotationId, status) => {
    setActiveQuotationId(quotationId);
    if (status === 'PENDING_APPROVAL') {
      navigate('/workspace/approval');
    } else {
      navigate('/workspace/quotation-builder');
    }
  };

  const stalledDeals = healthData?.stalledDeals || [];
  const discountAnomalies = healthData?.discountAnomalies || [];
  const deliverySlippage = healthData?.deliverySlippage || [];

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#0f172a' }}>Deal Health Dashboard</h1>
          <p style={{ color: '#475569', fontSize: '0.85rem' }}>Executive pipeline analytics, stalled deals, discount anomalies & delivery slippage</p>
        </div>

        <button onClick={fetchHealthData} className="btn btn-secondary btn-sm">
          <Clock size={14} />
          <span>Refresh Metrics</span>
        </button>
      </div>

      {error && (
        <div className="badge-red" style={{ padding: '0.75rem 1rem', borderRadius: '8px', fontSize: '0.85rem' }}>
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      {toastMsg && (
        <div className="badge-green" style={{ padding: '0.75rem 1rem', borderRadius: '8px', fontSize: '0.85rem' }}>
          <CheckCircle size={16} />
          <span>{toastMsg}</span>
        </div>
      )}

      {loading ? (
        <div className="empty-state">
          <span className="spinner" style={{ width: '2rem', height: '2rem' }} />
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.25rem' }}>
          
          {/* SECTION 1: STALLED DEALS */}
          <div className="card card-glass" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '700', color: '#d97706', fontSize: '0.95rem' }}>
                <Clock size={18} />
                <span>Stalled Deals ({stalledDeals.length})</span>
              </div>
              <span className="badge badge-amber" style={{ fontSize: '0.65rem' }}>Inactive &gt; 5 Days</span>
            </div>

            {stalledDeals.length === 0 ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: '#64748b', fontSize: '0.825rem' }}>
                No stalled deals flagged in the current pipeline.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {stalledDeals.map((deal) => (
                  <div
                    key={deal.quotationId || deal.id}
                    onClick={() => handleOpenDeal(deal.quotationId || deal.id, deal.status)}
                    style={{
                      backgroundColor: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      padding: '0.85rem',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.5rem'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: '700', color: '#2563eb', fontSize: '0.875rem' }}>
                        {deal.quoteNumber || deal.quotationId?.slice(0, 8)}
                      </span>
                      <span className="badge badge-amber">{deal.daysInactive || 10} days idle</span>
                    </div>

                    <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#0f172a' }}>
                      {deal.customerName || 'Acme Logistics'}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px dashed #e2e8f0', paddingTop: '0.4rem', fontSize: '0.775rem' }}>
                      <span style={{ fontWeight: '700', color: '#059669' }}>
                        ${(deal.totalAmount || 5000).toLocaleString()}
                      </span>

                      <button
                        onClick={(e) => handleNudge(deal.quotationId || deal.id, e)}
                        className="btn btn-secondary btn-sm"
                        disabled={nudgingId === (deal.quotationId || deal.id)}
                      >
                        <Bell size={13} />
                        <span>Nudge Rep</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SECTION 2: DISCOUNT ANOMALIES */}
          <div className="card card-glass" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '700', color: '#dc2626', fontSize: '0.95rem' }}>
                <AlertTriangle size={18} />
                <span>Discount Anomalies ({discountAnomalies.length})</span>
              </div>
              <span className="badge badge-red" style={{ fontSize: '0.65rem' }}>&gt; 1.5x Rep Avg</span>
            </div>

            {discountAnomalies.length === 0 ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: '#64748b', fontSize: '0.825rem' }}>
                No discount anomalies detected.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {discountAnomalies.map((deal) => (
                  <div
                    key={deal.quotationId || deal.id}
                    onClick={() => handleOpenDeal(deal.quotationId || deal.id, deal.status)}
                    style={{
                      backgroundColor: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      padding: '0.85rem',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.5rem'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: '700', color: '#2563eb', fontSize: '0.875rem' }}>
                        {deal.quoteNumber || deal.quotationId?.slice(0, 8)}
                      </span>
                      <span className="badge badge-red">{deal.discountGiven || 25}% Given</span>
                    </div>

                    <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#0f172a' }}>
                      {deal.customerName || 'Global Enterprise'}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px dashed #e2e8f0', paddingTop: '0.4rem', fontSize: '0.775rem' }}>
                      <span style={{ color: '#475569' }}>
                        Rep Average: <strong style={{ color: '#0f172a' }}>{deal.repAverageDiscount || 8}%</strong>
                      </span>
                      <button
                        onClick={(e) => handleNudge(deal.quotationId || deal.id, e)}
                        className="btn btn-secondary btn-sm"
                      >
                        <Bell size={13} />
                        <span>Nudge Rep</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SECTION 3: DELIVERY SLIPPAGE */}
          <div className="card card-glass" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '700', color: '#7c3aed', fontSize: '0.95rem' }}>
                <TrendingUp size={18} />
                <span>Delivery Slippage ({deliverySlippage.length})</span>
              </div>
              <span className="badge badge-purple" style={{ fontSize: '0.65rem' }}>Past Target Date</span>
            </div>

            {deliverySlippage.length === 0 ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: '#64748b', fontSize: '0.825rem' }}>
                No delivery slippage flagged.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {deliverySlippage.map((deal) => (
                  <div
                    key={deal.quotationId || deal.id}
                    onClick={() => handleOpenDeal(deal.quotationId || deal.id, deal.status)}
                    style={{
                      backgroundColor: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      padding: '0.85rem',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.5rem'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: '700', color: '#2563eb', fontSize: '0.875rem' }}>
                        {deal.quoteNumber || deal.quotationId?.slice(0, 8)}
                      </span>
                      <span className="badge badge-purple">Slipped {deal.daysSlipped || 14} days</span>
                    </div>

                    <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#0f172a' }}>
                      {deal.customerName || 'Slipped Order Corp'}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px dashed #e2e8f0', paddingTop: '0.4rem', fontSize: '0.775rem', color: '#475569' }}>
                      <span>Target: {new Date(deal.targetDeliveryDate || Date.now()).toLocaleDateString()}</span>
                      <button
                        onClick={(e) => handleNudge(deal.quotationId || deal.id, e)}
                        className="btn btn-secondary btn-sm"
                      >
                        <Bell size={13} />
                        <span>Nudge</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
