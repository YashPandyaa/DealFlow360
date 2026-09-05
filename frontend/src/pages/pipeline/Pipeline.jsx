import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../../context/WorkspaceContext';
import { apiFetch } from '../../utils/api';
import {
  LayoutGrid,
  List,
  Plus,
  Search,
  Filter,
  ArrowRight,
  Clock,
  User,
  DollarSign,
  AlertCircle,
  FileSpreadsheet
} from 'lucide-react';

export default function Pipeline() {
  const { setActiveQuotationId, reloadCounter } = useWorkspace();
  const navigate = useNavigate();

  const [quotations, setQuotations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('kanban'); // 'kanban' | 'list'
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const fetchQuotations = async () => {
    setLoading(true);
    setError('');
    try {
      let query = '';
      if (statusFilter !== 'ALL') {
        query += `?status=${statusFilter}`;
      }
      const data = await apiFetch(`/quotations${query}`);
      setQuotations(data || []);
    } catch (err) {
      setError(err.message || 'Failed to fetch quotations pipeline');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuotations();
  }, [statusFilter, reloadCounter]);

  const handleNewQuotation = async () => {
    setCreating(true);
    setError('');
    try {
      const data = await apiFetch('/quotations', {
        method: 'POST',
        body: JSON.stringify({ customerName: 'Acme Enterprises' })
      });

      const newId = data.id || data.quotationId;
      setActiveQuotationId(newId);
      navigate('/workspace/quotation-builder');
    } catch (err) {
      setError(err.message || 'Failed to create new quotation');
    } finally {
      setCreating(false);
    }
  };

  const handleOpenQuotation = (quotation) => {
    setActiveQuotationId(quotation.id);
    if (quotation.status === 'PENDING_APPROVAL') {
      navigate('/workspace/approval');
    } else {
      navigate('/workspace/quotation-builder');
    }
  };

  const filteredQuotations = quotations.filter((q) => {
    const term = search.toLowerCase();
    const matchSearch =
      !search ||
      (q.quoteNumber && q.quoteNumber.toLowerCase().includes(term)) ||
      (q.customerName && q.customerName.toLowerCase().includes(term)) ||
      (q.id && q.id.toLowerCase().includes(term));
    return matchSearch;
  });

  const stages = [
    { key: 'DRAFT', label: 'Draft Pipeline', badgeClass: 'badge-blue' },
    { key: 'PENDING_APPROVAL', label: 'Pending Approval', badgeClass: 'badge-amber' },
    { key: 'APPROVED', label: 'Approved & Ready', badgeClass: 'badge-green' },
    { key: 'FULFILLED', label: 'Fulfilled / Billing', badgeClass: 'badge-purple' },
    { key: 'REJECTED', label: 'Rejected / Returned', badgeClass: 'badge-red' }
  ];

  const getStatusBadge = (status) => {
    switch (status) {
      case 'DRAFT': return <span className="badge badge-blue">DRAFT</span>;
      case 'PENDING_APPROVAL': return <span className="badge badge-amber">PENDING APPROVAL</span>;
      case 'APPROVED':
      case 'CONFIRMED':
      case 'READY_FOR_FULFILLMENT': return <span className="badge badge-green">APPROVED</span>;
      case 'FULFILLED':
      case 'ALLOCATED': return <span className="badge badge-purple">FULFILLED</span>;
      case 'REJECTED':
      case 'RETURNED_FOR_REVISION': return <span className="badge badge-red">{status}</span>;
      default: return <span className="badge badge-blue">{status}</span>;
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Top Header Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#0f172a' }}>Quotation Pipeline</h1>
          <p style={{ color: '#475569', fontSize: '0.85rem' }}>Manage, build, and track deal stages</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {/* View Mode Toggle */}
          <div style={{ display: 'flex', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.2rem' }}>
            <button
              onClick={() => setViewMode('kanban')}
              className={`btn btn-sm ${viewMode === 'kanban' ? 'btn-primary' : 'btn-outline'}`}
              style={{ border: 'none' }}
            >
              <LayoutGrid size={15} />
              <span>Kanban</span>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`btn btn-sm ${viewMode === 'list' ? 'btn-primary' : 'btn-outline'}`}
              style={{ border: 'none' }}
            >
              <List size={15} />
              <span>List</span>
            </button>
          </div>

          <button onClick={handleNewQuotation} className="btn btn-primary" disabled={creating}>
            {creating ? <span className="spinner" /> : <><Plus size={18} /><span>New Quotation</span></>}
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', padding: '0.85rem 1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: '220px' }}>
          <Search size={18} color="#64748b" />
          <input
            type="text"
            className="form-input"
            placeholder="Search by quote number, customer name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Filter size={16} color="#64748b" />
          <select
            className="form-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ padding: '0.45rem 0.75rem' }}
          >
            <option value="ALL">All Statuses</option>
            <option value="DRAFT">DRAFT</option>
            <option value="PENDING_APPROVAL">PENDING APPROVAL</option>
            <option value="APPROVED">APPROVED</option>
            <option value="FULFILLED">FULFILLED</option>
            <option value="REJECTED">REJECTED</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="badge-red" style={{ padding: '0.75rem 1rem', borderRadius: '8px', fontSize: '0.85rem' }}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Main Content Area */}
      {loading ? (
        <div className="empty-state">
          <span className="spinner" style={{ width: '2rem', height: '2rem' }} />
          <p style={{ marginTop: '1rem' }}>Loading pipeline data...</p>
        </div>
      ) : filteredQuotations.length === 0 ? (
        <div className="card empty-state">
          <FileSpreadsheet size={42} />
          <h3 style={{ color: '#0f172a', fontSize: '1.1rem', marginTop: '0.5rem' }}>No Quotations Found</h3>
          <p style={{ color: '#475569', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Get started by creating a new deal quotation or clearing filters.
          </p>
          <button onClick={handleNewQuotation} className="btn btn-primary" style={{ marginTop: '1rem' }}>
            <Plus size={16} />
            <span>Create New Quotation</span>
          </button>
        </div>
      ) : viewMode === 'kanban' ? (
        /* KANBAN BOARD VIEW */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', alignItems: 'start' }}>
          {stages.map((stage) => {
            const stageQuotes = filteredQuotations.filter((q) => {
              if (stage.key === 'APPROVED') return ['APPROVED', 'CONFIRMED', 'READY_FOR_FULFILLMENT'].includes(q.status);
              if (stage.key === 'FULFILLED') return ['FULFILLED', 'ALLOCATED', 'PARTIALLY_ALLOCATED'].includes(q.status);
              if (stage.key === 'REJECTED') return ['REJECTED', 'RETURNED_FOR_REVISION'].includes(q.status);
              return q.status === stage.key;
            });

            return (
              <div
                key={stage.key}
                className="card"
                style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.85rem', minHeight: '380px' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: '600', color: '#0f172a' }}>{stage.label}</span>
                  <span className={stage.badgeClass} style={{ fontSize: '0.7rem' }}>{stageQuotes.length}</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {stageQuotes.map((q) => (
                    <div
                      key={q.id}
                      onClick={() => handleOpenQuotation(q)}
                      className="card animate-fade-in"
                      style={{
                        backgroundColor: '#ffffff',
                        border: '1px solid #e2e8f0',
                        cursor: 'pointer',
                        padding: '1rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.65rem',
                        boxShadow: '0 1px 3px 0 rgba(15, 23, 42, 0.05)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#2563eb' }}>
                          {q.quoteNumber || q.id.slice(0, 8)}
                        </span>
                        {getStatusBadge(q.status)}
                      </div>

                      <div style={{ fontSize: '0.9rem', fontWeight: '600', color: '#0f172a' }}>
                        {q.customerName || 'Acme Global'}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.8rem', color: '#475569', paddingTop: '0.4rem', borderTop: '1px dashed #e2e8f0' }}>
                        <span style={{ fontWeight: '700', color: '#059669', fontSize: '0.95rem' }}>
                          ${(q.totalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <Clock size={12} />
                          <span>{new Date(q.updatedAt || Date.now()).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* LIST / TABLE VIEW */
        <div className="table-container card" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Quote Number</th>
                <th>Customer</th>
                <th>Status</th>
                <th>Tier</th>
                <th>Total Amount</th>
                <th>Updated Date</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredQuotations.map((q) => (
                <tr key={q.id} style={{ cursor: 'pointer' }} onClick={() => handleOpenQuotation(q)}>
                  <td style={{ fontWeight: '700', color: '#2563eb' }}>{q.quoteNumber || q.id}</td>
                  <td style={{ fontWeight: '500', color: '#0f172a' }}>{q.customerName || 'Acme Global'}</td>
                  <td>{getStatusBadge(q.status)}</td>
                  <td>
                    <span className="badge badge-purple">{q.customerTier || 'GOLD'}</span>
                  </td>
                  <td style={{ fontWeight: '700', color: '#059669' }}>
                    ${(q.totalAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ color: '#475569', fontSize: '0.8rem' }}>
                    {new Date(q.updatedAt || Date.now()).toLocaleString()}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn btn-secondary btn-sm">
                      <span>Open Builder</span>
                      <ArrowRight size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
