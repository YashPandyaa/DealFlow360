import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useWorkspace } from '../../context/WorkspaceContext';
import { apiFetch } from '../../utils/api';
import { getRoleDefaultRoute } from '../../utils/roles';

export default function Signup() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('REP');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { login } = useWorkspace();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await apiFetch('/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ name, email, password, role })
      });

      login(data.token, data.user);
      const targetRoute = getRoleDefaultRoute(data.user?.role);
      navigate(targetRoute);
    } catch (err) {
      setError(err.message || 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%)', padding: '1rem' }}>
      <div className="card-glass animate-fade-in" style={{ width: '100%', maxWidth: '440px', padding: '2.5rem 2rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '52px', height: '52px', borderRadius: '12px', background: '#eff6ff', color: '#2563eb', marginBottom: '1rem', border: '1px solid #bfdbfe' }}>
            <Layers size={28} />
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: '700', color: '#0f172a', letterSpacing: '-0.02em' }}>DealFlow360</h1>
          <p style={{ color: '#475569', fontSize: '0.875rem', marginTop: '0.25rem' }}>Create Enterprise Account</p>
        </div>

        {error && (
          <div className="badge-red" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.25rem', fontSize: '0.85rem' }}>
            <ShieldAlert size={18} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Full Name</label>
            <input
              type="text"
              className="form-input"
              placeholder="Jane Rep"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input
              type="email"
              className="form-input"
              placeholder="jane@dealflow360.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
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

          <div className="form-group" style={{ marginBottom: '1.5rem' }}>
            <label className="form-label">Account Role</label>
            <select className="form-select" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="REP">Sales Representative (REP)</option>
              <option value="MANAGER">Sales Manager (MANAGER)</option>
              <option value="FINANCE">Finance Approver (FINANCE)</option>
              <option value="ADMIN">System Administrator (ADMIN)</option>
            </select>
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '0.75rem' }} disabled={loading}>
            {loading ? <span className="spinner" /> : <><span>Create Account</span><ArrowRight size={18} /></>}
          </button>
        </form>

        <div style={{ marginTop: '1.75rem', paddingTop: '1.25rem', borderTop: '1px solid #e2e8f0', textAlign: 'center', fontSize: '0.85rem', color: '#475569' }}>
          Already have an account? <Link to="/login" style={{ color: '#2563eb', fontWeight: '500' }}>Sign In</Link>
        </div>
      </div>
    </div>
  );
}
