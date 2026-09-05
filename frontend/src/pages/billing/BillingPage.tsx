import React, { useState, useEffect, useCallback } from 'react';
import { Receipt, Package, Calendar, AlertTriangle } from 'lucide-react';
import { useWorkspace } from '../workspace';
import { apiFetch } from '../../utils/api';
import './Billing.css';

type BillingCycle = 'MONTHLY' | 'ANNUAL';

interface InvoiceItem {
  id: string;
  name: string;
  type: 'ONE_TIME' | 'RECURRING';
  status: 'ACTIVE' | 'CANCELLED';
  quantity: number;
  unitPrice: number;
  cycle?: BillingCycle;
  upcomingDates?: string[];
  cancelReason?: string;
  creditNoteMsg?: string;
}

interface Invoice {
  orderId: string;
  items: InvoiceItem[];
}

export const BillingPage: React.FC = () => {
  const { registerReloadListener, activeQuotationId } = useWorkspace();
  
  const [data, setData] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // UI States
  const [isProcessing, setIsProcessing] = useState<Record<string, boolean>>({});
  const [prorationMsgs, setProrationMsgs] = useState<Record<string, string>>({});
  const [cancelStateId, setCancelStateId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const fetchInvoiceData = useCallback(async () => {
    if (!activeQuotationId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/orders/${activeQuotationId}/invoice`);
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to fetch invoice data.');
      }
      const jsonData = await res.json();
      setData(jsonData);
      setIsProcessing({});
      setProrationMsgs({});
      setCancelStateId(null);
      setCancelReason('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [activeQuotationId]);

  useEffect(() => {
    fetchInvoiceData();
    const unregister = registerReloadListener(fetchInvoiceData);
    return () => unregister();
  }, [fetchInvoiceData, registerReloadListener]);

  if (!activeQuotationId) {
    return (
      <div className="page-container bill-container">
        <div className="ff-banner ff-banner-error" style={{ padding: '32px', textAlign: 'center', marginBottom: 0 }}>
          <h3>No Quotation Selected</h3>
          <p>Please select a quotation or order from the pipeline to view its billing details.</p>
        </div>
      </div>
    );
  }

  if (loading && !data) {
    return <div className="page-container bill-container"><p>Loading invoice data...</p></div>;
  }

  if (error) {
    return (
      <div className="page-container bill-container">
        <div className="ff-banner ff-banner-error">
          <AlertTriangle size={20} />
          <span><strong>Error:</strong> {error}</span>
        </div>
      </div>
    );
  }

  if (!data) return null;

  // Derived arrays
  const oneTimeItems = data.items.filter(i => i.type === 'ONE_TIME');
  const recurringItems = data.items.filter(i => i.type === 'RECURRING');

  // Math
  const oneTimeSubtotal = oneTimeItems.reduce((acc, item) => acc + (item.quantity * item.unitPrice), 0);
  const recurringSubtotal = recurringItems
    .filter(i => i.status === 'ACTIVE')
    .reduce((acc, item) => acc + (item.quantity * item.unitPrice), 0);

  const totalDueToday = oneTimeSubtotal + recurringSubtotal;

  // Handlers
  const handleQuantityChange = async (id: string, newQty: number) => {
    if (newQty < 1 || isNaN(newQty)) return;
    const item = data.items.find(i => i.id === id);
    if (!item) return;
    if (item.quantity === newQty) return; 

    const delta = newQty - item.quantity;
    setIsProcessing(prev => ({ ...prev, [id]: true }));
    
    try {
      const res = await apiFetch(`/subscriptions/${id}/quantity`, {
        method: 'PATCH',
        body: JSON.stringify({ newQuantity: newQty, effectiveDate: new Date().toISOString() })
      });
      
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to update quantity');
      }
      
      const result = await res.json();
      
      const prorationCharge = result.proratedAmount;
      const newMonthlyTotal = newQty * item.unitPrice;

      setData(prev => {
         if (!prev) return prev;
         const next = { ...prev, items: [...prev.items] };
         const idx = next.items.findIndex(i => i.id === id);
         next.items[idx] = { ...next.items[idx], quantity: newQty };
         return next;
      });

      setProrationMsgs(prev => ({
         ...prev,
         [id]: `Quantity change: ${delta > 0 ? '+' : ''}${delta} units → $${Math.abs(prorationCharge)} prorated ${prorationCharge >= 0 ? 'charge' : 'credit'} today, new monthly total: $${newMonthlyTotal.toLocaleString()} starting next cycle`
      }));
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsProcessing(prev => ({ ...prev, [id]: false }));
    }
  };

  const submitCancel = async (id: string) => {
    setIsProcessing(prev => ({ ...prev, [id]: true }));
    
    try {
      const res = await apiFetch(`/subscriptions/${id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ effectiveDate: new Date().toISOString(), reason: cancelReason })
      });
      
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to cancel subscription');
      }
      
      const result = await res.json();
      
      setData(prev => {
         if (!prev) return prev;
         const next = { ...prev, items: [...prev.items] };
         const idx = next.items.findIndex(i => i.id === id);
         next.items[idx] = { 
           ...next.items[idx], 
           status: 'CANCELLED', 
           cancelReason: cancelReason,
           creditNoteMsg: `Credit note issued: $${result.creditAmount} for unused days`
         };
         return next;
      });
      setCancelStateId(null);
      setCancelReason('');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsProcessing(prev => ({ ...prev, [id]: false }));
    }
  };

  return (
    <div className="page-container bill-container">
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div>
          <div className="page-badge">
            <Receipt size={16} />
            <span>Invoice & Subscriptions</span>
          </div>
          <h1 className="page-title">Billing Summary — {data.orderId}</h1>
          <p className="page-subtitle">Manage one-time hardware purchases and active SaaS subscriptions.</p>
        </div>
      </div>

      {/* ONE-TIME ITEMS */}
      {oneTimeItems.length > 0 && (
        <div className="bill-section">
          <div className="bill-section-header">
            <h3 className="bill-section-title"><Package size={18} /> One-Time Items</h3>
          </div>
          <div className="bill-table-container">
            <table className="bill-table">
              <thead>
                <tr>
                  <th>Product Name</th>
                  <th style={{ textAlign: 'center' }}>Qty</th>
                  <th style={{ textAlign: 'right' }}>Unit Price</th>
                  <th style={{ textAlign: 'right' }}>Line Total</th>
                </tr>
              </thead>
              <tbody>
                {oneTimeItems.map(item => (
                  <tr key={item.id}>
                    <td><div className="bill-item-name">{item.name}</div></td>
                    <td style={{ textAlign: 'center' }}>{item.quantity}</td>
                    <td style={{ textAlign: 'right', color: '#6b7280' }}>${item.unitPrice.toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }} className="bill-price">${(item.quantity * item.unitPrice).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="bill-subtotal-footer">
            <span className="bill-subtotal-label">One-Time Subtotal</span>
            <span className="bill-subtotal-val">${oneTimeSubtotal.toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* RECURRING ITEMS */}
      {recurringItems.length > 0 && (
        <div className="bill-section">
          <div className="bill-section-header">
            <h3 className="bill-section-title"><Calendar size={18} /> Recurring Subscriptions</h3>
          </div>
          <div className="bill-table-container">
            <table className="bill-table">
              <thead>
                <tr>
                  <th>Subscription Details</th>
                  <th style={{ textAlign: 'center' }}>Status</th>
                  <th style={{ textAlign: 'center' }}>Qty</th>
                  <th style={{ textAlign: 'right' }}>Price / Cycle</th>
                  <th style={{ textAlign: 'right', width: '150px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {recurringItems.map(item => (
                  <tr key={item.id} className={item.status === 'CANCELLED' ? 'bill-row-cancelled' : ''}>
                    <td>
                      <div className="bill-item-name">
                        {item.name}
                        {item.cycle && <span className="bill-item-cycle">{item.cycle}</span>}
                      </div>
                      
                      {item.status === 'ACTIVE' && item.upcomingDates && (
                        <div className="bill-item-dates">Next billing: {item.upcomingDates.join(', ')}</div>
                      )}
                      
                      {item.status === 'CANCELLED' && item.creditNoteMsg && (
                        <div className="bill-credit-msg">{item.creditNoteMsg}</div>
                      )}

                      {prorationMsgs[item.id] && item.status === 'ACTIVE' && (
                        <div className="bill-proration-msg">{prorationMsgs[item.id]}</div>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`bill-status-badge status-${item.status.toLowerCase()}`}>
                        {item.status}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input 
                        type="number" 
                        min="1" 
                        className="bill-qty-input"
                        value={item.quantity}
                        disabled={item.status === 'CANCELLED' || isProcessing[item.id] || cancelStateId === item.id}
                        onBlur={(e) => handleQuantityChange(item.id, parseInt(e.target.value))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.currentTarget.blur();
                          }
                        }}
                      />
                      {isProcessing[item.id] && !cancelStateId && <span className="bill-loading-spinner"></span>}
                    </td>
                    <td style={{ textAlign: 'right' }} className="bill-price">
                      ${(item.quantity * item.unitPrice).toLocaleString()}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {item.status === 'ACTIVE' && (
                        <>
                          <button 
                            className="bill-action-btn"
                            disabled={isProcessing[item.id] || cancelStateId === item.id}
                            onClick={() => {
                              setCancelStateId(item.id);
                              setCancelReason('');
                              setProrationMsgs(prev => { const n = {...prev}; delete n[item.id]; return n; });
                            }}
                          >
                            Cancel Plan
                          </button>
                          
                          {cancelStateId === item.id && (
                            <div className="bill-cancel-box">
                              <h4 className="bill-cancel-title">Confirm Cancellation</h4>
                              <textarea 
                                className="bill-cancel-textarea"
                                placeholder="Reason for cancellation (Required)"
                                value={cancelReason}
                                onChange={e => setCancelReason(e.target.value)}
                              />
                              <div className="bill-cancel-actions">
                                <button className="bill-cancel-close" onClick={() => setCancelStateId(null)} disabled={isProcessing[item.id]}>Close</button>
                                <button 
                                  className="bill-cancel-submit" 
                                  disabled={!cancelReason.trim() || isProcessing[item.id]}
                                  onClick={() => submitCancel(item.id)}
                                >
                                  {isProcessing[item.id] ? 'Cancelling...' : 'Confirm'}
                                </button>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="bill-subtotal-footer">
            <span className="bill-subtotal-label">Recurring Subtotal / Cycle</span>
            <span className="bill-subtotal-val">${recurringSubtotal.toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* TOTAL */}
      <div className="bill-total-section">
        <div className="bill-total-card">
          <div className="bill-total-label">Total Due Today</div>
          <div className="bill-total-val">${totalDueToday.toLocaleString()}</div>
          <div className="bill-total-subtext">Includes One-Time items & first billing cycle</div>
        </div>
      </div>
    </div>
  );
};

export default BillingPage;
