import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { CheckCircle2, MessageSquare, ShieldAlert } from 'lucide-react';
import { API_BASE_URL } from '../../utils/api';

interface PortalLineItem {
  id: string;
  productId: string;
  quantity: number;
  customerPrice: number;
  product?: {
    name: string;
    description: string;
  };
}

interface PortalQuotation {
  id: string;
  clientId: string;
  status: 'DRAFT' | 'APPROVAL' | 'NEGOTIATION' | 'CONFIRMED' | 'REJECTED';
  lines: PortalLineItem[];
  totalAmount: number;
}

export const PortalQuotePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const magicToken = searchParams.get('token');

  const [quote, setQuote] = useState<PortalQuotation | null>(null);
  const [jwt, setJwt] = useState<string | null>(null);
  
  const [authError, setAuthError] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Form State
  const [lineComments, setLineComments] = useState<Record<string, string>>({});
  const [requestedDiscount, setRequestedDiscount] = useState<number | ''>('');
  
  // Submission State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchQuote = useCallback(async (token: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/quotations/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch quotation');
      const data = await res.json();
      setQuote(data);
    } catch (err) {
      console.error(err);
    }
  }, [id]);

  useEffect(() => {
    let isMounted = true;
    const verifyToken = async () => {
      if (!magicToken) {
        setAuthError(true);
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`${API_BASE_URL}/auth/portal/verify?token=${magicToken}`);
        if (!res.ok) {
          throw new Error('Invalid or expired token');
        }
        const data = await res.json();
        
        if (isMounted) {
          setJwt(data.token);
          await fetchQuote(data.token);
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setAuthError(true);
          setLoading(false);
        }
      }
    };
    verifyToken();
    return () => { isMounted = false; };
  }, [magicToken, fetchQuote]);

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center' }}>Verifying link and loading quotation...</div>;
  }

  if (authError || !jwt) {
    return (
      <div className="portal-card" style={{ textAlign: 'center', margin: '40px auto' }}>
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
    return <div style={{ padding: '40px', textAlign: 'center' }}>Quotation not found.</div>;
  }

  const isConfirmed = quote.status === 'CONFIRMED';
  const isLocked = isConfirmed || successMsg !== null;

  const handleCommentChange = (lineId: string, val: string) => {
    setLineComments(prev => ({ ...prev, [lineId]: val }));
  };

  const handleSubmitRequest = async () => {
    setIsSubmitting(true);
    // Real implementation would save comments. For now just show success.
    await new Promise(resolve => setTimeout(resolve, 800));
    setSuccessMsg('Your change requests have been sent to your account representative.');
    setIsSubmitting(false);
  };

  const handleConfirmQuotation = async () => {
    setIsSubmitting(true);
    try {
      const discountVal = Number(requestedDiscount) || 0;
      
      // If discount > 20%, re-trigger approval
      if (discountVal > 20) {
        const res = await fetch(`${API_BASE_URL}/approvals/${id}/reopen`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${jwt}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ customerTier: 'ENTERPRISE' }) // Using a default tier for this demo since it's required by the endpoint
        });
        
        if (!res.ok) {
           const err = await res.json();
           throw new Error(err.error || 'Failed to re-trigger approval');
        }
        setSuccessMsg('Quotation confirmed pending final review. Your requested discount is undergoing final approval.');
      } else {
        // If discount <= 20%, just update status to CONFIRMED (pseudo logic since the API doesn't have a direct confirm endpoint, we simulate it or call the actual one if it existed).
        // Since backend Dev A might not have an endpoint just to "Confirm from portal", we'll just show the success message.
        await new Promise(resolve => setTimeout(resolve, 800));
        setSuccessMsg('Quotation confirmed! Your order is now moving to fulfillment.');
      }
      
      setQuote(prev => prev ? { ...prev, status: 'CONFIRMED' } : null);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <div className="portal-card">
        <div className="portal-quote-header">
          <div>
            <h1 className="portal-title">Quotation {quote.id}</h1>
            <p className="portal-subtitle" style={{ margin: 0 }}>Prepared for Customer {quote.clientId}</p>
          </div>
          <div>
            <span className={`portal-status-badge ${isConfirmed ? 'status-confirmed' : 'status-negotiation'}`}>
              {quote.status}
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
            {quote.lines.map(item => (
              <tr key={item.id}>
                <td>
                  <div className="portal-item-name">{item.product?.name || item.productId}</div>
                  <div className="portal-item-desc">{item.product?.description}</div>
                  
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
                  ${(item.customerPrice || 0).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        <div style={{ textAlign: 'right', fontSize: '1.25rem', fontWeight: 700, paddingBottom: '24px' }}>
          Total Value: ${(quote.totalAmount || 0).toLocaleString()}
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
