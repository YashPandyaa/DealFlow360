import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Package, AlertTriangle, CheckCircle, Settings, Truck } from 'lucide-react';
import { useWorkspace } from '../workspace';
import { apiFetch } from '../../utils/api';
import './Fulfillment.css';

// --- TYPES ---
export interface WarehouseAllocation {
  id: string;
  name: string;
  quantity: number;
  estShipmentCount: number;
  estShippingCost: number;
}

export interface SplitFulfillmentResponse {
  orderId: string;
  totalOrderedQuantity: number;
  allocations: WarehouseAllocation[];
  backorderedQuantity: number;
}

export const FulfillmentPage: React.FC = () => {
  const { registerReloadListener, activeQuotationId } = useWorkspace();
  
  // State
  const [splitData, setSplitData] = useState<SplitFulfillmentResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [isManualMode, setIsManualMode] = useState(false);
  const [manualAllocations, setManualAllocations] = useState<Record<string, number>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchFulfillmentData = useCallback(async () => {
    if (!activeQuotationId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/warehouses/suggest-split/${activeQuotationId}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to fetch fulfillment split.');
      }
      const data = await res.json();
      setSplitData(data);
      
      const initialManual: Record<string, number> = {};
      data.allocations.forEach((a: WarehouseAllocation) => {
        initialManual[a.id] = a.quantity;
      });
      setManualAllocations(initialManual);
      setIsManualMode(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [activeQuotationId]);

  useEffect(() => {
    fetchFulfillmentData();
    const unregister = registerReloadListener(fetchFulfillmentData);
    return () => unregister();
  }, [fetchFulfillmentData, registerReloadListener]);

  // Derived values
  const { totalShipments, totalCost } = useMemo(() => {
    if (!splitData) return { totalShipments: 0, totalCost: 0 };
    return splitData.allocations.reduce(
      (acc, curr) => ({
        totalShipments: acc.totalShipments + curr.estShipmentCount,
        totalCost: acc.totalCost + curr.estShippingCost
      }),
      { totalShipments: 0, totalCost: 0 }
    );
  }, [splitData]);

  const totalAllocated = useMemo(() => {
    return Object.values(manualAllocations).reduce((sum, qty) => sum + qty, 0);
  }, [manualAllocations]);

  const targetAllocation = splitData ? splitData.totalOrderedQuantity - splitData.backorderedQuantity : 0;
  const isMismatch = totalAllocated !== targetAllocation;

  // Handlers
  const handleManualQtyChange = (id: string, val: string) => {
    const num = Math.max(0, parseInt(val, 10) || 0);
    setManualAllocations(prev => ({ ...prev, [id]: num }));
  };

  const handleConfirm = async () => {
    if (!activeQuotationId) return;
    setIsSubmitting(true);
    try {
      const payload = isManualMode ? { allocations: manualAllocations } : {};
      const res = await apiFetch(`/warehouses/fulfill/${activeQuotationId}`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to submit fulfillment.');
      }
      alert('Fulfillment split confirmed and submitted to backend!');
      setIsManualMode(false);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!activeQuotationId) {
    return (
      <div className="page-container fulfillment-container">
         <div className="ff-banner ff-banner-error" style={{ padding: '32px', textAlign: 'center' }}>
          <h3>No Quotation Selected</h3>
          <p>Please select a quotation from the pipeline to manage fulfillment.</p>
        </div>
      </div>
    );
  }

  if (loading && !splitData) {
    return <div className="page-container fulfillment-container"><p>Loading fulfillment data...</p></div>;
  }

  if (error) {
    return (
      <div className="page-container fulfillment-container">
        <div className="ff-banner ff-banner-error">
          <AlertTriangle size={20} />
          <span><strong>Error:</strong> {error}</span>
        </div>
      </div>
    );
  }

  if (!splitData) return null;

  return (
    <div className="page-container fulfillment-container">
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div>
          <div className="page-badge">
            <Package size={16} />
            <span>Fulfillment Routing</span>
          </div>
          <h1 className="page-title">Warehouse Split — {splitData.orderId || activeQuotationId}</h1>
          <p className="page-subtitle">Review backend recommendations and confirm shipping plans.</p>
        </div>
      </div>

      {/* Zero Stock Edge Case */}
      {splitData.backorderedQuantity === splitData.totalOrderedQuantity && splitData.totalOrderedQuantity > 0 ? (
        <div className="ff-banner ff-banner-error" style={{ padding: '32px', flexDirection: 'column', gap: '16px', textAlign: 'center' }}>
          <AlertTriangle size={48} />
          <div>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '1.25rem' }}>Cannot Fulfill Order</h3>
            <p style={{ margin: 0 }}>All {splitData.totalOrderedQuantity} units are currently backordered. No warehouse has stock.</p>
          </div>
        </div>
      ) : (
        <>
          {/* Backorder Banners */}
          {splitData.backorderedQuantity > 0 && (
            <div className="ff-banner ff-banner-warn">
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <AlertTriangle size={20} />
                <span><strong>Warning:</strong> {splitData.backorderedQuantity} units backordered. No warehouse currently has enough stock to cover the full order.</span>
              </div>
            </div>
          )}

          <div className="ff-header-card">
            <div className="ff-header-top">
              <h3 className="ff-title">Suggested Fulfillment Plan</h3>
              <div className="ff-metrics">
                <div className="ff-metric">
                  <span className="ff-metric-label">Est. Shipments</span>
                  <span className="ff-metric-val">{totalShipments}</span>
                </div>
                <div className="ff-metric">
                  <span className="ff-metric-label">Est. Total Cost</span>
                  <span className="ff-metric-val">${totalCost.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="ff-allocations">
              <div className="ff-allocations-header">
                <h4 className="ff-allocations-title">Warehouse Allocation</h4>
                {isManualMode && (
                  <span style={{ fontSize: '0.875rem', color: isMismatch ? '#dc2626' : '#16a34a', fontWeight: 600 }}>
                    Allocated: {totalAllocated} / {targetAllocation}
                  </span>
                )}
              </div>
              
              <table className="ff-table">
                <thead>
                  <tr>
                    <th>Warehouse</th>
                    <th>Quantity</th>
                    <th>Est. Shipments</th>
                    <th style={{ textAlign: 'right' }}>Est. Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {splitData.allocations.map(alloc => (
                    <tr key={alloc.id}>
                      <td style={{ fontWeight: 500, display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <Truck size={16} color="#6b7280" />
                        {alloc.name}
                      </td>
                      <td>
                        {isManualMode ? (
                          <input 
                            type="number" 
                            className="ff-qty-input"
                            value={manualAllocations[alloc.id] ?? 0}
                            onChange={e => handleManualQtyChange(alloc.id, e.target.value)}
                            min={0}
                            max={targetAllocation}
                          />
                        ) : (
                          <span style={{ fontWeight: 600 }}>{alloc.quantity}</span>
                        )}
                      </td>
                      <td>{alloc.estShipmentCount}</td>
                      <td style={{ textAlign: 'right' }}>${alloc.estShippingCost.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="ff-actions">
                {!isManualMode ? (
                  <>
                    <button 
                      type="button" 
                      className="ff-btn-secondary" 
                      onClick={() => setIsManualMode(true)}
                    >
                      <Settings size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'text-bottom' }} />
                      Manual Override
                    </button>
                    <button 
                      type="button" 
                      className="ff-btn-accept"
                      onClick={handleConfirm}
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? 'Confirming...' : 'Accept Suggested Split'}
                    </button>
                  </>
                ) : (
                  <>
                    <button 
                      type="button" 
                      className="ff-btn-secondary" 
                      onClick={() => {
                        // Reset to original
                        const initialManual: Record<string, number> = {};
                        splitData.allocations.forEach(a => initialManual[a.id] = a.quantity);
                        setManualAllocations(initialManual);
                        setIsManualMode(false);
                      }}
                    >
                      Cancel Override
                    </button>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      {isMismatch && (
                        <span className="ff-error-text">
                          Sum of quantities must equal {targetAllocation}.
                        </span>
                      )}
                      <button 
                        type="button" 
                        className="ff-btn-accept"
                        onClick={handleConfirm}
                        disabled={isMismatch || isSubmitting}
                      >
                        {isSubmitting ? 'Confirming...' : 'Confirm Override'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default FulfillmentPage;
