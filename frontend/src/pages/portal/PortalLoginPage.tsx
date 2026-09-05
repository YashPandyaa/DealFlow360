import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../../utils/api';
import { Mail, CheckCircle2 } from 'lucide-react';

export const PortalLoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const [simulatedLink, setSimulatedLink] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleRequestLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setIsSubmitting(true);
    try {
      const res = await apiFetch('/auth/portal/request-link', {
        method: 'POST',
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send magic link');
      
      setSimulatedLink(data.magicLink); // The backend returns the relative link
      setIsSent(true);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const simulateEmailClick = () => {
    if (simulatedLink) {
      // Backend returns e.g. /auth/portal/verify?token=XYZ. We want to route the frontend to /portal/quote/:id?token=XYZ.
      // Wait, the backend doesn't know the quote ID in request-link because it just authenticates the user!
      // The user would see a list of quotes, or the email link would have the quote ID.
      // Actually, if the backend returns /auth/portal/verify?token=XYZ, the portal needs to verify that token, get JWT, then the customer sees their quotes (or we just use a hardcoded Q-1 for demo).
      // Let's pass the token to the portal quote page:
      const urlParams = new URLSearchParams(simulatedLink.split('?')[1]);
      const token = urlParams.get('token');
      // For demo, we just navigate to quote/Q-1 (if we don't know the exact ID) with the valid token.
      navigate(`/portal/quote/Q-1?token=${token}`);
    }
  };

  return (
    <div className="portal-login-wrap">
      <div className="portal-card" style={{ maxWidth: '400px', width: '100%' }}>
        
        {!isSent ? (
          <>
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <Mail size={32} color="#4f46e5" style={{ marginBottom: '12px' }} />
              <h1 className="portal-title">Access Quotation</h1>
              <p className="portal-subtitle">Enter your email to receive a secure sign-in link.</p>
            </div>

            <form onSubmit={handleRequestLink}>
              <div className="portal-input-group">
                <label>Email Address</label>
                <input 
                  type="email" 
                  required
                  placeholder="you@company.com" 
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>
              
              <button 
                type="submit" 
                className="portal-btn portal-btn-primary" 
                style={{ width: '100%' }}
                disabled={isSubmitting || !email}
              >
                {isSubmitting ? 'Sending...' : 'Send Magic Link'}
              </button>
            </form>
          </>
        ) : (
          <div style={{ textAlign: 'center' }}>
            <CheckCircle2 size={40} color="#16a34a" style={{ margin: '0 auto 16px' }} />
            <h1 className="portal-title">Check your email</h1>
            <p className="portal-subtitle" style={{ marginBottom: '32px' }}>
              We've sent a secure link to <strong>{email}</strong>. Click the link in the email to access your quotation.
            </p>
            
            {/* DEV TOOL: Simulate the user clicking the email link */}
            <div style={{ padding: '16px', background: '#f3f4f6', borderRadius: '8px', border: '1px dashed #d1d5db' }}>
              <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: '0 0 12px 0' }}>[Developer Test Action]</p>
              <button 
                className="portal-btn portal-btn-primary" 
                style={{ width: '100%', fontSize: '0.85rem' }}
                onClick={simulateEmailClick}
              >
                Simulate Clicking Email Link
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PortalLoginPage;
