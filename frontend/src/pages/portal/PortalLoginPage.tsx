import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, CheckCircle2 } from 'lucide-react';

export const PortalLoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const navigate = useNavigate();

  const handleRequestLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setIsSubmitting(true);
    // Simulate API call POST /auth/portal/request-link
    await new Promise(resolve => setTimeout(resolve, 800));
    setIsSent(true);
    setIsSubmitting(false);
  };

  const simulateEmailClick = () => {
    // Navigates to a mocked quote ID with a valid token
    navigate('/portal/quote/Q-2026-004?token=mock_magic_token_valid');
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
