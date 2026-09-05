import React, { useState, useEffect } from 'react';
import { apiFetch } from '../../utils/api';
import { Sparkles, TrendingUp, Plus, X, AlertCircle } from 'lucide-react';

/**
 * UpsellPanel Component
 * @param {string} quotationId - Active quotation ID
 * @param {function} onAdd - Callback when adding a suggested product to quote (productId)
 * @param {function} onDismiss - Callback when dismissing a suggestion (productId)
 */
export default function UpsellPanel({ quotationId, onAdd, onDismiss }) {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dismissedIds, setDismissedIds] = useState([]);

  useEffect(() => {
    if (!quotationId) {
      setSuggestions([]);
      return;
    }

    const fetchSuggestions = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await apiFetch(`/upsell/${quotationId}`);
        setSuggestions(data || []);
      } catch (err) {
        setError('Failed to load upsell recommendations');
      } finally {
        setLoading(false);
      }
    };

    fetchSuggestions();
  }, [quotationId]);

  const handleDismiss = (productId) => {
    setDismissedIds((prev) => [...prev, productId]);
    if (onDismiss) {
      onDismiss(productId);
    }
  };

  const visibleSuggestions = suggestions.filter(
    (s) => !dismissedIds.includes(s.productId)
  );

  return (
    <div
      className="card card-glass"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        border: '1px solid rgba(139, 92, 246, 0.3)',
        boxShadow: '0 4px 20px rgba(139, 92, 246, 0.08)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#8b5cf6', fontWeight: '700', fontSize: '0.95rem' }}>
          <Sparkles size={18} />
          <span>Recommended Upsell Pairings</span>
        </div>
        <span className="badge badge-purple" style={{ fontSize: '0.65rem' }}>AI Powered</span>
      </div>

      {loading ? (
        <div style={{ padding: '1.5rem', textAlign: 'center', color: '#9ca3af' }}>
          <span className="spinner" style={{ borderTopColor: '#8b5cf6' }} />
          <p style={{ marginTop: '0.5rem', fontSize: '0.8rem' }}>Fetching recommendations...</p>
        </div>
      ) : error ? (
        <div style={{ padding: '0.75rem', fontSize: '0.8rem', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      ) : visibleSuggestions.length === 0 ? (
        <div style={{ padding: '1.25rem', textAlign: 'center', color: '#6b7280', fontSize: '0.825rem' }}>
          No additional upsell recommendations for this quotation.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {visibleSuggestions.map((item) => {
            const isPositiveMargin = (item.marginDelta || 0) >= 0;

            return (
              <div
                key={item.productId}
                style={{
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '0.85rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <div>
                    <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#0f172a' }}>
                      {item.productName || item.name || 'Suggested Product'}
                    </div>
                    {item.isPromoted && (
                      <span className="badge badge-amber" style={{ fontSize: '0.625rem', marginTop: '0.2rem' }}>
                        PROMOTED
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => handleDismiss(item.productId)}
                    style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '0.1rem' }}
                    title="Dismiss suggestion"
                  >
                    <X size={14} />
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.775rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <TrendingUp size={13} color={isPositiveMargin ? '#059669' : '#dc2626'} />
                    <span style={{ color: isPositiveMargin ? '#059669' : '#dc2626', fontWeight: '600' }}>
                      {isPositiveMargin ? '+' : ''}{(item.marginDelta || 0).toFixed(1)}% Margin Delta
                    </span>
                  </div>

                  {item.coPurchaseScore !== undefined && (
                    <span style={{ color: '#475569' }}>Score: {(item.coPurchaseScore * 100).toFixed(0)}%</span>
                  )}
                </div>

                <button
                  onClick={() => onAdd && onAdd(item.productId)}
                  className="btn btn-sm"
                  style={{
                    backgroundColor: '#f5f3ff',
                    color: '#6d28d9',
                    border: '1px solid #ddd6fe',
                    marginTop: '0.25rem',
                    justifyContent: 'center'
                  }}
                >
                  <Plus size={14} />
                  <span>Add to Quote</span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
