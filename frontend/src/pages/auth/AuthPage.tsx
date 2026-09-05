import React, { useState, useEffect } from 'react';
import { Lock, LogIn, UserPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { apiFetch } from '../../utils/api';
import './Auth.css';

export const AuthPage: React.FC = () => {
  const [mode, setMode] = useState<'LOGIN' | 'SIGNUP'>('LOGIN');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('Sales Rep'); // For signup only
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const navigate = useNavigate();
  const { login, token } = useAuth();

  useEffect(() => {
    // If already authenticated, redirect immediately
    if (token) {
      navigate('/workspace');
    }
  }, [token, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGlobalError(null);
    setFieldErrors({});

    // Basic validation
    const errors: Record<string, string> = {};
    if (!email) errors.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(email)) errors.email = 'Invalid email format';
    
    if (!password) errors.password = 'Password is required';
    else if (password.length < 6) errors.password = 'Password must be at least 6 characters';

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setIsSubmitting(true);

    try {
      if (mode === 'LOGIN') {
        const response = await apiFetch('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Invalid credentials');
        }
        
        login(data.token, data.user);
        navigate('/workspace');
      } else {
        const response = await apiFetch('/auth/signup', {
          method: 'POST',
          body: JSON.stringify({ email, password, name: email.split('@')[0], role })
        });
        
        const data = await response.json();
        if (!response.ok) {
          // If backend returns a field-level error object (like Zod)
          if (data.error && typeof data.error === 'object' && !Array.isArray(data.error)) {
             setFieldErrors(data.error);
             return; // Stop here, don't set global error
          }
          throw new Error(data.error || 'Signup failed');
        }
        
        login(data.token, data.user);
        navigate('/workspace');
      }
    } catch (err: any) {
      setGlobalError(err.message || 'An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-header-icon">
            <Lock size={24} />
          </div>
          <h1 className="auth-title">DealFlow360</h1>
          <p className="auth-subtitle">
            {mode === 'LOGIN' ? 'Welcome back! Please enter your details.' : 'Create your account to get started.'}
          </p>
        </div>

        {globalError && (
          <div className="auth-main-error">
            {globalError}
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-form-group">
            <label className="auth-label">Email</label>
            <input 
              type="email" 
              className={`auth-input ${fieldErrors.email ? 'has-error' : ''}`}
              placeholder="name@company.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
            {fieldErrors.email && <span className="auth-error-msg">{fieldErrors.email}</span>}
          </div>

          <div className="auth-form-group">
            <label className="auth-label">Password</label>
            <input 
              type="password" 
              className={`auth-input ${fieldErrors.password ? 'has-error' : ''}`}
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
            {fieldErrors.password && <span className="auth-error-msg">{fieldErrors.password}</span>}
          </div>

          {mode === 'SIGNUP' && (
            <div className="auth-form-group">
              <label className="auth-label">Role</label>
              <select 
                className="auth-input"
                value={role}
                onChange={e => setRole(e.target.value)}
              >
                <option value="Sales Rep">Sales Rep</option>
                <option value="Manager">Manager</option>
                <option value="Finance">Finance</option>
                <option value="Admin">Admin</option>
              </select>
            </div>
          )}

          <button type="submit" className="auth-submit-btn" disabled={isSubmitting}>
            {isSubmitting ? 'Please wait...' : mode === 'LOGIN' ? <><LogIn size={18} /> Sign In</> : <><UserPlus size={18} /> Create Account</>}
          </button>
        </form>

        <div className="auth-switch">
          {mode === 'LOGIN' ? (
            <>
              Don't have an account? 
              <button type="button" onClick={() => { setMode('SIGNUP'); setGlobalError(null); setFieldErrors({}); }}>Sign up</button>
            </>
          ) : (
            <>
              Already have an account? 
              <button type="button" onClick={() => { setMode('LOGIN'); setGlobalError(null); setFieldErrors({}); }}>Log in</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
