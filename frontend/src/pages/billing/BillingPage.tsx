import React, { useState, useEffect } from 'react';
import { Receipt, Package, Calendar } from 'lucide-react';
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

// --- MOCK DATA ---
const MOCK_SCENARIOS: Record<string, Invoice> = {
  mixed: {
    orderId: 'ORD-5009-MIX',
    items: [
      { id: 'hw-1', name: 'Enterprise Firewall Appliance', type: 'ONE_TIME', status: 'ACTIVE', quantity: 2, unitPrice: 2400 },
      { id: 'svc-1', name: 'Professional Implementation', type: 'ONE_TIME', status: 'ACTIVE', quantity: 1, unitPrice: 1500 },
      { id: 'sub-1', name: 'Advanced Threat Protection', type: 'RECURRING', status: 'ACTIVE', quantity: 1, unitPrice: 600, cycle: 'MONTHLY', upcomingDates: ['Oct 1, 2026', 'Nov 1, 2026', 'Dec 1, 2026'] },
      { id: 'sub-2', name: '24/7 Priority Support', type: 'RECURRING', status: 'ACTIVE', quantity: 1, unitPrice: 300, cycle: 'MONTHLY', upcomingDates: ['Oct 1, 2026', 'Nov 1, 2026', 'Dec 1, 2026'] }
    ]
  },
  onlyOneTime: {
    orderId: 'ORD-5010-ONE',
    items: [
      { id: 'hw-1', name: 'Enterprise Firewall Appliance', type: 'ONE_TIME', status: 'ACTIVE', quantity: 4, unitPrice: 2400 },
      { id: 'hw-2', name: 'Wifi 6 Access Points', type: 'ONE_TIME', status: 'ACTIVE', quantity: 15, unitPrice: 350 },
      { id: 'svc-1', name: 'Network Audit', type: 'ONE_TIME', status: 'ACTIVE', quantity: 1, unitPrice: 2000 }
    ]
  },
  onlySubs: {
    orderId: 'ORD-5011-SUB',
    items: [
      { id: 'sub-1', name: 'Advanced Threat Protection', type: 'RECURRING', status: 'ACTIVE', quantity: 10, unitPrice: 600, cycle: 'MONTHLY', upcomingDates: ['Oct 1, 2026', 'Nov 1, 2026', 'Dec 1, 2026'] },
      { id: 'sub-3', name: 'Cloud Backup Storage (TB)', type: 'RECURRING', status: 'ACTIVE', quantity: 50, unitPrice: 40, cycle: 'MONTHLY', upcomingDates: ['Oct 1, 2026', 'Nov 1, 2026', 'Dec 1, 2026'] }
    ]
  }
};

export const BillingPage: React.FC = () => {
  const [activeScenario, setActiveScenario] = useState<string>('mixed');
  const [data, setData] = useState<Invoice>(MOCK_SCENARIOS.mixed);

  // UI States
  const [isProcessing, setIsProcessing] = useState<Record<string, boolean>>({});
  const [prorationMsgs, setProrationMsgs] = useState<Record<string, string>>({});
  const [cancelStateId, setCancelStateId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  // Switch scenario
  useEffect(() => {
    setData(JSON.parse(JSON.stringify(MOCK_SCENARIOS[activeScenario])));
    setIsProcessing({});
    setProrationMsgs({});
    setCancelStateId(null);
    setCancelReason('');
  }, [activeScenario]);

  // Derived arrays
  const oneTimeItems = data.items.filter(i => i.type === 'ONE_TIME');
  const recurringItems = data.items.filter(i => i.type === 'RECURRING');

  // Math
  const oneTimeSubtotal = oneTimeItems.reduce((acc, item) => acc + (item.quantity * item.unitPrice), 0);
  // Recurring subtotal only counts active items
  const recurringSubtotal = recurringItems
    .filter(i => i.status === 'ACTIVE')
    .reduce((acc, item) => acc + (item.quantity * item.unitPrice), 0);

  const totalDueToday = oneTimeSubtotal + recurringSubtotal;

  // Handlers
  const handleQuantityChange = async (id: string, newQty: number) => {
    if (newQty < 1 || isNaN(newQty)) return;
    const item = data.items.find(i => i.id === id);
    if (!item) return;

    if (item.quantity === newQty) return; // no change

    const delta = newQty - item.quantity;
    
    setIsProcessing(prev => ({ ...prev, [id]: true }));
    
    // Simulate Backend Dev B's proration API response
    await new Promise(resolve => setTimeout(resolve, 800));

    // Demo target logic: "10-day/doubling example -> $200"
    let prorationCharge = 0;
    if (item.name.includes("Threat") && newQty === item.quantity * 2) {
      prorationCharge = 200; 
    } else {
      // Generic mock math for other items (roughly 1/3 of the monthly diff)
      prorationCharge = Math.round(delta * item.unitPrice * 0.33);
    }
    
    const newMonthlyTotal = newQty * item.unitPrice;

    setData(prev => {
       const next = { ...prev, items: [...prev.items] };
       const idx = next.items.findIndex(i => i.id === id);
       next.items[idx] = { ...next.items[idx], quantity: newQty };
       return next;
    });

    setProrationMsgs(prev => ({
       ...prev,
       [id]: `Quantity change: ${delta > 0 ? '+' : ''}${delta} units → $${Math.abs(prorationCharge)} prorated ${prorationCharge >= 0 ? 'charge' : 'credit'} today, new monthly total: $${newMonthlyTotal.toLocaleString()} starting next cycle`
    }));

    setIsProcessing(prev => ({ ...prev, [id]: false }));
  };

  const submitCancel = async (id: string) => {
    setIsProcessing(prev => ({ ...prev, [id]: true }));
    
    // Simulate Backend Dev B's cancellation endpoint
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    setData(prev => {
       const next = { ...prev, items: [...prev.items] };
       const idx = next.items.findIndex(i => i.id === id);
       next.items[idx] = { 
         ...next.items[idx], 
         status: 'CANCELLED', 
         cancelReason: cancelReason,
         // Hardcoded Demo target logic: $150 credit note
         creditNoteMsg: `Credit note issued: $150 for 20 unused days`
       };
       return next;
    });

    setIsProcessing(prev => ({ ...prev, [id]: false }));
    setCancelStateId(null);
    setCancelReason('');
  };

  return (
    <div className="page-container bill-container">
      <div className="bill-test-controls">
        <div className="bill-test-group">
          <strong>Scenario:</strong>
          <select className="bill-select" value={activeScenario} onChange={e => setActiveScenario(e.target.value)}>
            {Object.keys(MOCK_SCENARIOS).map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
      </div>

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
