import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../../context/WorkspaceContext';
import { apiFetch } from '../../utils/api';
import UpsellPanel from '../../components/UpsellPanel/UpsellPanel';
import RiskAnalysisPanel from '../../components/RiskAnalysisPanel/RiskAnalysisPanel';
import {
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  Send,
  Search,
  Tag,
  TrendingUp,
  AlertTriangle,
  ArrowRight,
  Save,
  CheckCircle,
  FileText,
  MessageSquare,
  ShieldAlert,
  ShieldCheck
} from 'lucide-react';

export default function QuotationBuilder() {
  const { activeQuotationId, setActiveQuotationId, reloadCounter } = useWorkspace();
  const navigate = useNavigate();

  const [quotation, setQuotation] = useState(null);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerLimit, setCustomerLimit] = useState(15.0);
  const [cart, setCart] = useState([]); // [{ productId, product, quantity, unitPrice, discountPercent, lineTotal }]
  const [orderDiscount, setOrderDiscount] = useState(0);
  const [customerTier, setCustomerTier] = useState('GOLD');
  const [categoryCeilings, setCategoryCeilings] = useState([]);
  const [discountTiers, setDiscountTiers] = useState([]);

  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // 1. Fetch products, customers, discount rules & active quotation
  useEffect(() => {
    const loadInitialData = async () => {
      setLoading(true);
      setError('');
      try {
        const [prodsRes, custsRes, catsRes, tiersRes] = await Promise.allSettled([
          apiFetch(categoryFilter !== 'ALL' ? `/products?category=${categoryFilter}` : '/products'),
          apiFetch('/auth/customers'),
          apiFetch('/discounts/category-ceilings'),
          apiFetch('/discounts/tiers')
        ]);

        if (prodsRes.status === 'fulfilled') setProducts(prodsRes.value || []);
        if (custsRes.status === 'fulfilled') setCustomers(custsRes.value || []);
        if (catsRes.status === 'fulfilled') setCategoryCeilings(catsRes.value || []);
        if (tiersRes.status === 'fulfilled') setDiscountTiers(tiersRes.value || []);

        let currentQuoteId = activeQuotationId;

        if (!currentQuoteId) {
          try {
            const existingQuotes = await apiFetch('/quotations');
            const draftQuote = Array.isArray(existingQuotes) ? existingQuotes.find((q) => q.status === 'DRAFT') : null;
            if (draftQuote) {
              currentQuoteId = draftQuote.id;
              setActiveQuotationId(draftQuote.id);
            } else {
              const newQuote = await apiFetch('/quotations', {
                method: 'POST',
                body: JSON.stringify({ customerName: 'Customer Account A' })
              });
              currentQuoteId = newQuote?.id || newQuote?.quotationId;
              if (currentQuoteId) {
                setActiveQuotationId(currentQuoteId);
              }
            }
          } catch (autoErr) {
            console.warn('Auto quotation resolution failed:', autoErr);
          }
        }

        if (currentQuoteId) {
          try {
            const qData = await apiFetch(`/quotations/${currentQuoteId}`);
            setQuotation(qData);
            setCustomerTier(qData.customerTier || 'GOLD');
            if (qData.customerId) setSelectedCustomerId(qData.customerId);

            if (qData.lines && qData.lines.length > 0) {
              const formattedCart = qData.lines.map((l) => ({
                productId: l.productId,
                product: l.product,
                quantity: l.quantity,
                unitPrice: l.unitPrice,
                discountPercent: l.discountPercent || l.discount || 0,
                lineTotal: l.lineTotal || l.totalPrice || 0
              }));
              setCart(formattedCart);
            }
          } catch (qErr) {
            console.warn('Failed to load active quotation details:', qErr);
          }
        }
      } catch (err) {
        setError(err.message || 'Failed to initialize Quotation Builder');
      } finally {
        setLoading(false);
      }
    };

    loadInitialData();
  }, [categoryFilter, reloadCounter]);

  // 2. Fetch customer discount limit when customer selection or tier changes
  useEffect(() => {
    const tierRec = discountTiers.find((t) => t.customerTier?.toUpperCase() === customerTier.toUpperCase());
    const fallbackTierLimit = tierRec ? tierRec.maxDiscountPercent : (customerTier === 'GOLD' ? 15.0 : customerTier === 'SILVER' ? 10.0 : 5.0);

    if (!selectedCustomerId) {
      setCustomerLimit(fallbackTierLimit);
      return;
    }

    const fetchLimit = async () => {
      try {
        const res = await apiFetch(`/discounts/customer-limits/${selectedCustomerId}`);
        if (res && typeof res.maxDiscountPercent === 'number') {
          setCustomerLimit(res.maxDiscountPercent);
        } else {
          setCustomerLimit(fallbackTierLimit);
        }
      } catch (err) {
        setCustomerLimit(fallbackTierLimit);
      }
    };
    fetchLimit();
  }, [selectedCustomerId, customerTier, discountTiers]);

  // 2b. Live Risk Calculation on Cart & Customer Changes
  useEffect(() => {
    if (!cart || cart.length === 0) {
      setQuotation((prev) => (prev ? { ...prev, riskAnalysis: null } : null));
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const riskInputLines = cart.map((item) => ({
          productId: item.productId,
          productName: item.product?.name || item.product?.category || 'Product',
          category: item.product?.category || 'Hardware',
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          costPrice: item.product?.costPrice || (item.product?.marginPercent ? item.unitPrice * (1 - item.product.marginPercent / 100) : 0),
          discountPercent: item.discountPercent,
          lineTotal: item.lineTotal
        }));

        const liveRisk = await apiFetch('/discounts/calculate-risk', {
          method: 'POST',
          body: JSON.stringify({
            quotationId: activeQuotationId,
            customerTier,
            customerId: selectedCustomerId,
            lines: riskInputLines
          })
        });

        if (liveRisk && !liveRisk.error) {
          setQuotation((prev) => (prev ? { ...prev, riskAnalysis: liveRisk } : { riskAnalysis: liveRisk }));
        }
      } catch (err) {
        console.warn('Live risk calculation failed:', err);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [cart, customerTier, selectedCustomerId, activeQuotationId]);

  // 3. Add Product to Cart
  const handleAddToCart = (product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.productId === product.id);
      if (existing) {
        return prev.map((item) =>
          item.productId === product.id
            ? {
                ...item,
                quantity: item.quantity + 1,
                lineTotal: (item.quantity + 1) * item.unitPrice * (1 - item.discountPercent / 100)
              }
            : item
        );
      }
      const unitPrice = product.basePrice || 100;
      return [
        ...prev,
        {
          productId: product.id,
          product,
          quantity: 1,
          unitPrice,
          discountPercent: 0,
          lineTotal: unitPrice
        }
      ];
    });
  };

  // 4. Update Line Quantity or Discount
  const handleUpdateLine = (productId, field, value) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.productId !== productId) return item;

        let quantity = item.quantity;
        let discountPercent = item.discountPercent;

        if (field === 'quantity') {
          quantity = Math.max(1, parseInt(value, 10) || 1);
        } else if (field === 'discountPercent') {
          discountPercent = Math.min(100, Math.max(0, parseFloat(value) || 0));
        }

        const rawTotal = quantity * item.unitPrice;
        const lineTotal = Math.max(0, rawTotal * (1 - discountPercent / 100));

        return {
          ...item,
          quantity,
          discountPercent,
          lineTotal
        };
      })
    );
  };

  // 5. Remove Line from Cart
  const handleRemoveLine = (productId) => {
    setCart((prev) => prev.filter((item) => item.productId !== productId));
  };

  const handleAddById = (prodId) => {
    const targetProd = products.find((p) => p.id === prodId);
    if (targetProd) {
      handleAddToCart(targetProd);
    }
  };

  // 6. Recalculate Totals and Margins dynamically against admin-configured limits
  const calculatedLines = cart.map((item) => {
    const rawTotal = item.quantity * item.unitPrice;
    const lineDiscountVal = rawTotal * ((item.discountPercent || 0) / 100);
    const lineTotal = Math.max(0, rawTotal - lineDiscountVal);
    const marginPercent = item.product?.marginPercent || 30;
    const cost = rawTotal * (1 - marginPercent / 100);

    const catName = item.product?.category || 'Hardware';
    
    // Dynamic Category Ceiling lookup from DB configuration
    const ceilingRecord = categoryCeilings.find(
      (c) =>
        c.category?.toLowerCase() === catName.toLowerCase() ||
        c.category?.toLowerCase().replace(/s$/, '') === catName.toLowerCase().replace(/s$/, '')
    );
    const catCeiling = ceilingRecord ? ceilingRecord.maxDiscountPercent : (catName.toLowerCase().includes('hardware') ? 15 : catName.toLowerCase().includes('software') ? 10 : 5);

    // Dynamic Tier Ceiling lookup from DB configuration
    const tierRecord = discountTiers.find(
      (t) => t.customerTier?.toUpperCase() === customerTier.toUpperCase()
    );
    const tierCeiling = tierRecord ? tierRecord.maxDiscountPercent : (customerTier === 'GOLD' ? 15.0 : customerTier === 'SILVER' ? 10.0 : 5.0);

    // Effective Allowed Limit = Most restrictive applicable limit
    const effectiveAllowed = selectedCustomerId
      ? Math.min(customerLimit, catCeiling, tierCeiling)
      : Math.min(catCeiling, tierCeiling);
    const lineOverage = Math.max(0, (item.discountPercent || 0) - effectiveAllowed);
    return { ...item, lineTotal, cost, catName, catCeiling, tierCeiling, effectiveAllowed, lineOverage };
  });

  const subtotal = calculatedLines.reduce((acc, l) => acc + l.lineTotal, 0);
  const totalDiscountVal = subtotal * (orderDiscount / 100);
  const runningTotal = Math.max(0, subtotal - totalDiscountVal);

  const totalCost = calculatedLines.reduce((acc, l) => acc + l.cost, 0);
  const totalProfit = runningTotal - totalCost;
  const liveMarginPercent = runningTotal > 0 ? (totalProfit / runningTotal) * 100 : 0;

  // Check if any line has discount > effectiveAllowed
  const violatingLines = calculatedLines.filter((l) => l.lineOverage > 0);
  const hasDiscountViolation = violatingLines.length > 0 || orderDiscount > customerLimit;

  const getMarginBadgeClass = (margin) => {
    if (margin >= 30) return 'badge-green';
    if (margin >= 15) return 'badge-amber';
    return 'badge-red';
  };

  // 7. Save / Persist Lines via PATCH /quotations/:id/lines
  const handleSaveLines = async () => {
    if (!activeQuotationId) {
      setError('No active quotation selected. Please create one from the Pipeline.');
      return false;
    }

    if (quotation && quotation.status !== 'DRAFT') {
      return true;
    }

    setSaving(true);
    setError('');
    setSuccessMsg('');

    try {
      const payloadLines = cart.map((l) => ({
        productId: l.productId,
        quantity: l.quantity,
        discountPercent: l.discountPercent
      }));

      const updatedQuote = await apiFetch(`/quotations/${activeQuotationId}/lines`, {
        method: 'PATCH',
        body: JSON.stringify({ lines: payloadLines })
      });

      if (updatedQuote) {
        setQuotation(updatedQuote);
      }

      setSuccessMsg('Cart lines saved successfully!');
      setTimeout(() => setSuccessMsg(''), 3000);
      return true;
    } catch (err) {
      setError(err.message || 'Failed to save quotation lines');
      return false;
    } finally {
      setSaving(false);
    }
  };

  // 8. Submit for Approval Evaluation
  const handleSubmitQuotation = async () => {
    if (!activeQuotationId) {
      setError('No active quotation selected.');
      return;
    }

    if (cart.length === 0) {
      setError('Cannot submit an empty quotation. Please add at least one line item from the catalog.');
      return;
    }

    setSubmitting(true);
    setError('');

    if (!quotation || quotation.status === 'DRAFT') {
      const saved = await handleSaveLines();
      if (!saved) {
        setSubmitting(false);
        return;
      }
    }

    try {
      const result = await apiFetch('/approvals/submit', {
        method: 'POST',
        body: JSON.stringify({
          quotationId: activeQuotationId,
          customerTier,
          customerId: selectedCustomerId || quotation?.customerId,
          customerName: quotation?.customerName
        })
      });

      if (result.requiresApproval) {
        setSuccessMsg('Quotation submitted successfully for Sales Manager approval.');
        setTimeout(() => {
          navigate('/workspace/approval');
        }, 1000);
      } else {
        setSuccessMsg('Quotation auto-approved and ready for fulfillment!');
        setTimeout(() => {
          navigate('/workspace/fulfillment');
        }, 1000);
      }
    } catch (err) {
      setError(err.message || 'Failed to submit quotation');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredProducts = products.filter((p) => {
    const term = search.toLowerCase();
    const matchSearch =
      !search ||
      p.name.toLowerCase().includes(term) ||
      (p.category && p.category.toLowerCase().includes(term));
    return matchSearch;
  });

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#0f172a' }}>Quotation Builder</h1>
            <span className="badge badge-blue">Quote #{quotation?.quoteNumber || activeQuotationId?.slice(0, 8) || 'DRAFT'}</span>
          </div>
          <p style={{ color: '#475569', fontSize: '0.85rem' }}>Build order lines, evaluate live margins & trigger governance approvals</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button onClick={handleSaveLines} className="btn btn-secondary" disabled={saving}>
            <Save size={16} />
            <span>{saving ? 'Saving Lines...' : 'Save Draft Lines'}</span>
          </button>
          <button onClick={handleSubmitQuotation} className="btn btn-primary" disabled={submitting}>
            <Send size={16} />
            <span>{submitting ? 'Evaluating Governance...' : 'Submit Quotation'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="badge-red" style={{ padding: '0.75rem 1rem', borderRadius: '8px', fontSize: '0.85rem' }}>
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="badge-green" style={{ padding: '0.75rem 1rem', borderRadius: '8px', fontSize: '0.85rem' }}>
          <CheckCircle size={16} />
          <span>{successMsg}</span>
        </div>
      )}

      {/* DYNAMIC DISCOUNT GOVERNANCE FEEDBACK BANNER */}
      {cart.length > 0 && (
        <div
          className="card"
          style={{
            padding: '1rem 1.25rem',
            borderLeft: hasDiscountViolation ? '4px solid #f59e0b' : '4px solid #10b981',
            backgroundColor: hasDiscountViolation ? '#fffbeb' : '#ecfdf5'
          }}
        >
          {hasDiscountViolation ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <ShieldAlert size={22} color="#d97706" />
                  <div>
                    <h4 style={{ margin: 0, fontSize: '1rem', color: '#92400e', fontWeight: 700 }}>
                      Manager Approval Required
                    </h4>
                    <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.83rem', color: '#b45309' }}>
                      Discount ceiling violation detected. Submitting this quotation will route it to the Sales Manager for approval.
                    </p>
                  </div>
                </div>
                <span className="badge badge-amber" style={{ fontSize: '0.85rem', padding: '0.35rem 0.75rem' }}>
                  Required Approval: Sales Manager
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', backgroundColor: '#ffffff', padding: '0.75rem 1rem', borderRadius: '6px', border: '1px solid #fde68a', fontSize: '0.85rem' }}>
                <div>
                  <span style={{ color: '#64748b' }}>Customer Tier:</span>{' '}
                  <strong style={{ color: '#0f172a' }}>{customerTier}</strong>
                </div>
                <div>
                  <span style={{ color: '#64748b' }}>Configured Ceiling:</span>{' '}
                  <strong style={{ color: '#059669' }}>
                    {(discountTiers.find(t => t.customerTier?.toUpperCase() === customerTier.toUpperCase())?.maxDiscountPercent || (customerTier === 'GOLD' ? 15 : customerTier === 'SILVER' ? 10 : 5))}%
                  </strong>
                </div>
                <div>
                  <span style={{ color: '#64748b' }}>Applied Discount:</span>{' '}
                  <strong style={{ color: '#dc2626' }}>
                    {Math.max(...violatingLines.map(l => l.discountPercent))}%
                  </strong>
                </div>
                <div>
                  <span style={{ color: '#64748b' }}>Required Approval:</span>{' '}
                  <strong style={{ color: '#d97706' }}>Sales Manager</strong>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <ShieldCheck size={22} color="#059669" />
                <div>
                  <h4 style={{ margin: 0, fontSize: '0.95rem', color: '#065f46', fontWeight: 700 }}>
                    ✓ Discount Within Customer Tier Limit
                  </h4>
                  <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.83rem', color: '#047857' }}>
                    Customer Tier Limit: <strong>{customerTier} ({(discountTiers.find(t => t.customerTier?.toUpperCase() === customerTier.toUpperCase())?.maxDiscountPercent || (customerTier === 'GOLD' ? 15 : customerTier === 'SILVER' ? 10 : 5))}% Ceiling)</strong> &bull; All line item discounts are within governance limits. Approval not required.
                  </p>
                </div>
              </div>
              <span className="badge badge-green">Auto-Approved</span>
            </div>
          )}
        </div>
      )}

      {/* Main Grid: Picker + Cart (Left 7) | Upsell Panel (Right 5) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 7fr) minmax(0, 3.5fr)', gap: '1.25rem', alignItems: 'start' }}>
        
        {/* LEFT COLUMN: Product Catalog Picker & Cart */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* CART / ORDER LINES SECTION */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem', fontWeight: '700', color: '#0f172a' }}>
                <ShoppingCart size={18} color="#2563eb" />
                <span>Order Lines ({cart.length})</span>
              </div>

              {/* LIVE MARGIN INDICATOR */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <span style={{ fontSize: '0.8rem', color: '#475569' }}>Live Margin:</span>
                <span className={`badge ${getMarginBadgeClass(liveMarginPercent)}`} style={{ fontSize: '0.85rem', padding: '0.3rem 0.65rem' }}>
                  <TrendingUp size={14} />
                  {liveMarginPercent.toFixed(1)}% Margin
                </span>
              </div>
            </div>

            {calculatedLines.length === 0 ? (
              <div className="empty-state" style={{ padding: '2rem 1rem' }}>
                <ShoppingCart size={36} color="#64748b" />
                <p style={{ marginTop: '0.5rem', color: '#475569', fontSize: '0.85rem' }}>Your quotation cart is currently empty.</p>
                <p style={{ color: '#64748b', fontSize: '0.775rem' }}>Select products from the catalog below to add lines.</p>
              </div>
            ) : (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Category</th>
                      <th>Qty</th>
                      <th>Unit Price</th>
                      <th>Allowed Limit</th>
                      <th>Discount %</th>
                      <th>Line Total</th>
                      <th style={{ textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calculatedLines.map((line) => (
                      <tr key={line.productId} style={{ backgroundColor: line.lineOverage > 0 ? '#fef2f2' : 'transparent' }}>
                        <td style={{ fontWeight: '600', color: '#0f172a' }}>{line.product?.name || line.productId}</td>
                        <td><span className="badge badge-purple">{line.catName}</span></td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <button onClick={() => handleUpdateLine(line.productId, 'quantity', line.quantity - 1)} className="btn btn-outline btn-sm" style={{ padding: '0.15rem 0.35rem' }}>-</button>
                            <span style={{ width: '24px', textAlign: 'center', fontWeight: '600', color: '#0f172a' }}>{line.quantity}</span>
                            <button onClick={() => handleUpdateLine(line.productId, 'quantity', line.quantity + 1)} className="btn btn-outline btn-sm" style={{ padding: '0.15rem 0.35rem' }}>+</button>
                          </div>
                        </td>
                        <td>${(line.unitPrice || 0).toFixed(2)}</td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', fontSize: '0.75rem' }}>
                            <span className="badge badge-blue" style={{ fontSize: '0.7rem' }}>
                              Effective: {line.effectiveAllowed}% Max
                            </span>
                            <span style={{ color: '#64748b', fontSize: '0.68rem' }}>
                              (Tier: {line.tierCeiling}% | Cat: {line.catCeiling}%)
                            </span>
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                            <input
                              type="number"
                              className="form-input"
                              style={{ width: '80px', padding: '0.25rem 0.4rem', fontSize: '0.8rem', borderColor: line.lineOverage > 0 ? '#ef4444' : '#cbd5e1', fontWeight: line.lineOverage > 0 ? '700' : 'normal', color: line.lineOverage > 0 ? '#dc2626' : '#0f172a' }}
                              value={line.discountPercent}
                              onChange={(e) => handleUpdateLine(line.productId, 'discountPercent', e.target.value)}
                              min="0"
                              max="100"
                            />
                            {line.lineOverage > 0 && (
                              <div
                                className="badge badge-amber"
                                style={{ fontSize: '0.68rem', display: 'flex', flexDirection: 'column', gap: '0.1rem', padding: '0.35rem 0.5rem', textAlign: 'left' }}
                              >
                                <span style={{ fontWeight: '700' }}>ℹ Exceeds ceiling limit</span>
                                <span>Allowed: {line.effectiveAllowed}% | Requested: {line.discountPercent}%</span>
                                <span>Excess: +{line.lineOverage.toFixed(1)}% &bull; Routes to Sales Manager</span>
                              </div>
                            )}
                          </div>
                        </td>
                        <td style={{ fontWeight: '700', color: '#059669' }}>${line.lineTotal.toFixed(2)}</td>
                        <td style={{ textAlign: 'right' }}>
                          <button onClick={() => handleRemoveLine(line.productId)} className="btn btn-outline btn-sm" style={{ color: '#dc2626' }}>
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* ORDER TOTALS SUMMARY FOOTER */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #e2e8f0', paddingTop: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Customer Tier</label>
                  <select
                    className="form-select"
                    value={customerTier}
                    onChange={(e) => setCustomerTier(e.target.value)}
                    style={{ padding: '0.35rem 0.65rem' }}
                  >
                    <option value="GOLD">Gold Tier (15%)</option>
                    <option value="SILVER">Silver Tier (10%)</option>
                    <option value="BRONZE">Bronze Tier (5%)</option>
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Customer Tier Limit</label>
                  <span className="badge badge-blue" style={{ fontSize: '0.85rem', padding: '0.45rem 0.75rem' }}>
                    {(discountTiers.find(t => t.customerTier?.toUpperCase() === customerTier.toUpperCase())?.maxDiscountPercent || (customerTier === 'GOLD' ? 15 : customerTier === 'SILVER' ? 10 : 5))}% Tier Ceiling
                  </span>
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.8rem', color: '#475569' }}>Subtotal: ${subtotal.toFixed(2)}</div>
                <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#059669' }}>
                  Total: ${runningTotal.toFixed(2)}
                </div>
              </div>
            </div>

            {/* LIVE RISK ANALYSIS & APPROVAL ROUTING PANEL */}
            {cart && cart.length > 0 && quotation?.riskAnalysis && (quotation.riskAnalysis.risk_score > 0 || (quotation.riskAnalysis.violations && quotation.riskAnalysis.violations.length > 0) || quotation.riskAnalysis.requiresApproval) && (
              <div style={{ marginTop: '1.5rem' }}>
                <RiskAnalysisPanel riskAnalysis={quotation?.riskAnalysis} quotation={quotation} />
              </div>
            )}
          </div>

          {/* PRODUCT PICKER CATALOG */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: '700', color: '#0f172a' }}>Product Catalog</h3>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {['ALL', 'Hardware', 'Services', 'Subscriptions'].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat)}
                    className={`btn btn-sm ${categoryFilter === cat ? 'btn-primary' : 'btn-outline'}`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Search size={16} color="#64748b" />
              <input
                type="text"
                className="form-input"
                placeholder="Search products by name or category..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>

            {loading ? (
              <div className="empty-state">
                <span className="spinner" />
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.85rem' }}>
                {filteredProducts.map((prod) => (
                  <div
                    key={prod.id}
                    style={{
                      backgroundColor: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      padding: '0.85rem',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: '0.65rem'
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#0f172a' }}>{prod.name}</div>
                      <span className="badge badge-purple" style={{ fontSize: '0.625rem', marginTop: '0.2rem' }}>{prod.category}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '0.5rem', borderTop: '1px dashed #e2e8f0' }}>
                      <span style={{ fontSize: '0.95rem', fontWeight: '700', color: '#059669' }}>
                        ${(prod.basePrice || 0).toFixed(2)}
                      </span>
                      <button onClick={() => handleAddToCart(prod)} className="btn btn-primary btn-sm">
                        <Plus size={14} />
                        <span>Add</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: AI Upsell Panel Component */}
        <div>
          <UpsellPanel
            quotationId={activeQuotationId}
            onAdd={handleAddById}
            onDismiss={() => {}}
          />
        </div>
      </div>
    </div>
  );
}
