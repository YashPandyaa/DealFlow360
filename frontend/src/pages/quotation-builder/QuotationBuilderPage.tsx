import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FileSpreadsheet, Trash2, Search, AlertCircle } from 'lucide-react';
import { useWorkspace } from '../workspace';
import UpsellPanel from '../../components/UpsellPanel/UpsellPanel';
import './QuotationBuilder.css';

// --- TYPES ---
export interface Product {
  id: string;
  name: string;
  category: 'Hardware' | 'Services' | 'Subscriptions';
  price: number;
  cost: number;
}

export interface CartLine {
  lineId: string;
  product: Product;
  quantity: number;
  discountPercent: number;
}

// --- MOCK DATA ---
const MOCK_PRODUCTS: Product[] = [
  { id: 'hw-1', name: 'Enterprise Router X1', category: 'Hardware', price: 1200, cost: 800 },
  { id: 'hw-2', name: 'Switch 48-Port', category: 'Hardware', price: 2500, cost: 1800 },
  { id: 'hw-3', name: 'Wifi 6 Access Point', category: 'Hardware', price: 450, cost: 250 },
  { id: 'svc-1', name: 'On-site Installation', category: 'Services', price: 500, cost: 300 },
  { id: 'svc-2', name: 'Network Audit', category: 'Services', price: 1500, cost: 900 },
  { id: 'sub-1', name: 'Cloud Management (1Yr)', category: 'Subscriptions', price: 120, cost: 40 },
  { id: 'sub-2', name: 'Advanced Threat Protection', category: 'Subscriptions', price: 300, cost: 100 },
];

export const QuotationBuilderPage: React.FC = () => {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const { activeQuotationId, setActiveQuotationId, registerReloadListener } = useWorkspace();
  
  // --- STATE ---
  // Product Picker
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('All');
  
  // Cart
  const [cartLines, setCartLines] = useState<CartLine[]>([]);
  const [orderDiscountPercent, setOrderDiscountPercent] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [syncedNotice, setSyncedNotice] = useState<string | null>(null);

  const currentId = id || activeQuotationId;

  // --- EFFECTS ---
  useEffect(() => {
    if (id && id !== activeQuotationId) {
      setActiveQuotationId(id);
    }
  }, [id, activeQuotationId, setActiveQuotationId]);

  useEffect(() => {
    const unregister = registerReloadListener(() => {
      setSyncedNotice(`Rates re-calculated at ${new Date().toLocaleTimeString()}`);
      setTimeout(() => setSyncedNotice(null), 3000);
      // In a real app, we might re-fetch cart lines to get new prices here
    });
    return unregister;
  }, [registerReloadListener]);

  // Fetch Products (Mocked)
  useEffect(() => {
    let isMounted = true;
    const fetchProducts = async () => {
      setProductsLoading(true);
      setProductsError(null);
      try {
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 800));
        
        // --- SIMULATED ERROR STATE FOR TESTING ---
        // Uncomment to test error state:
        // throw new Error("Failed to connect to product catalog API.");
        
        if (isMounted) {
          setProducts(MOCK_PRODUCTS);
        }
      } catch (err: any) {
        if (isMounted) {
          setProductsError(err.message || 'Failed to fetch products');
        }
      } finally {
        if (isMounted) setProductsLoading(false);
      }
    };
    
    fetchProducts();
    
    return () => { isMounted = false; };
  }, []);

  // --- ACTIONS ---
  const handleAddToCart = (product: Product) => {
    setCartLines(prev => {
      const existing = prev.find(line => line.product.id === product.id);
      if (existing) {
        return prev.map(line => 
          line.product.id === product.id 
            ? { ...line, quantity: line.quantity + 1 }
            : line
        );
      }
      return [...prev, { lineId: crypto.randomUUID(), product, quantity: 1, discountPercent: 0 }];
    });
  };

  const handleUpdateLine = (lineId: string, field: 'quantity' | 'discountPercent', value: number) => {
    setCartLines(prev => prev.map(line => {
      if (line.lineId === lineId) {
        let cleanVal = value;
        // Clamp logic
        if (field === 'discountPercent') {
          cleanVal = Math.max(0, Math.min(100, value || 0));
        } else if (field === 'quantity') {
          cleanVal = Math.max(1, value || 1);
        }
        return { ...line, [field]: cleanVal };
      }
      return line;
    }));
  };

  const handleRemoveLine = (lineId: string) => {
    setCartLines(prev => prev.filter(line => line.lineId !== lineId));
  };

  const handleOrderDiscountChange = (val: number) => {
    setOrderDiscountPercent(Math.max(0, Math.min(100, val || 0)));
  };

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      // Mock submit
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Determine branching logically based on backend rules (simulated here)
      // e.g. If margin is < 20% or order discount > 15%, requires approval
      const requiresApproval = marginPercentage < 20 || orderDiscountPercent > 15;
      
      if (requiresApproval) {
        navigate('/approval');
      } else {
        // Assume fulfillment handles active order
        navigate('/fulfillment');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- CALCULATIONS ---
  const { subtotal, orderTotal, marginPercentage } = useMemo(() => {
    let sub = 0;
    let cost = 0;
    
    cartLines.forEach(line => {
      const lineBasePrice = line.product.price * line.quantity;
      const lineFinalPrice = lineBasePrice * (1 - (line.discountPercent / 100));
      sub += lineFinalPrice;
      cost += (line.product.cost * line.quantity);
    });

    const total = sub * (1 - (orderDiscountPercent / 100));
    const marginCalc = total > 0 ? ((total - cost) / total) * 100 : 0;

    return {
      subtotal: sub,
      totalCost: cost,
      orderTotal: total,
      marginPercentage: marginCalc
    };
  }, [cartLines, orderDiscountPercent]);

  // --- DERIVED STATE ---
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchCat = activeCategory === 'All' || p.category === activeCategory;
      const matchSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [products, activeCategory, searchQuery]);

  return (
    <div className="page-container" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
        <div>
          <div className="page-badge">
            <FileSpreadsheet size={16} />
            <span>CPQ Quotation Engine</span>
          </div>
          <h1 className="page-title">
            {currentId ? `Quotation Builder — #${currentId}` : 'New Quotation Builder'}
          </h1>
          <p className="page-subtitle">
            Configure line items, discount margins, and pricing terms.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          {syncedNotice && (
            <div style={{ padding: '8px 16px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '8px', color: '#34d399', fontSize: '0.85rem', display: 'flex', alignItems: 'center' }}>
              ✓ {syncedNotice}
            </div>
          )}
        </div>
      </div>

      <div className="qb-container">
        <div className="qb-main">
          
          {/* PRODUCT PICKER */}
          <div className="qb-picker">
            <div className="qb-picker-header">
              <h3 className="qb-picker-title">Product Catalog</h3>
              <div style={{ position: 'relative' }}>
                <Search size={16} style={{ position: 'absolute', left: '10px', top: '10px', color: '#9ca3af' }} />
                <input 
                  className="qb-search"
                  type="text" 
                  placeholder="Search products..." 
                  style={{ paddingLeft: '32px' }}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <div className="qb-tabs">
              {['All', 'Hardware', 'Services', 'Subscriptions'].map(cat => (
                <button 
                  key={cat}
                  type="button"
                  className={`qb-tab ${activeCategory === cat ? 'active' : ''}`}
                  onClick={() => setActiveCategory(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>

            {productsLoading && <div className="qb-empty-state">Loading products...</div>}
            
            {productsError && (
              <div className="qb-empty-state" style={{ color: '#dc2626' }}>
                <AlertCircle size={32} style={{ margin: '0 auto 12px' }} />
                <div>{productsError}</div>
                <button 
                  type="button"
                  className="action-btn" 
                  style={{ marginTop: '12px' }}
                  onClick={() => window.location.reload()}
                >
                  Retry
                </button>
              </div>
            )}

            {!productsLoading && !productsError && filteredProducts.length === 0 && (
              <div className="qb-empty-state">No products found matching your criteria.</div>
            )}

            {!productsLoading && !productsError && (
              <div className="qb-product-grid">
                {filteredProducts.map(p => (
                  <div key={p.id} className="qb-product-card">
                    <div>
                      <h4 className="qb-product-name">{p.name}</h4>
                      <div className="qb-product-price">${p.price.toFixed(2)}</div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '4px' }}>{p.category}</div>
                    </div>
                    <button 
                      type="button"
                      className="qb-add-btn" 
                      onClick={() => handleAddToCart(p)}
                    >
                      Add to Cart
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* CART */}
          <div className="qb-cart">
            <h3 className="qb-cart-title">Order Lines</h3>
            
            {cartLines.length === 0 ? (
              <div className="qb-empty-state" style={{ padding: '20px' }}>Your cart is empty.</div>
            ) : (
              <table className="qb-cart-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Price</th>
                    <th>Qty</th>
                    <th>Discount (%)</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {cartLines.map(line => {
                    const lineTotal = (line.product.price * line.quantity) * (1 - (line.discountPercent / 100));
                    return (
                      <tr key={line.lineId}>
                        <td style={{ fontWeight: 500 }}>{line.product.name}</td>
                        <td>${line.product.price.toFixed(2)}</td>
                        <td>
                          <div className="qb-qty-controls">
                            <button type="button" className="qb-qty-btn" onClick={() => handleUpdateLine(line.lineId, 'quantity', line.quantity - 1)}>-</button>
                            <span style={{ width: '20px', textAlign: 'center' }}>{line.quantity}</span>
                            <button type="button" className="qb-qty-btn" onClick={() => handleUpdateLine(line.lineId, 'quantity', line.quantity + 1)}>+</button>
                          </div>
                        </td>
                        <td>
                          <input 
                            type="number" 
                            className="qb-discount-input"
                            value={line.discountPercent}
                            onChange={(e) => handleUpdateLine(line.lineId, 'discountPercent', parseFloat(e.target.value) || 0)}
                            min={0}
                            max={100}
                          />
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 500 }}>
                          ${lineTotal.toFixed(2)}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button 
                            type="button" 
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                            onClick={() => handleRemoveLine(line.lineId)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            <div className="qb-summary">
              <div className="qb-summary-col">
                <label className="qb-summary-label">Order Discount (%)</label>
                <input 
                  type="number" 
                  className="qb-discount-input"
                  value={orderDiscountPercent}
                  onChange={e => handleOrderDiscountChange(parseFloat(e.target.value) || 0)}
                  disabled={cartLines.length === 0}
                  min={0}
                  max={100}
                />
              </div>
              
              <div className="qb-summary-col" style={{ width: '250px' }}>
                <div className="qb-summary-row">
                  <span className="qb-summary-label">Subtotal:</span>
                  <span className="qb-summary-val">${subtotal.toFixed(2)}</span>
                </div>
                <div className="qb-summary-row" style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #e5e7eb' }}>
                  <span className="qb-summary-label">Order Total:</span>
                  <span className="qb-summary-val" style={{ fontSize: '1.25rem', color: '#111827' }}>${orderTotal.toFixed(2)}</span>
                </div>
                
                <div style={{ marginTop: '16px' }}>
                  <div className="qb-summary-label" style={{ marginBottom: '8px', fontSize: '0.75rem', textTransform: 'uppercase' }}>Live Margin</div>
                  <div className={`qb-margin-indicator ${
                    cartLines.length === 0 ? '' : 
                    marginPercentage >= 40 ? 'margin-good' : 
                    marginPercentage >= 20 ? 'margin-warn' : 'margin-bad'
                  }`}>
                    {cartLines.length === 0 ? '--' : `${marginPercentage.toFixed(1)}%`}
                  </div>
                </div>

                <button 
                  type="button" 
                  className="qb-confirm-btn"
                  onClick={handleConfirm}
                  disabled={cartLines.length === 0 || isSubmitting}
                >
                  {isSubmitting ? 'Confirming...' : 'Confirm Quotation'}
                </button>
              </div>
            </div>
            
          </div>
        </div>
        
        {/* RIGHT SIDEBAR - UPSELL PANEL */}
        <div style={{ position: 'sticky', top: 0 }}>
          <UpsellPanel 
            quotationId={currentId || 'draft'}
            onAdd={(productId) => {
              // Find full product details in mock to add to cart
              const product = MOCK_PRODUCTS.find(p => p.id === productId);
              if (product) {
                handleAddToCart(product);
              }
            }}
            onDismiss={(productId) => {
              // Intentionally do nothing on the cart side. UpsellPanel handles its local removal.
              console.log('Dismissed upsell:', productId);
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default QuotationBuilderPage;
