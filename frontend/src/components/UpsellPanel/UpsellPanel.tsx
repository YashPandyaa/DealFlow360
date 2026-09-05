import { useState, useEffect } from 'react';
import './UpsellPanel.css';

// PROPS INTERFACE
// Do not rename without syncing with Dev A (this is a fixed contract).
export interface UpsellPanelProps {
  quotationId: string;
  onAdd: (productId: string) => void;
  onDismiss: (productId: string) => void;
}

// Shape of the suggestion data from backend
export interface UpsellSuggestion {
  productId: string;
  name: string;
  marginDelta: number;
  isPromoted: boolean;
}

export default function UpsellPanel({ quotationId, onAdd, onDismiss }: UpsellPanelProps) {
  const [suggestions, setSuggestions] = useState<UpsellSuggestion[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function fetchSuggestions() {
      setLoading(true);
      setError(null);
      
      try {
        // Dev B's endpoint
        const res = await fetch(`/upsell/${quotationId}`);
        if (!res.ok) {
          throw new Error('Failed to load suggestions');
        }
        
        const data = await res.json();
        
        if (isMounted) {
          setSuggestions(data);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || 'An error occurred while fetching suggestions.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    if (quotationId) {
      fetchSuggestions();
    } else {
      setSuggestions([]);
      setLoading(false);
    }

    return () => {
      isMounted = false;
    };
  }, [quotationId]);

  const handleDismiss = (productId: string) => {
    // Optimistic removal
    setSuggestions((prev) => prev.filter((item) => item.productId !== productId));
    // Trigger callback to parent
    onDismiss(productId);
  };

  const handleAdd = (productId: string) => {
    onAdd(productId);
  };

  if (loading) {
    return (
      <div className="upsell-panel-container">
        <p className="upsell-loading">Loading suggestions...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="upsell-panel-container">
        <p className="upsell-error">Error: {error}</p>
      </div>
    );
  }

  if (suggestions.length === 0) {
    return (
      <div className="upsell-panel-container">
        <p className="upsell-empty">No suggestions right now</p>
      </div>
    );
  }

  return (
    <div className="upsell-panel-container">
      <h3 className="upsell-title">Recommended for this Quote</h3>
      <ul className="upsell-list">
        {suggestions.map((item) => (
          <li key={item.productId} className="upsell-item">
            <div className="upsell-info">
              <span className="upsell-name">
                {item.name}
                {item.isPromoted && <span className="upsell-promo-badge">Promoted</span>}
              </span>
              <span 
                className={`upsell-margin ${
                  item.marginDelta >= 0 ? 'margin-positive' : 'margin-negative'
                }`}
              >
                {item.marginDelta >= 0 ? '+' : '-'}${Math.abs(item.marginDelta)} margin
              </span>
            </div>
            <div className="upsell-actions">
              <button 
                className="btn-add" 
                onClick={() => handleAdd(item.productId)}
                type="button"
              >
                Add to Quote
              </button>
              <button 
                className="btn-dismiss" 
                onClick={() => handleDismiss(item.productId)}
                type="button"
              >
                Dismiss
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
