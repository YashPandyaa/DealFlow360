import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { CheckCircle2, MessageSquare, ShieldAlert } from 'lucide-react';

interface PortalLineItem {
  id: string;
  name: string;
  description: string;
  quantity: number;
  customerPrice: number;
}

interface PortalQuotation {
  id: string;
  clientName: string;
  status: 'NEGOTIATION' | 'CONFIRMED';
  items: PortalLineItem[];
  totalValue: number;
}

// Strictly external mock data. Absolutely no cost, margin, or internal approval info.
const MOCK_DATA: Record<string, PortalQuotation> = {
  'Q-2026-004': {
    id: 'Q-2026-004',
    clientName: 'Nexus Retail Group',
    status: 'NEGOTIATION',
    totalValue: 92000,
    items: [
      { id: 'l1', name: 'Enterprise Firewall Appliance', description: 'Hardware unit', quantity: 2, customerPrice: 5000 },
      { id: 'l2', name: 'Advanced Threat Protection', description: 'Annual subscription', quantity: 1, customerPrice: 82000 }
    ]
  },
  'Q-2026-005': {
    id: 'Q-2026-005',
    clientName: 'Acme Global',
    status: 'CONFIRMED',
    totalValue: 15000,
    items: [
      { id: 'l3', name: 'Cloud Backup Storage (TB)', description: 'Annual subscription', quantity: 10, customerPrice: 15000 }
    ]
  }
};

export const PortalQuotePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const token = searchParams.get('token');
  const isInvalidToken = !token || token !== 'mock_magic_token_valid';

  const [quote, setQuote] = useState<PortalQuotation | null>(null);
  
  // Form State
  const [lineComments, setLineComments] = useState<Record<string, string>>({});
  const [requestedDiscount, setRequestedDiscount] = useState<number | ''>('');
  
  // Submission State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Load Mock Data
  useEffect(() => {
    if (id && MOCK_DATA[id]) {
      setQuote(JSON.parse(JSON.stringify(MOCK_DATA[id])));
    }
  }, [id]);

  if (isInvalidToken) {
    return (
      <div className="portal-card" style={{ textAlign: 'center' }}>
        <ShieldAlert size={48} color="#ef4444" style={{ margin: '0 auto 16px' }} />
        <h1 className="portal-title">Link Expired or Invalid</h1>
        <p className="portal-subtitle">This secure link is no longer valid. Please request a new one to access your quotation.</p>
        <button className="portal-btn portal-btn-primary" onClick={() => navigate('/portal/login')}>
          Request New Link
        </button>
      </div>
    );
  }

  if (!quote) {
    return <div style={{ padding: '40px', textAlign: 'center' }}>Loading quotation details...</div>;
  }

  const isConfirmed = quote.status === 'CONFIRMED';
  const isLocked = isConfirmed || successMsg !== null;

  const handleCommentChange = (lineId: string, val: string) => {
    setLineComments(prev => ({ ...prev, [lineId]: val }));
  };

  const handleSubmitRequest = async () => {
    setIsSubmitting(true);
    // Simulate sending comments/counter-offer
    await new Promise(resolve => setTimeout(resolve, 800));
    setSuccessMsg('Your change requests have been sent to your account representative.');
    setIsSubmitting(false);
  };

  const handleConfirmQuotation = async () => {
    setIsSubmitting(true);
    
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // Threshold check logic per brief
    const discountVal = Number(requestedDiscount) || 0;
    
    if (discountVal > 20) {
      setSuccessMsg('Quotation confirmed pending final review. Your requested discount is undergoing final approval.');
    } else {
      setSuccessMsg('Quotation confirmed! Your order is now moving to fulfillment.');
    }
    
    setQuote(prev => prev ? { ...prev, status: 'CONFIRMED' } : null);
    setIsSubmitting(false);
  };

  return (
    <div>
      {/* Test Control (to swap quotes) */}
      <div style={{ padding: '8px 12px', background: 'rgba(0,0,0,0.05)', borderRadius: '8px', marginBottom: '24px', display: 'flex', gap: '12px', alignItems: 'center' }}>
        <strong style={{ fontSize: '0.85rem' }}>View Quote:</strong>
        <select 
          value={quote.id} 
          onChange={e => {
            setSuccessMsg(null);
            navigate(`/portal/quote/${e.target.value}?token=mock_magic_token_valid`);
          }}
          style={{ padding: '4px', borderRadius: '4px', fontSize: '0.85rem' }}
        >
          <option value="Q-2026-004">Q-2026-004 (Negotiation)</option>
          <option value="Q-2026-005">Q-2026-005 (Already Confirmed)</option>
        </select>
      </div>

      <div className="portal-card">
        <div className="portal-quote-header">
          <div>
            <h1 className="portal-title">Quotation {quote.id}</h1>
            <p className="portal-subtitle" style={{ margin: 0 }}>Prepared for {quote.clientName}</p>
          </div>
          <div>
            <span className={`portal-status-badge ${isConfirmed ? 'status-confirmed' : 'status-negotiation'}`}>
              {isConfirmed ? 'Confirmed' : 'Under Negotiation'}
            </span>
          </div>
        </div>

        {successMsg && (
          <div className="portal-success-banner">
            <CheckCircle2 size={20} />
            {successMsg}
          </div>
        )}

        <h3 style={{ fontSize: '1.1rem', marginBottom: '16px' }}>Included Products & Services</h3>
        <table className="portal-table">
          <thead>
            <tr>
              <th>Item</th>
              <th style={{ textAlign: 'center' }}>Qty</th>
              <th style={{ textAlign: 'right' }}>Price</th>
            </tr>
          </thead>
          <tbody>
            {quote.items.map(item => (
              <tr key={item.id}>
                <td>
                  <div className="portal-item-name">{item.name}</div>
                  <div className="portal-item-desc">{item.description}</div>
                  
                  {!isLocked && (
                    <div style={{ marginTop: '12px', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                      <MessageSquare size={16} color="#9ca3af" style={{ marginTop: '10px' }} />
                      <textarea
                        className="portal-comment-input"
                        placeholder="Add a comment or requested change for this item..."
                        value={lineComments[item.id] || ''}
                        onChange={e => handleCommentChange(item.id, e.target.value)}
                        disabled={isLocked}
                      />
                    </div>
                  )}
                </td>
                <td style={{ textAlign: 'center', width: '80px' }}>{item.quantity}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, width: '120px' }}>
                  ${item.customerPrice.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        <div style={{ textAlign: 'right', fontSize: '1.25rem', fontWeight: 700, paddingBottom: '24px' }}>
          Total Value: ${quote.totalValue.toLocaleString()}
        </div>

        <div className="portal-actions-panel">
          <div className="portal-discount-row">
            <span className="portal-discount-label">Requested Counter-Discount (%):</span>
            <input 
              type="number"
              min="0"
              max="100"
              placeholder="e.g. 15"
              className="portal-discount-input"
              value={requestedDiscount}
              onChange={e => setRequestedDiscount(Number(e.target.value) || '')}
              disabled={isLocked}
            />
            <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>
              (Discounts over 20% may require additional approval)
            </span>
          </div>

          <div className="portal-buttons-row">
            <button 
              className="portal-btn portal-btn-secondary"
              disabled={isLocked || isSubmitting}
              onClick={handleSubmitRequest}
            >
              {isSubmitting ? 'Processing...' : 'Submit Change Request'}
            </button>
            <button 
              className="portal-btn portal-btn-primary"
              disabled={isLocked || isSubmitting}
              onClick={handleConfirmQuotation}
            >
              {isSubmitting ? 'Confirming...' : 'Confirm Quotation'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default PortalQuotePage;
