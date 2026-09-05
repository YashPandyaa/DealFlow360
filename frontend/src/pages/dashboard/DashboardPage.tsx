import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../workspace';
import { apiFetch } from '../../utils/api';
import { AlertCircle, Clock, TrendingDown, ArrowRight, CheckCircle2 } from 'lucide-react';
import './Dashboard.css';

interface StalledDeal {
  quotationId: string;
  quoteNumber: string;
  customerName: string;
  salesRepId: string;
  salesRepName: string;
  status: string;
  daysInactive: number;
  totalAmount: number;
}

interface DiscountAnomaly {
  quotationId: string;
  quoteNumber: string;
  customerName: string;
  salesRepId: string;
  salesRepName: string;
  status: string;
  discountPercent: number;
  repAvgDiscount: number;
  anomalyRatio: number;
  totalAmount: number;
}

interface DeliverySlippage {
  quotationId: string;
  quoteNumber: string;
  customerName: string;
  salesRepName: string;
  status: string;
  daysSlipped: number;
  targetDeliveryDate: string;
  actualDeliveryDate: string | null;
  totalAmount: number;
}

interface DealHealthData {
  stalledDeals: StalledDeal[];
  discountAnomalies: DiscountAnomaly[];
  deliverySlippage: DeliverySlippage[];
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { registerReloadListener, activeQuotationId, setActiveQuotationId } = useWorkspace();
  const [data, setData] = useState<DealHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [nudgeMsg, setNudgeMsg] = useState('');

  const fetchDashboardData = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/reports/deal-health');
      if (!res.ok) throw new Error('Failed to fetch dashboard data');
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    const unregister = registerReloadListener(fetchDashboardData);
    return () => unregister();
  }, [registerReloadListener]);

  const handleNudge = async (e: React.MouseEvent, quotationId: string) => {
    e.stopPropagation();
    try {
      const res = await apiFetch(`/reports/deal-health/${quotationId}/nudge`, { method: 'POST' });
      if (!res.ok) throw new Error('Nudge failed');
      setNudgeMsg('Nudge sent successfully!');
      setTimeout(() => setNudgeMsg(''), 3000);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleItemClick = (quotationId: string, status: string) => {
    setActiveQuotationId(quotationId);
    if (status === 'PENDING_APPROVAL') {
      navigate('/approval');
    } else {
      navigate(`/quotation-builder/${quotationId}`);
    }
  };

  if (loading && !data) return <div className="dash-container">Loading Deal Health...</div>;
  if (error) return <div className="dash-container" style={{ color: 'red' }}>{error}</div>;
  if (!data) return null;

  const renderEmptyState = (title: string, message: string) => (
    <div className="dash-empty-state">
      <CheckCircle2 size={32} color="#10b981" />
      <h4>{title}</h4>
      <p>{message}</p>
    </div>
  );

  return (
    <div className="dash-container">
      <div className="dash-header">
        <h2>Deal Health Dashboard</h2>
        <p>Operational metrics and anomaly detection across active deals.</p>
        {nudgeMsg && <div className="dash-toast">{nudgeMsg}</div>}
      </div>

      <div className="dash-grid">
        {/* Section 1: Stalled Deals */}
        <section className="dash-section">
          <h3>
            <Clock size={20} className="dash-icon stalled" />
            Stalled Deals
            <span className="dash-count">{data.stalledDeals.length}</span>
          </h3>
          {data.stalledDeals.length === 0 ? (
            renderEmptyState("Pipeline is Flowing", "No deals are currently stalled beyond the threshold.")
          ) : (
            <div className="dash-list">
              {data.stalledDeals.map(deal => (
                <div key={deal.quotationId} className="dash-item" onClick={() => handleItemClick(deal.quotationId, deal.status)}>
                  <div className="dash-item-main">
                    <h4>{deal.customerName} <span className="dash-tag">{deal.quoteNumber}</span></h4>
                    <p className="dash-rep">Rep: {deal.salesRepName}</p>
                  </div>
                  <div className="dash-item-stats">
                    <div className="dash-stat">
                      <span className="dash-stat-val text-red">{deal.daysInactive}d</span>
                      <span className="dash-stat-label">Inactive</span>
                    </div>
                    <div className="dash-stat">
                      <span className="dash-stat-val">${deal.totalAmount.toLocaleString()}</span>
                    </div>
                    <button className="dash-nudge-btn" onClick={(e) => handleNudge(e, deal.quotationId)}>Nudge</button>
                    <ArrowRight size={16} color="#9ca3af" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Section 2: Discount Anomalies */}
        <section className="dash-section">
          <h3>
            <AlertCircle size={20} className="dash-icon anomaly" />
            Discount Anomalies
            <span className="dash-count">{data.discountAnomalies.length}</span>
          </h3>
          {data.discountAnomalies.length === 0 ? (
            renderEmptyState("Healthy Margins", "No significant discount anomalies detected.")
          ) : (
            <div className="dash-list">
              {data.discountAnomalies.map(deal => (
                <div key={deal.quotationId} className="dash-item" onClick={() => handleItemClick(deal.quotationId, deal.status)}>
                  <div className="dash-item-main">
                    <h4>{deal.customerName} <span className="dash-tag">{deal.quoteNumber}</span></h4>
                    <p className="dash-rep">Rep: {deal.salesRepName}</p>
                  </div>
                  <div className="dash-item-stats">
                    <div className="dash-stat">
                      <span className="dash-stat-val text-orange">{deal.discountPercent.toFixed(1)}%</span>
                      <span className="dash-stat-label">Given</span>
                    </div>
                    <div className="dash-stat">
                      <span className="dash-stat-val text-gray">{deal.repAvgDiscount.toFixed(1)}%</span>
                      <span className="dash-stat-label">Rep Avg</span>
                    </div>
                    <button className="dash-nudge-btn" onClick={(e) => handleNudge(e, deal.quotationId)}>Flag</button>
                    <ArrowRight size={16} color="#9ca3af" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Section 3: Delivery Slippage */}
        <section className="dash-section">
          <h3>
            <TrendingDown size={20} className="dash-icon slippage" />
            Delivery Slippage
            <span className="dash-count">{data.deliverySlippage.length}</span>
          </h3>
          {data.deliverySlippage.length === 0 ? (
            renderEmptyState("On Track", "No delayed deliveries detected.")
          ) : (
            <div className="dash-list">
              {data.deliverySlippage.map(deal => (
                <div key={deal.quotationId} className="dash-item" onClick={() => handleItemClick(deal.quotationId, deal.status)}>
                  <div className="dash-item-main">
                    <h4>{deal.customerName} <span className="dash-tag">{deal.quoteNumber}</span></h4>
                    <p className="dash-rep">Rep: {deal.salesRepName}</p>
                    <p className="dash-dates">
                      Target: {new Date(deal.targetDeliveryDate).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="dash-item-stats">
                    <div className="dash-stat">
                      <span className="dash-stat-val text-red">+{deal.daysSlipped}d</span>
                      <span className="dash-stat-label">Slipped</span>
                    </div>
                    <button className="dash-nudge-btn" onClick={(e) => handleNudge(e, deal.quotationId)}>Escalate</button>
                    <ArrowRight size={16} color="#9ca3af" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
