import React, { useState, useEffect, useMemo } from 'react';
import { Package, AlertTriangle, CheckCircle, Settings, Truck } from 'lucide-react';
import { useWorkspace } from '../workspace';
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

// --- MOCK SCENARIOS ---
const MOCK_SCENARIOS: Record<string, SplitFulfillmentResponse> = {
  single: {
    orderId: 'ORD-100',
    totalOrderedQuantity: 50,
    backorderedQuantity: 0,
    allocations: [
      { id: 'w-1', name: 'US East (NJ)', quantity: 50, estShipmentCount: 1, estShippingCost: 120 }
    ]
  },
  multi: {
    orderId: 'ORD-101',
    totalOrderedQuantity: 100,
    backorderedQuantity: 0,
    allocations: [
      { id: 'w-1', name: 'US East (NJ)', quantity: 60, estShipmentCount: 2, estShippingCost: 250 },
      { id: 'w-2', name: 'US West (CA)', quantity: 40, estShipmentCount: 1, estShippingCost: 180 }
    ]
  },
  partialBackorder: {
    orderId: 'ORD-102',
    totalOrderedQuantity: 150,
    backorderedQuantity: 50,
    allocations: [
      { id: 'w-1', name: 'US East (NJ)', quantity: 100, estShipmentCount: 3, estShippingCost: 400 }
    ]
  },
  zeroStock: {
    orderId: 'ORD-103',
    totalOrderedQuantity: 200,
    backorderedQuantity: 200,
    allocations: []
  }
};

export const FulfillmentPage: React.FC = () => {
  const { registerReloadListener } = useWorkspace();
  
  // State
  const [activeScenario, setActiveScenario] = useState<string>('multi');
  const [splitData, setSplitData] = useState<SplitFulfillmentResponse>(MOCK_SCENARIOS.multi);
  const [isManualMode, setIsManualMode] = useState(false);
  const [manualAllocations, setManualAllocations] = useState<Record<string, number>>({});
  const [hasNewStock, setHasNewStock] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleScenarioChange = (key: string) => {
    setActiveScenario(key);
    setSplitData(MOCK_SCENARIOS[key]);
    setIsManualMode(false);
    setHasNewStock(false);
    
    const initialManual: Record<string, number> = {};
    MOCK_SCENARIOS[key].allocations.forEach(a => {
      initialManual[a.id] = a.quantity;
    });
    setManualAllocations(initialManual);
  };

  // Backorder Reload Listener
  useEffect(() => {
    const unregister = registerReloadListener(() => {
      if (splitData.backorderedQuantity > 0) {
        // Simulate finding new stock!
        setHasNewStock(true);
      }
    });
    return unregister;
  }, [registerReloadListener, splitData.backorderedQuantity]);

  // Derived values
  const { totalShipments, totalCost } = useMemo(() => {
    return splitData.allocations.reduce(
      (acc, curr) => ({
        totalShipments: acc.totalShipments + curr.estShipmentCount,
        totalCost: acc.totalCost + curr.estShippingCost
      }),
      { totalShipments: 0, totalCost: 0 }
    );
  }, [splitData.allocations]);

  const totalAllocated = useMemo(() => {
    return Object.values(manualAllocations).reduce((sum, qty) => sum + qty, 0);
  }, [manualAllocations]);

  const targetAllocation = splitData.totalOrderedQuantity - splitData.backorderedQuantity;
  const isMismatch = totalAllocated !== targetAllocation;

  // Handlers
  const handleManualQtyChange = (id: string, val: string) => {
    const num = Math.max(0, parseInt(val, 10) || 0);
    setManualAllocations(prev => ({ ...prev, [id]: num }));
  };

  const handleConfirm = async () => {
    setIsSubmitting(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 800));
    alert('Fulfillment split confirmed and submitted to backend!');
    setIsSubmitting(false);
    setIsManualMode(false);
  };

  const handleConsolidate = () => {
    // Simulate moving backorder to a warehouse
    setSplitData(prev => {
      const newAllocations = [...prev.allocations];
      if (newAllocations.length > 0) {
        newAllocations[0].quantity += prev.backorderedQuantity;
      } else {
        newAllocations.push({
          id: 'w-new',
          name: 'US Central (TX)',
          quantity: prev.backorderedQuantity,
          estShipmentCount: 1,
          estShippingCost: 150
        });
      }
      return {
        ...prev,
        allocations: newAllocations,
        backorderedQuantity: 0
      };
    });
    setHasNewStock(false);
    alert('Backorder consolidated into shipment plan.');
  };

  return (
    <div className="page-container fulfillment-container">
      {/* Test Scenario Selector */}
      <div className="ff-scenario-selector">
        <strong>Test Scenario:</strong>
        {Object.keys(MOCK_SCENARIOS).map(key => (
          <label key={key} style={{ display: 'flex', gap: '4px', cursor: 'pointer' }}>
            <input 
              type="radio" 
              name="scenario" 
              value={key} 
              checked={activeScenario === key} 
              onChange={() => handleScenarioChange(key)} 
            />
            {key}
          </label>
        ))}
      </div>

      <div className="page-header" style={{ marginBottom: 0 }}>
        <div>
          <div className="page-badge">
            <Package size={16} />
            <span>Fulfillment Routing</span>
          </div>
          <h1 className="page-title">Warehouse Split — {splitData.orderId}</h1>
          <p className="page-subtitle">Review backend recommendations and confirm shipping plans.</p>
        </div>
      </div>

      {/* Zero Stock Edge Case */}
      {splitData.backorderedQuantity === splitData.totalOrderedQuantity ? (
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
          {splitData.backorderedQuantity > 0 && !hasNewStock && (
            <div className="ff-banner ff-banner-warn">
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <AlertTriangle size={20} />
                <span><strong>Warning:</strong> {splitData.backorderedQuantity} units backordered. No warehouse currently has enough stock to cover the full order.</span>
              </div>
            </div>
          )}

          {splitData.backorderedQuantity > 0 && hasNewStock && (
            <div className="ff-banner ff-banner-success">
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <CheckCircle size={20} />
                <span><strong>Stock Update!</strong> Inventory arrived for your backordered items.</span>
              </div>
              <button type="button" className="ff-consolidate-btn" onClick={handleConsolidate}>
                Consolidate Remaining Backorder
              </button>
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
