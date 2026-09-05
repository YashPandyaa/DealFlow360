import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../../context/WorkspaceContext';
import { apiFetch } from '../../utils/api';
import {
  Truck,
  Package,
  AlertTriangle,
  CheckCircle,
  Clock,
  Layers,
  FileText,
  RefreshCw,
  Edit3,
  Sliders,
  DollarSign,
  Plus,
  Warehouse as WarehouseIcon,
  Archive
} from 'lucide-react';

export default function FulfillmentScreen() {
  const { activeQuotationId, reloadCounter, user } = useWorkspace();
  const navigate = useNavigate();

  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [suggestedSplit, setSuggestedSplit] = useState(null);
  const [backorders, setBackorders] = useState([]);
  const [warehouses, setWarehouses] = useState([]);

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [manualAllocations, setManualAllocations] = useState({});

  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const normalizeRole = (r) => (r || '').toUpperCase();
  const userRole = normalizeRole(user?.role);
  const canModifyFulfillment = ['FINANCE', 'FINANCE_OPERATIONS', 'ADMIN', 'MANAGER', 'SALES_MANAGER'].includes(userRole);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      // 1. Fetch Orders
      const orderList = await apiFetch('/warehouses/orders');
      setOrders(Array.isArray(orderList) ? orderList : []);

      // 2. Fetch Backorders
      const backorderList = await apiFetch('/warehouses/backorders');
      setBackorders(Array.isArray(backorderList) ? backorderList : []);

      // 3. Fetch Warehouses
      const whList = await apiFetch('/warehouses');
      setWarehouses(Array.isArray(whList) ? whList : []);

      // Select active order or first order
      const currentOrder = orderList.find((o) => o.id === activeQuotationId || o.quoteNumber === activeQuotationId) || orderList[0];
      if (currentOrder) {
        setSelectedOrder(currentOrder);
        await loadFulfillmentSplit(currentOrder.id);
      }
    } catch (err) {
      console.warn('Fulfillment fetch warning:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadFulfillmentSplit = async (orderId) => {
    try {
      const split = await apiFetch(`/warehouses/fulfillment/suggest/${orderId}`);
      setSuggestedSplit(split);
    } catch (err) {
      console.warn('Split load warning:', err);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeQuotationId, reloadCounter]);

  const handleAcceptSuggestedSplit = async () => {
    if (!selectedOrder) return;
    setActionLoading(true);
    setError('');
    setSuccessMsg('');

    try {
      const res = await apiFetch('/warehouses/fulfillment/accept', {
        method: 'POST',
        body: JSON.stringify({ salesOrderId: selectedOrder.id })
      });

      setSuccessMsg('Suggested warehouse fulfillment split accepted and stock allocated!');
      await fetchData();
    } catch (err) {
      setError(err.message || 'Failed to accept fulfillment split');
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenManualModal = () => {
    if (!suggestedSplit) return;
    const initialInput = {};

    suggestedSplit.salesOrder?.lines?.forEach((line) => {
      if (line.isRecurring) return;
      const lineSuggestions = suggestedSplit.suggestions.filter((s) => s.productId === line.productId);

      initialInput[line.productId] = lineSuggestions.map((s) => ({
        warehouseId: s.warehouseId,
        quantity: s.quantity
      }));
    });

    setManualAllocations(initialInput);
    setManualModalOpen(true);
  };

  const handleManualAllocationChange = (productId, index, field, value) => {
    setManualAllocations((prev) => {
      const list = [...(prev[productId] || [])];
      list[index] = { ...list[index], [field]: field === 'quantity' ? Number(value) : value };
      return { ...prev, [productId]: list };
    });
  };

  const handleAddManualRow = (productId) => {
    setManualAllocations((prev) => {
      const list = [...(prev[productId] || [])];
      list.push({ warehouseId: warehouses[0]?.id || null, quantity: 0 });
      return { ...prev, [productId]: list };
    });
  };

  const handleConfirmManualOverride = async () => {
    if (!selectedOrder) return;
    setActionLoading(true);
    setError('');

    try {
      const flattenedList = [];
      Object.keys(manualAllocations).forEach((prodId) => {
        manualAllocations[prodId].forEach((item) => {
          flattenedList.push({
            productId: prodId,
            warehouseId: item.warehouseId || null,
            quantity: item.quantity
          });
        });
      });

      await apiFetch('/warehouses/fulfillment/manual-override', {
        method: 'POST',
        body: JSON.stringify({
          salesOrderId: selectedOrder.id,
          manualAllocations: flattenedList
        })
      });

      setSuccessMsg('Manual warehouse allocation override applied successfully!');
      setManualModalOpen(false);
      await fetchData();
    } catch (err) {
      setError(err.message || 'Manual allocation override rejected by backend');
    } finally {
      setActionLoading(false);
    }
  };

  const handleConsolidateBackorder = async (backorderId) => {
    setActionLoading(true);
    setError('');
    setSuccessMsg('');

    try {
      const res = await apiFetch(`/warehouses/backorders/${backorderId}/consolidate`, {
        method: 'POST',
        body: JSON.stringify({})
      });

      setSuccessMsg(`Backorder consolidated! Allocated ${res.allocatedQuantity} units from ${res.warehouseName}.`);
      await fetchData();
    } catch (err) {
      setError(err.message || 'Stock unavailable for consolidation');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="empty-state">
        <RefreshCw className="spinner" size={32} color="#3b82f6" />
        <p style={{ color: '#64748b', marginTop: '0.5rem' }}>Loading Fulfillment Engine Data...</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a' }}>Warehouse Fulfillment & Stock Allocations</h1>
          <p style={{ fontSize: '0.85rem', color: '#64748b' }}>
            Multi-warehouse stock splitting, backorder tracking, and fulfillment optimization.
          </p>
        </div>

        {selectedOrder && canModifyFulfillment && (
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button onClick={handleOpenManualModal} className="btn btn-outline" disabled={actionLoading}>
              <Sliders size={16} />
              <span>Manual Override</span>
            </button>
            <button onClick={handleAcceptSuggestedSplit} className="btn btn-primary" disabled={actionLoading}>
              <CheckCircle size={16} />
              <span>Accept Suggested Split</span>
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="alert alert-danger" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="alert alert-success" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <CheckCircle size={18} />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Main Grid: Left Orders List, Right Fulfillment Context */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '1.25rem', alignItems: 'start' }}>
        
        {/* ORDERS LIST COLUMN */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1rem' }}>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Package size={18} color="#3b82f6" />
            <span>Fulfillment Orders ({orders.length})</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '550px', overflowY: 'auto' }}>
            {orders.map((ord) => {
              const isSelected = selectedOrder?.id === ord.id;
              return (
                <div
                  key={ord.id}
                  onClick={() => {
                    setSelectedOrder(ord);
                    loadFulfillmentSplit(ord.id);
                  }}
                  style={{
                    padding: '0.75rem',
                    borderRadius: '8px',
                    border: isSelected ? '2px solid #3b82f6' : '1px solid #e2e8f0',
                    backgroundColor: isSelected ? '#eff6ff' : '#f8fafc',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.35rem'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: '0.85rem', color: '#0f172a' }}>{ord.orderNumber}</strong>
                    <span className={`badge ${ord.status === 'FULFILLED' ? 'badge-green' : ord.status === 'PARTIALLY_FULFILLED' ? 'badge-amber' : 'badge-blue'}`}>
                      {ord.fulfillmentStatus || ord.status}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#475569' }}>{ord.customerName}</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Amount: ${ord.totalAmount?.toFixed(2)}</span>
                    <span>{ord.itemsCount} items</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* FULFILLMENT DETAILS COLUMN */}
        {suggestedSplit ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            
            {/* KPI STATS CARD */}
            <div className="card" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', padding: '1rem' }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Requested Quantity:</span>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>{suggestedSplit.totalRequested} units</div>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Allocated Quantity:</span>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#059669' }}>{suggestedSplit.totalAllocated} units</div>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Backordered Quantity:</span>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: suggestedSplit.totalBackordered > 0 ? '#dc2626' : '#059669' }}>
                  {suggestedSplit.totalBackordered} units
                </div>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Est. Shipments & Cost:</span>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#2563eb' }}>
                  {suggestedSplit.estimatedShipmentCount} shipment(s) (${suggestedSplit.estimatedShippingCost})
                </div>
              </div>
            </div>

            {/* SUGGESTED ALLOCATION TABLE */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Truck size={18} color="#2563eb" />
                  <span>Optimal Multi-Warehouse Split Allocation</span>
                </div>
                <span className={`badge ${suggestedSplit.fullyAllocated ? 'badge-green' : 'badge-amber'}`}>
                  {suggestedSplit.fullyAllocated ? '100% Fully Fulfillable' : 'Split / Backorder Required'}
                </span>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Product Name</th>
                      <th>Fulfillment Center / Warehouse</th>
                      <th>Allocated Qty</th>
                      <th>Status</th>
                      <th>Est. Shipping Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suggestedSplit.suggestions.map((sug, idx) => (
                      <tr key={idx} style={{ backgroundColor: sug.status === 'BACKORDERED' ? '#fef2f2' : 'transparent' }}>
                        <td style={{ fontWeight: 600, color: '#0f172a' }}>{sug.productName}</td>
                        <td>
                          <span className={`badge ${sug.warehouseId ? 'badge-purple' : 'badge-red'}`}>
                            {sug.warehouseName} ({sug.warehouseCode})
                          </span>
                        </td>
                        <td style={{ fontWeight: 700 }}>{sug.quantity} units</td>
                        <td>
                          <span className={`badge ${sug.status === 'ALLOCATED' ? 'badge-green' : 'badge-red'}`}>
                            {sug.status}
                          </span>
                        </td>
                        <td>${sug.unitShippingCost.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ACTIVE BACKORDERS LEDGER */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Archive size={18} color="#dc2626" />
                  <span>Active Backorders & Replenishment Consolidation</span>
                </div>
              </div>

              {backorders.length === 0 ? (
                <div style={{ padding: '1rem', color: '#64748b', fontSize: '0.85rem' }}>No active backorders found across warehouses.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Order Ref</th>
                        <th>Product</th>
                        <th>Remaining Qty</th>
                        <th>Status</th>
                        <th>Created Date</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {backorders.map((bo) => (
                        <tr key={bo.id}>
                          <td style={{ fontWeight: 600 }}>{bo.salesOrder?.orderNumber || 'Order'}</td>
                          <td>{bo.product?.name}</td>
                          <td style={{ fontWeight: 700, color: '#dc2626' }}>{bo.remainingQty} units</td>
                          <td><span className="badge badge-amber">{bo.status}</span></td>
                          <td>{new Date(bo.createdAt).toLocaleDateString()}</td>
                          <td>
                            {canModifyFulfillment && (
                              <button
                                onClick={() => handleConsolidateBackorder(bo.id)}
                                className="btn btn-sm btn-primary"
                                disabled={actionLoading}
                              >
                                Consolidate Remaining Backorder
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>
        ) : (
          <div className="card empty-state">
            <p style={{ color: '#64748b' }}>Select a Sales Order to evaluate fulfillment split.</p>
          </div>
        )}
      </div>

      {/* MANUAL OVERRIDE MODAL */}
      {manualModalOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
          <div className="card" style={{ width: '100%', maxWidth: '640px', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>Manual Warehouse Allocation Override</h3>
            <p style={{ fontSize: '0.8rem', color: '#475569' }}>
              Override auto-suggested warehouse allocation. Sum of allocated + backordered quantity MUST equal ordered line quantity.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '400px', overflowY: 'auto' }}>
              {suggestedSplit?.salesOrder?.lines?.map((line) => {
                if (line.isRecurring) return null;
                const rows = manualAllocations[line.productId] || [];

                return (
                  <div key={line.id} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.75rem', backgroundColor: '#f8fafc' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.5rem' }}>
                      {line.product?.name} (Required: {line.quantity} units)
                    </div>

                    {rows.map((row, idx) => (
                      <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: '0.5rem', marginBottom: '0.5rem' }}>
                        <select
                          className="form-select"
                          value={row.warehouseId || ''}
                          onChange={(e) => handleManualAllocationChange(line.productId, idx, 'warehouseId', e.target.value || null)}
                        >
                          <option value="">Backorder (No Warehouse)</option>
                          {warehouses.map((wh) => (
                            <option key={wh.id} value={wh.id}>
                              {wh.name} ({wh.code})
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          className="form-input"
                          min="0"
                          value={row.quantity}
                          onChange={(e) => handleManualAllocationChange(line.productId, idx, 'quantity', e.target.value)}
                        />
                      </div>
                    ))}

                    <button onClick={() => handleAddManualRow(line.productId)} className="btn btn-sm btn-outline" style={{ fontSize: '0.75rem' }}>
                      + Add Warehouse Split Row
                    </button>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button onClick={() => setManualModalOpen(false)} className="btn btn-outline" disabled={actionLoading}>Cancel</button>
              <button onClick={handleConfirmManualOverride} className="btn btn-primary" disabled={actionLoading}>
                {actionLoading ? <span className="spinner" /> : <span>Confirm Manual Override</span>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
