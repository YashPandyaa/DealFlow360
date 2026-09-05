import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useWorkspace } from '../../context/WorkspaceContext';
import { apiFetch } from '../../utils/api';
import { LogIn, ShieldAlert, ArrowRight, Layers, UserCheck } from 'lucide-react';

import { getRoleDefaultRoute } from '../../utils/roles';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { login } = useWorkspace();
  const navigate = useNavigate();

  const handleLoginSubmit = async (emailToUse, passwordToUse) => {
    setError('');
    setLoading(true);

    try {
      const data = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: emailToUse, password: passwordToUse })
      });

      login(data.token, data.user);
      const targetRoute = getRoleDefaultRoute(data.user?.role);
      navigate(targetRoute);
    } catch (err) {
      setError(err.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    handleLoginSubmit(email, password);
  };

  const handleQuickDemoLogin = (demoEmail) => {
    setEmail(demoEmail);
    setPassword('password123');
    handleLoginSubmit(demoEmail, 'password123');
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%)', padding: '1rem' }}>
      <div className="card-glass animate-fade-in" style={{ width: '100%', maxWidth: '440px', padding: '2.5rem 2rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '52px', height: '52px', borderRadius: '12px', background: '#eff6ff', color: '#2563eb', marginBottom: '1rem', border: '1px solid #bfdbfe' }}>
            <Layers size={28} />
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: '700', color: '#0f172a', letterSpacing: '-0.02em' }}>DealFlow360</h1>
          <p style={{ color: '#475569', fontSize: '0.875rem', marginTop: '0.25rem' }}>Enterprise Deal Governance & Quotations</p>
        </div>

        {/* DEMO QUICK LOGIN BADGES */}
        <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.85rem', marginBottom: '1.25rem' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#475569', textTransform: 'uppercase', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <UserCheck size={14} color="#2563eb" />
            <span>Demo Quick Login Roles:</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
            <button type="button" onClick={() => handleQuickDemoLogin('rep.alice@dealflow360.com')} className="btn btn-outline btn-sm" style={{ fontSize: '0.7rem' }}>
              Alice (REP)
            </button>
            <button type="button" onClick={() => handleQuickDemoLogin('manager@dealflow360.com')} className="btn btn-outline btn-sm" style={{ fontSize: '0.7rem' }}>
              Sarah (MANAGER)
            </button>
            <button type="button" onClick={() => handleQuickDemoLogin('finance@dealflow360.com')} className="btn btn-outline btn-sm" style={{ fontSize: '0.7rem' }}>
              Frank (FINANCE)
            </button>
            <button type="button" onClick={() => handleQuickDemoLogin('admin@dealflow360.com')} className="btn btn-outline btn-sm" style={{ fontSize: '0.7rem' }}>
              Admin
            </button>
          </div>
        </div>

        {error && (
          <div className="badge-red" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.25rem', fontSize: '0.85rem' }}>
            <ShieldAlert size={18} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input
              type="email"
              className="form-input"
              placeholder="rep.alice@dealflow360.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group" style={{ marginBottom: '1.5rem' }}>
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '0.75rem' }} disabled={loading}>
            {loading ? <span className="spinner" /> : <><span>Sign In</span><ArrowRight size={18} /></>}
          </button>
        </form>

        <div style={{ marginTop: '1.75rem', paddingTop: '1.25rem', borderTop: '1px solid #e2e8f0', textAlign: 'center', fontSize: '0.85rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div>
            Don't have an account? <Link to="/signup" style={{ color: '#2563eb', fontWeight: '500' }}>Create account</Link>
          </div>
          <div>
            Are you a customer? <Link to="/portal" style={{ color: '#059669', fontWeight: '500' }}>Customer Portal</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
