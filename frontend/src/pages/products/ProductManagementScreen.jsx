import React, { useState, useEffect } from 'react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { apiFetch } from '../../utils/api';
import {
  Package,
  Plus,
  Search,
  Filter,
  Layers,
  DollarSign,
  Tag,
  Boxes,
  Shield,
  Edit,
  Trash2,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Sliders,
  Calendar,
  X,
  Check,
  Eye,
  Repeat,
  ShoppingBag,
  TrendingUp,
  Warehouse as WarehouseIcon,
  ChevronRight
} from 'lucide-react';

export default function ProductManagementScreen() {
  const { user } = useWorkspace();
  const isAdmin = user?.role === 'ADMIN';
  const isFinance = user?.role === 'FINANCE' || user?.role === 'FINANCE_OPERATIONS';
  const isManager = user?.role === 'MANAGER';
  const canModifyProducts = isAdmin;
  const canModifyStock = isAdmin || isFinance;

  // Active Tab State: 'products' | 'price-lists' | 'stock'
  const [activeTab, setActiveTab] = useState('products');

  // Data States
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [priceLists, setPriceLists] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [subscriptionPlans, setSubscriptionPlans] = useState([]);

  // Filter & Search States
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [billingFilter, setBillingFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modal States
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showVariantModal, setShowVariantModal] = useState(false);
  const [showStockModal, setShowStockModal] = useState(false);
  const [showPriceListModal, setShowPriceListModal] = useState(false);

  // Selected Item States
  const [selectedProduct, setSelectedProduct] = useState(null);

  // Form States
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Add/Edit Product Form State
  const [productForm, setProductForm] = useState({
    sku: '',
    name: '',
    description: '',
    category: 'Hardware',
    basePrice: 0,
    costPrice: 0,
    unit: 'PCS',
    tax: 18,
    currency: 'INR',
    productType: 'PHYSICAL',
    billingType: 'ONE_TIME',
    status: 'ACTIVE',
    subscriptionPlanId: '',
    variants: [],
    stocks: []
  });

  // Variant Form State
  const [newVariant, setNewVariant] = useState({ attribute: '', value: '', extraPrice: 0 });

  // Stock Update Form State
  const [stockForm, setStockForm] = useState({ warehouseId: '', quantity: 0, reorderLevel: 10 });

  // Price List Form State
  const [priceListForm, setPriceListForm] = useState({
    name: '',
    customerTier: 'GOLD',
    currency: 'INR',
    productId: '',
    overridePrice: 0,
    description: ''
  });

  // Fetch Catalog & Auxiliary Data
  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const [prodsRes, catsRes, pListsRes, whRes, subsRes] = await Promise.allSettled([
        apiFetch(`/products?status=${statusFilter}&category=${categoryFilter}&billingType=${billingFilter}&search=${searchQuery}`),
        apiFetch('/products/categories'),
        apiFetch('/products/price-lists'),
        apiFetch('/warehouses'),
        apiFetch('/subscriptions/plans')
      ]);

      if (prodsRes.status === 'fulfilled') setProducts(Array.isArray(prodsRes.value) ? prodsRes.value : []);
      if (catsRes.status === 'fulfilled') setCategories(Array.isArray(catsRes.value) ? catsRes.value : []);
      if (pListsRes.status === 'fulfilled') setPriceLists(Array.isArray(pListsRes.value) ? pListsRes.value : []);
      if (whRes.status === 'fulfilled') setWarehouses(Array.isArray(whRes.value) ? whRes.value : []);
      if (subsRes.status === 'fulfilled') setSubscriptionPlans(Array.isArray(subsRes.value) ? subsRes.value : []);
    } catch (err) {
      console.error('Failed to load products data:', err);
      setError(err.message || 'Failed to load product catalog');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [categoryFilter, billingFilter, statusFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchData();
  };

  // 1. Create Product Handler
  const handleCreateProduct = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccessMsg('');

    try {
      const payload = {
        ...productForm,
        basePrice: Number(productForm.basePrice),
        costPrice: Number(productForm.costPrice),
        tax: Number(productForm.tax)
      };

      await apiFetch('/products', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      setSuccessMsg(`Product '${productForm.name}' created successfully!`);
      setShowAddModal(false);
      resetProductForm();
      fetchData();
    } catch (err) {
      setError(err.message || 'Failed to create product');
    } finally {
      setSubmitting(false);
    }
  };

  // 2. Update Product Handler
  const handleUpdateProduct = async (e) => {
    e.preventDefault();
    if (!selectedProduct?.id) return;
    setSubmitting(true);
    setError('');

    try {
      const payload = {
        ...productForm,
        basePrice: Number(productForm.basePrice),
        costPrice: Number(productForm.costPrice),
        tax: Number(productForm.tax)
      };

      await apiFetch(`/products/${selectedProduct.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });

      setSuccessMsg(`Product '${productForm.name}' updated successfully!`);
      setShowEditModal(false);
      fetchData();
    } catch (err) {
      setError(err.message || 'Failed to update product');
    } finally {
      setSubmitting(false);
    }
  };

  // 3. Delete Product Handler
  const handleDeleteProduct = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete product '${name}'?`)) return;
    setError('');

    try {
      await apiFetch(`/products/${id}`, { method: 'DELETE' });
      setSuccessMsg(`Product '${name}' deleted successfully!`);
      fetchData();
    } catch (err) {
      setError(err.message || `Cannot delete product '${name}'`);
    }
  };

  // 4. Add Variant Handler
  const handleAddVariant = async (e) => {
    e.preventDefault();
    if (!selectedProduct?.id || !newVariant.attribute || !newVariant.value) return;
    setSubmitting(true);
    setError('');

    try {
      await apiFetch(`/products/${selectedProduct.id}/variants`, {
        method: 'POST',
        body: JSON.stringify({
          attribute: newVariant.attribute.trim(),
          value: newVariant.value.trim(),
          extraPrice: Number(newVariant.extraPrice || 0)
        })
      });
      setNewVariant({ attribute: '', value: '', extraPrice: 0 });
      const updated = await apiFetch(`/products/${selectedProduct.id}`);
      setSelectedProduct(updated);
      fetchData();
    } catch (err) {
      setError(err.message || 'Failed to add variant');
    } finally {
      setSubmitting(false);
    }
  };

  // Delete Variant
  const handleDeleteVariant = async (variantId) => {
    if (!selectedProduct?.id) return;
    try {
      await apiFetch(`/products/${selectedProduct.id}/variants/${variantId}`, { method: 'DELETE' });
      const updated = await apiFetch(`/products/${selectedProduct.id}`);
      setSelectedProduct(updated);
      fetchData();
    } catch (err) {
      setError(err.message || 'Failed to delete variant');
    }
  };

  // 5. Stock Update Handler
  const handleUpdateStock = async (e) => {
    e.preventDefault();
    if (!selectedProduct?.id || !stockForm.warehouseId) return;
    setSubmitting(true);
    setError('');

    try {
      await apiFetch(`/products/${selectedProduct.id}/stock`, {
        method: 'POST',
        body: JSON.stringify({
          warehouseId: stockForm.warehouseId,
          quantity: Number(stockForm.quantity),
          reorderLevel: Number(stockForm.reorderLevel)
        })
      });
      setShowStockModal(false);
      setSuccessMsg('Warehouse stock updated successfully!');
      fetchData();
    } catch (err) {
      setError(err.message || 'Failed to update warehouse stock');
    } finally {
      setSubmitting(false);
    }
  };

  // 6. Create Price List Handler
  const handleCreatePriceList = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      await apiFetch('/products/price-lists', {
        method: 'POST',
        body: JSON.stringify({
          name: priceListForm.name,
          customerTier: priceListForm.customerTier,
          currency: priceListForm.currency,
          productId: priceListForm.productId || undefined,
          overridePrice: Number(priceListForm.overridePrice),
          description: priceListForm.description
        })
      });
      setSuccessMsg(`Price List '${priceListForm.name}' created!`);
      setShowPriceListModal(false);
      setPriceListForm({ name: '', customerTier: 'GOLD', currency: 'INR', productId: '', overridePrice: 0, description: '' });
      fetchData();
    } catch (err) {
      setError(err.message || 'Failed to create price list');
    } finally {
      setSubmitting(false);
    }
  };

  const resetProductForm = () => {
    setProductForm({
      sku: '',
      name: '',
      description: '',
      category: categories.length > 0 ? categories[0].name : 'Hardware',
      basePrice: 0,
      costPrice: 0,
      unit: 'PCS',
      tax: 18,
      currency: 'INR',
      productType: 'PHYSICAL',
      billingType: 'ONE_TIME',
      status: 'ACTIVE',
      subscriptionPlanId: subscriptionPlans.length > 0 ? subscriptionPlans[0].id : '',
      variants: [],
      stocks: []
    });
  };

  const openEditModal = (p) => {
    setSelectedProduct(p);
    setProductForm({
      sku: p.sku || '',
      name: p.name || '',
      description: p.description || '',
      category: p.category || 'Hardware',
      basePrice: p.basePrice || 0,
      costPrice: p.costPrice || 0,
      unit: p.unit || 'PCS',
      tax: p.tax || 0,
      currency: p.currency || 'INR',
      productType: p.productType || 'PHYSICAL',
      billingType: p.billingType || 'ONE_TIME',
      status: p.status || 'ACTIVE',
      subscriptionPlanId: p.subscriptionPlanId || '',
      variants: p.variants || [],
      stocks: []
    });
    setShowEditModal(true);
  };

  const openDetailModal = async (p) => {
    try {
      const detail = await apiFetch(`/products/${p.id}`);
      setSelectedProduct(detail);
      setShowDetailModal(true);
    } catch (e) {
      setSelectedProduct(p);
      setShowDetailModal(true);
    }
  };

  const openVariantModal = (p) => {
    setSelectedProduct(p);
    setShowVariantModal(true);
  };

  const openStockModal = (p) => {
    setSelectedProduct(p);
    const firstWh = warehouses.length > 0 ? warehouses[0].id : '';
    const existingStock = p.warehouseStock?.find((s) => s.warehouseId === firstWh);
    setStockForm({
      warehouseId: firstWh,
      quantity: existingStock ? existingStock.quantity : 0,
      reorderLevel: existingStock ? existingStock.reorderLevel : 10
    });
    setShowStockModal(true);
  };

  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', backgroundColor: '#f8fafc', minHeight: '100vh' }}>
      
      {/* HEADER BAR */}
      <header className="card card-glass" style={{ padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '12px', backgroundColor: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #bfdbfe' }}>
            <Package size={26} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: '800', color: '#0f172a', letterSpacing: '-0.02em' }}>Product Management & Master Catalog</h1>
            <p style={{ fontSize: '0.825rem', color: '#475569' }}>
              Configure product catalog, categories, variants, price lists, and multi-warehouse inventory.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {canModifyProducts && (
            <button onClick={() => { resetProductForm(); setShowAddModal(true); }} className="btn btn-primary btn-sm">
              <Plus size={16} />
              <span>Add Product</span>
            </button>
          )}

          {canModifyProducts && (
            <button onClick={() => setShowPriceListModal(true)} className="btn btn-outline btn-sm">
              <Tag size={16} />
              <span>New Price List</span>
            </button>
          )}

          <button onClick={fetchData} className="btn btn-outline btn-sm" title="Refresh Catalog">
            <RefreshCw size={14} />
          </button>
        </div>
      </header>

      {/* NOTIFICATIONS */}
      {error && (
        <div className="badge-red" style={{ padding: '0.85rem 1.25rem', borderRadius: '8px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="badge-green" style={{ padding: '0.85rem 1.25rem', borderRadius: '8px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <CheckCircle size={16} />
          <span>{successMsg}</span>
        </div>
      )}

      {/* NAVIGATION TABS */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.5rem' }}>
        <button
          onClick={() => setActiveTab('products')}
          className={`btn btn-sm ${activeTab === 'products' ? 'btn-primary' : 'btn-outline'}`}
          style={{ borderRadius: '8px' }}
        >
          <Package size={15} />
          <span>Product Catalog ({products.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('price-lists')}
          className={`btn btn-sm ${activeTab === 'price-lists' ? 'btn-primary' : 'btn-outline'}`}
          style={{ borderRadius: '8px' }}
        >
          <Tag size={15} />
          <span>Price Lists ({priceLists.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('stock')}
          className={`btn btn-sm ${activeTab === 'stock' ? 'btn-primary' : 'btn-outline'}`}
          style={{ borderRadius: '8px' }}
        >
          <Boxes size={15} />
          <span>Warehouse Stock Levels</span>
        </button>
      </div>

      {/* ==================================================================== */}
      {/* TAB 1: PRODUCT CATALOG */}
      {/* ==================================================================== */}
      {activeTab === 'products' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* SEARCH & FILTERS */}
          <form onSubmit={handleSearchSubmit} className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', padding: '1rem' }}>
            <div style={{ flex: 1, minWidth: '240px', position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
              <input
                type="text"
                className="form-input"
                placeholder="Search by product name, SKU, category..."
                style={{ paddingLeft: '36px' }}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: '600' }}>Category:</span>
              <select className="form-select" style={{ width: '160px' }} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                <option value="ALL">All Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: '600' }}>Billing:</span>
              <select className="form-select" style={{ width: '150px' }} value={billingFilter} onChange={(e) => setBillingFilter(e.target.value)}>
                <option value="ALL">All Billing</option>
                <option value="ONE_TIME">One-Time</option>
                <option value="RECURRING">Recurring</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: '600' }}>Status:</span>
              <select className="form-select" style={{ width: '130px' }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="ALL">All Status</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </div>
          </form>

          {/* PRODUCTS TABLE */}
          <div className="card">
            {loading ? (
              <div className="empty-state"><span className="spinner" /><p style={{ marginTop: '0.5rem' }}>Loading product catalog...</p></div>
            ) : products.length === 0 ? (
              <div className="empty-state">
                <Package size={42} style={{ color: '#94a3b8' }} />
                <h4 style={{ color: '#0f172a', marginTop: '0.75rem' }}>No Products Found</h4>
                <p style={{ color: '#64748b', fontSize: '0.85rem' }}>No products match your active search or filter criteria.</p>
              </div>
            ) : (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Product & SKU</th>
                      <th>Category</th>
                      <th>Selling Price</th>
                      <th>Cost & Margin</th>
                      <th>Billing Type</th>
                      <th>Warehouse Stock</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p) => {
                      const avail = p.stockSummary?.totalAvailable ?? 0;
                      const marginPct = p.marginPercent || (p.basePrice > 0 ? Number((((p.basePrice - (p.costPrice || 0)) / p.basePrice) * 100).toFixed(1)) : 0);

                      return (
                        <tr key={p.id}>
                          <td>
                            <div style={{ fontWeight: '700', color: '#0f172a', fontSize: '0.9rem' }}>{p.name}</div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b', fontFamily: 'monospace' }}>SKU: {p.sku}</div>
                          </td>

                          <td>
                            <span className="badge badge-purple">{p.category || 'Hardware'}</span>
                          </td>

                          <td>
                            <div style={{ fontWeight: '700', color: '#059669' }}>
                              {p.currency === 'INR' ? '₹' : '$'}{(p.basePrice || 0).toLocaleString()}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Unit: {p.unit || 'PCS'} | Tax: {p.tax || 0}%</div>
                          </td>

                          <td>
                            <div style={{ fontSize: '0.8rem', color: '#475569' }}>Cost: {p.currency === 'INR' ? '₹' : '$'}{(p.costPrice || 0).toLocaleString()}</div>
                            <span className="badge badge-blue" style={{ fontSize: '0.7rem' }}>Margin: {marginPct}%</span>
                          </td>

                          <td>
                            <span className={`badge ${p.billingType === 'RECURRING' ? 'badge-purple' : 'badge-amber'}`}>
                              {p.billingType === 'RECURRING' ? 'RECURRING' : 'ONE_TIME'}
                            </span>
                            {p.subscriptionPlan && (
                              <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.2rem' }}>
                                Plan: {p.subscriptionPlan.billingCycle}
                              </div>
                            )}
                          </td>

                          <td>
                            <div>
                              <strong style={{ color: avail > 0 ? '#059669' : '#dc2626' }}>{avail} Available</strong>
                            </div>
                            <div style={{ fontSize: '0.7rem', color: '#64748b' }}>On Hand: {p.stockSummary?.totalOnHand || 0}</div>
                          </td>

                          <td>
                            <span className={`badge ${p.status === 'ACTIVE' ? 'badge-green' : 'badge-red'}`}>
                              {p.status || 'ACTIVE'}
                            </span>
                          </td>

                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: '0.35rem' }}>
                              <button onClick={() => openDetailModal(p)} className="btn btn-outline btn-xs" title="View Details">
                                <Eye size={13} />
                              </button>

                              {canModifyProducts && (
                                <button onClick={() => openEditModal(p)} className="btn btn-outline btn-xs" title="Edit Master Data">
                                  <Edit size={13} />
                                </button>
                              )}

                              {canModifyProducts && (
                                <button onClick={() => openVariantModal(p)} className="btn btn-outline btn-xs" title="Manage Variants">
                                  <Sliders size={13} />
                                </button>
                              )}

                              {canModifyStock && (
                                <button onClick={() => openStockModal(p)} className="btn btn-outline btn-xs" title="Update Stock">
                                  <Boxes size={13} />
                                </button>
                              )}

                              {canModifyProducts && (
                                <button onClick={() => handleDeleteProduct(p.id, p.name)} className="btn btn-outline btn-xs" style={{ color: '#dc2626' }} title="Delete">
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 2: PRICE LIST MANAGEMENT */}
      {/* ==================================================================== */}
      {activeTab === 'price-lists' && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#0f172a' }}>Tier & Currency Price Lists</h3>
              <p style={{ fontSize: '0.8rem', color: '#475569' }}>Customer tier override prices (e.g. Gold Tier special rates in INR/USD)</p>
            </div>
            {canModifyProducts && (
              <button onClick={() => setShowPriceListModal(true)} className="btn btn-primary btn-sm">
                <Plus size={14} />
                <span>Create Price List</span>
              </button>
            )}
          </div>

          {priceLists.length === 0 ? (
            <div className="empty-state"><Tag size={36} style={{ color: '#64748b' }} /><p style={{ color: '#475569', marginTop: '0.5rem' }}>No price lists configured yet.</p></div>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Price List Name</th>
                    <th>Customer Tier</th>
                    <th>Product</th>
                    <th>Currency</th>
                    <th>Override Price</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {priceLists.map((pl) => (
                    <tr key={pl.id}>
                      <td style={{ fontWeight: '700', color: '#0f172a' }}>{pl.name}</td>
                      <td><span className="badge badge-purple">{pl.customerTier || 'ALL TIERS'}</span></td>
                      <td>{pl.product?.name || 'Multi-Product'}</td>
                      <td><span className="badge badge-blue">{pl.currency}</span></td>
                      <td style={{ fontWeight: '700', color: '#059669' }}>
                        {pl.overridePrice !== null ? `${pl.currency === 'INR' ? '₹' : '$'}${pl.overridePrice}` : 'Dynamic'}
                      </td>
                      <td><span className={`badge ${pl.isActive ? 'badge-green' : 'badge-amber'}`}>{pl.isActive ? 'ACTIVE' : 'INACTIVE'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 3: WAREHOUSE STOCK LEVELS */}
      {/* ==================================================================== */}
      {activeTab === 'stock' && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#0f172a' }}>Multi-Warehouse Inventory Ledger</h3>
              <p style={{ fontSize: '0.8rem', color: '#475569' }}>On-hand, reserved, and available stock levels per warehouse location</p>
            </div>
          </div>

          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Warehouse</th>
                  <th>On Hand Qty</th>
                  <th>Reserved Qty</th>
                  <th>Available Qty</th>
                  <th>Reorder Level</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {products.flatMap((p) =>
                  (p.warehouseStock || []).map((ws) => {
                    const avail = Math.max(0, ws.quantity - ws.reservedQty);
                    const isLow = avail <= ws.reorderLevel;

                    return (
                      <tr key={`${p.id}-${ws.warehouseId}`}>
                        <td style={{ fontWeight: '700', color: '#0f172a' }}>{p.name} <span style={{ fontSize: '0.75rem', color: '#64748b' }}>({p.sku})</span></td>
                        <td><span className="badge badge-purple">{ws.warehouse?.name || ws.warehouseId}</span></td>
                        <td><strong>{ws.quantity}</strong></td>
                        <td style={{ color: '#d97706' }}>{ws.reservedQty}</td>
                        <td>
                          <strong style={{ color: avail > 0 ? '#059669' : '#dc2626' }}>{avail}</strong>
                          {isLow && <span className="badge badge-red" style={{ marginLeft: '0.5rem', fontSize: '0.65rem' }}>LOW STOCK</span>}
                        </td>
                        <td>{ws.reorderLevel}</td>
                        <td>
                          {canModifyStock && (
                            <button
                              onClick={() => {
                                setSelectedProduct(p);
                                setStockForm({ warehouseId: ws.warehouseId, quantity: ws.quantity, reorderLevel: ws.reorderLevel });
                                setShowStockModal(true);
                              }}
                              className="btn btn-outline btn-xs"
                            >
                              Edit Stock
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 1: ADD PRODUCT */}
      {/* ==================================================================== */}
      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div className="card animate-fade-in" style={{ width: '100%', maxWidth: '680px', maxHeight: '90vh', overflowY: 'auto', padding: '1.75rem', backgroundColor: '#ffffff' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.85rem', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '800', color: '#0f172a' }}>Add New Product to Master Catalog</h3>
              <button onClick={() => setShowAddModal(false)} className="btn btn-outline btn-xs"><X size={16} /></button>
            </div>

            <form onSubmit={handleCreateProduct} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              
              {/* SECTION 1: BASIC INFORMATION */}
              <div style={{ backgroundColor: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: '700', color: '#0f172a', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>1. Basic Information</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                  <div className="form-group">
                    <label className="form-label">Product Name *</label>
                    <input type="text" className="form-input" placeholder="e.g. MacBook Pro" value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} required />
                  </div>

                  <div className="form-group">
                    <label className="form-label">SKU (Stock Keeping Unit)</label>
                    <input type="text" className="form-input" placeholder="Auto-generated if empty" value={productForm.sku} onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })} />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Category *</label>
                    <select className="form-select" value={productForm.category} onChange={(e) => setProductForm({ ...productForm, category: e.target.value })} required>
                      {categories.map((c) => (
                        <option key={c.id} value={c.name}>{c.name}</option>
                      ))}
                      <option value="Hardware">Hardware</option>
                      <option value="Software">Software</option>
                      <option value="Services">Services</option>
                      <option value="Subscription">Subscription</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Unit of Measure</label>
                    <input type="text" className="form-input" placeholder="e.g. PCS, HOURS, LICENSE" value={productForm.unit} onChange={(e) => setProductForm({ ...productForm, unit: e.target.value })} />
                  </div>
                </div>

                <div className="form-group" style={{ marginTop: '0.85rem' }}>
                  <label className="form-label">Product Description</label>
                  <textarea className="form-input" rows="2" placeholder="Brief technical or commercial specification..." value={productForm.description} onChange={(e) => setProductForm({ ...productForm, description: e.target.value })} />
                </div>
              </div>

              {/* SECTION 2: PRICING & MARGIN */}
              <div style={{ backgroundColor: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: '700', color: '#0f172a', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>2. Pricing & Cost Structure</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.85rem' }}>
                  <div className="form-group">
                    <label className="form-label">Selling Price *</label>
                    <input type="number" className="form-input" min="0" step="0.01" value={productForm.basePrice} onChange={(e) => setProductForm({ ...productForm, basePrice: parseFloat(e.target.value) || 0 })} required />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Cost Price *</label>
                    <input type="number" className="form-input" min="0" step="0.01" value={productForm.costPrice} onChange={(e) => setProductForm({ ...productForm, costPrice: parseFloat(e.target.value) || 0 })} required />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Currency</label>
                    <select className="form-select" value={productForm.currency} onChange={(e) => setProductForm({ ...productForm, currency: e.target.value })}>
                      <option value="INR">INR (₹)</option>
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                    </select>
                  </div>
                </div>

                <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#059669', fontWeight: '600' }}>
                  Calculated Margin: {productForm.basePrice > 0 ? (((productForm.basePrice - productForm.costPrice) / productForm.basePrice) * 100).toFixed(2) : 0}%
                </div>
              </div>

              {/* SECTION 3: BILLING & SUBSCRIPTION */}
              <div style={{ backgroundColor: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: '700', color: '#0f172a', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>3. Billing & Subscription Configuration</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                  <div className="form-group">
                    <label className="form-label">Billing Type *</label>
                    <select className="form-select" value={productForm.billingType} onChange={(e) => setProductForm({ ...productForm, billingType: e.target.value })}>
                      <option value="ONE_TIME">ONE_TIME (Fulfillment Order)</option>
                      <option value="RECURRING">RECURRING (Subscription Schedule)</option>
                    </select>
                  </div>

                  {productForm.billingType === 'RECURRING' && (
                    <div className="form-group">
                      <label className="form-label">Associated Subscription Plan *</label>
                      <select className="form-select" value={productForm.subscriptionPlanId} onChange={(e) => setProductForm({ ...productForm, subscriptionPlanId: e.target.value })}>
                        <option value="">Auto-Create Monthly Plan</option>
                        {subscriptionPlans.map((sp) => (
                          <option key={sp.id} value={sp.id}>{sp.name} ({sp.billingCycle})</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>

              {/* SECTION 4: STATUS */}
              <div className="form-group">
                <label className="form-label">Product Master Status</label>
                <select className="form-select" value={productForm.status} onChange={(e) => setProductForm({ ...productForm, status: e.target.value })}>
                  <option value="ACTIVE">ACTIVE (Selectable in Quotations)</option>
                  <option value="INACTIVE">INACTIVE (Hidden from new Quotations)</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
                <button type="button" onClick={() => setShowAddModal(false)} className="btn btn-outline btn-sm">Cancel</button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={submitting}>
                  {submitting ? <span className="spinner" /> : <><span>Create Product</span><Check size={16} /></>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 2: EDIT PRODUCT */}
      {/* ==================================================================== */}
      {showEditModal && selectedProduct && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div className="card animate-fade-in" style={{ width: '100%', maxWidth: '680px', maxHeight: '90vh', overflowY: 'auto', padding: '1.75rem', backgroundColor: '#ffffff' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.85rem', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '800', color: '#0f172a' }}>Edit Product: {selectedProduct.name}</h3>
              <button onClick={() => setShowEditModal(false)} className="btn btn-outline btn-xs"><X size={16} /></button>
            </div>

            <form onSubmit={handleUpdateProduct} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                <div className="form-group">
                  <label className="form-label">Product Name</label>
                  <input type="text" className="form-input" value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label className="form-label">SKU</label>
                  <input type="text" className="form-input" value={productForm.sku} onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Category</label>
                  <select className="form-select" value={productForm.category} onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}>
                    {categories.map((c) => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                    <option value="Hardware">Hardware</option>
                    <option value="Software">Software</option>
                    <option value="Services">Services</option>
                    <option value="Subscription">Subscription</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Selling Price</label>
                  <input type="number" className="form-input" min="0" step="0.01" value={productForm.basePrice} onChange={(e) => setProductForm({ ...productForm, basePrice: parseFloat(e.target.value) || 0 })} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Cost Price</label>
                  <input type="number" className="form-input" min="0" step="0.01" value={productForm.costPrice} onChange={(e) => setProductForm({ ...productForm, costPrice: parseFloat(e.target.value) || 0 })} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select className="form-select" value={productForm.status} onChange={(e) => setProductForm({ ...productForm, status: e.target.value })}>
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="INACTIVE">INACTIVE</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
                <button type="button" onClick={() => setShowEditModal(false)} className="btn btn-outline btn-sm">Cancel</button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={submitting}>
                  {submitting ? <span className="spinner" /> : <><span>Save Changes</span><Check size={16} /></>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 3: VARIANTS MANAGEMENT */}
      {/* ==================================================================== */}
      {showVariantModal && selectedProduct && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div className="card animate-fade-in" style={{ width: '100%', maxWidth: '600px', padding: '1.75rem', backgroundColor: '#ffffff' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.85rem', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '800', color: '#0f172a' }}>Variants: {selectedProduct.name}</h3>
              <button onClick={() => setShowVariantModal(false)} className="btn btn-outline btn-xs"><X size={16} /></button>
            </div>

            {/* ADD VARIANT FORM */}
            <form onSubmit={handleAddVariant} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '0.5rem', marginBottom: '1.25rem', alignItems: 'end' }}>
              <div>
                <label className="form-label">Attribute</label>
                <input type="text" className="form-input" placeholder="e.g. RAM, Storage" value={newVariant.attribute} onChange={(e) => setNewVariant({ ...newVariant, attribute: e.target.value })} required />
              </div>
              <div>
                <label className="form-label">Value</label>
                <input type="text" className="form-input" placeholder="e.g. 16 GB, 1TB SSD" value={newVariant.value} onChange={(e) => setNewVariant({ ...newVariant, value: e.target.value })} required />
              </div>
              <div>
                <label className="form-label">Extra Price</label>
                <input type="number" className="form-input" placeholder="10000" value={newVariant.extraPrice} onChange={(e) => setNewVariant({ ...newVariant, extraPrice: parseFloat(e.target.value) || 0 })} />
              </div>
              <button type="submit" className="btn btn-primary btn-sm" disabled={submitting}>
                <Plus size={14} /> Add
              </button>
            </form>

            {/* VARIANTS LIST */}
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Attribute</th>
                    <th>Value</th>
                    <th>Extra Price</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedProduct.variants || []).length === 0 ? (
                    <tr><td colSpan="4" style={{ textAlign: 'center', color: '#64748b' }}>No variants added yet.</td></tr>
                  ) : (
                    selectedProduct.variants.map((v) => (
                      <tr key={v.id}>
                        <td><strong>{v.attribute}</strong></td>
                        <td>{v.value}</td>
                        <td style={{ color: '#059669', fontWeight: '700' }}>+{selectedProduct.currency === 'INR' ? '₹' : '$'}{v.extraPrice}</td>
                        <td>
                          <button onClick={() => handleDeleteVariant(v.id)} className="btn btn-outline btn-xs" style={{ color: '#dc2626' }}>
                            <Trash2 size={12} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 4: WAREHOUSE STOCK LEVEL */}
      {/* ==================================================================== */}
      {showStockModal && selectedProduct && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div className="card animate-fade-in" style={{ width: '100%', maxWidth: '480px', padding: '1.75rem', backgroundColor: '#ffffff' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.85rem', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '800', color: '#0f172a' }}>Update Warehouse Stock: {selectedProduct.name}</h3>
              <button onClick={() => setShowStockModal(false)} className="btn btn-outline btn-xs"><X size={16} /></button>
            </div>

            <form onSubmit={handleUpdateStock} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Warehouse Location *</label>
                <select className="form-select" value={stockForm.warehouseId} onChange={(e) => setStockForm({ ...stockForm, warehouseId: e.target.value })} required>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">On Hand Quantity *</label>
                <input type="number" className="form-input" min="0" value={stockForm.quantity} onChange={(e) => setStockForm({ ...stockForm, quantity: parseInt(e.target.value) || 0 })} required />
              </div>

              <div className="form-group">
                <label className="form-label">Reorder Level Threshold</label>
                <input type="number" className="form-input" min="0" value={stockForm.reorderLevel} onChange={(e) => setStockForm({ ...stockForm, reorderLevel: parseInt(e.target.value) || 10 })} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
                <button type="button" onClick={() => setShowStockModal(false)} className="btn btn-outline btn-sm">Cancel</button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={submitting}>
                  {submitting ? <span className="spinner" /> : <><span>Save Stock</span><Check size={16} /></>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 5: NEW PRICE LIST */}
      {/* ==================================================================== */}
      {showPriceListModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div className="card animate-fade-in" style={{ width: '100%', maxWidth: '520px', padding: '1.75rem', backgroundColor: '#ffffff' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.85rem', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '800', color: '#0f172a' }}>Create Tier Price List</h3>
              <button onClick={() => setShowPriceListModal(false)} className="btn btn-outline btn-xs"><X size={16} /></button>
            </div>

            <form onSubmit={handleCreatePriceList} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Price List Name *</label>
                <input type="text" className="form-input" placeholder="e.g. Gold Tier India Special" value={priceListForm.name} onChange={(e) => setPriceListForm({ ...priceListForm, name: e.target.value })} required />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                <div className="form-group">
                  <label className="form-label">Customer Tier</label>
                  <select className="form-select" value={priceListForm.customerTier} onChange={(e) => setPriceListForm({ ...priceListForm, customerTier: e.target.value })}>
                    <option value="GOLD">GOLD</option>
                    <option value="SILVER">SILVER</option>
                    <option value="BRONZE">BRONZE</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Currency</label>
                  <select className="form-select" value={priceListForm.currency} onChange={(e) => setPriceListForm({ ...priceListForm, currency: e.target.value })}>
                    <option value="INR">INR (₹)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Target Product (Optional)</label>
                <select className="form-select" value={priceListForm.productId} onChange={(e) => setPriceListForm({ ...priceListForm, productId: e.target.value })}>
                  <option value="">-- Apply to Multi-Product --</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Override Price *</label>
                <input type="number" className="form-input" min="0" step="0.01" value={priceListForm.overridePrice} onChange={(e) => setPriceListForm({ ...priceListForm, overridePrice: parseFloat(e.target.value) || 0 })} required />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
                <button type="button" onClick={() => setShowPriceListModal(false)} className="btn btn-outline btn-sm">Cancel</button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={submitting}>
                  {submitting ? <span className="spinner" /> : <><span>Create Price List</span><Check size={16} /></>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 6: PRODUCT DETAIL DRAWER */}
      {/* ==================================================================== */}
      {showDetailModal && selectedProduct && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div className="card animate-fade-in" style={{ width: '100%', maxWidth: '640px', padding: '1.75rem', backgroundColor: '#ffffff' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.85rem', marginBottom: '1.25rem' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#0f172a' }}>{selectedProduct.name}</h3>
                <span style={{ fontSize: '0.8rem', color: '#64748b', fontFamily: 'monospace' }}>SKU: {selectedProduct.sku}</span>
              </div>
              <button onClick={() => setShowDetailModal(false)} className="btn btn-outline btn-xs"><X size={16} /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.9rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', backgroundColor: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div><strong>Category:</strong> <span className="badge badge-purple">{selectedProduct.category}</span></div>
                <div><strong>Selling Price:</strong> <strong style={{ color: '#059669' }}>{selectedProduct.currency === 'INR' ? '₹' : '$'}{(selectedProduct.basePrice || 0).toLocaleString()}</strong></div>
                <div><strong>Cost Price:</strong> {selectedProduct.currency === 'INR' ? '₹' : '$'}{(selectedProduct.costPrice || 0).toLocaleString()}</div>
                <div><strong>Margin:</strong> <span className="badge badge-blue">{selectedProduct.marginPercent || 0}%</span></div>
                <div><strong>Billing Type:</strong> <span className="badge badge-amber">{selectedProduct.billingType}</span></div>
                <div><strong>Status:</strong> <span className={`badge ${selectedProduct.status === 'ACTIVE' ? 'badge-green' : 'badge-red'}`}>{selectedProduct.status}</span></div>
              </div>

              <div>
                <h4 style={{ fontWeight: '700', color: '#0f172a', marginBottom: '0.35rem' }}>Description</h4>
                <p style={{ fontSize: '0.85rem', color: '#475569' }}>{selectedProduct.description || 'No detailed description specified.'}</p>
              </div>

              <div>
                <h4 style={{ fontWeight: '700', color: '#0f172a', marginBottom: '0.35rem' }}>Variants Configuration</h4>
                {(selectedProduct.variants || []).length === 0 ? (
                  <p style={{ fontSize: '0.85rem', color: '#64748b' }}>No variants defined.</p>
                ) : (
                  <ul style={{ paddingLeft: '1.25rem', margin: 0, fontSize: '0.85rem' }}>
                    {selectedProduct.variants.map((v) => (
                      <li key={v.id}>{v.attribute}: <strong>{v.value}</strong> (+{selectedProduct.currency === 'INR' ? '₹' : '$'}{v.extraPrice})</li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <h4 style={{ fontWeight: '700', color: '#0f172a', marginBottom: '0.35rem' }}>Stock Summary across Warehouses</h4>
                {(selectedProduct.warehouseStock || []).length === 0 ? (
                  <p style={{ fontSize: '0.85rem', color: '#64748b' }}>No warehouse stock recorded.</p>
                ) : (
                  <ul style={{ paddingLeft: '1.25rem', margin: 0, fontSize: '0.85rem' }}>
                    {selectedProduct.warehouseStock.map((ws) => (
                      <li key={ws.id}>{ws.warehouse?.name || ws.warehouseId}: <strong>{ws.quantity} on hand</strong> (Available: {Math.max(0, ws.quantity - ws.reservedQty)})</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
