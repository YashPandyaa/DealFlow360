import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useWorkspace } from '../../context/WorkspaceContext';
import { normalizeRole, getRoleDefaultRoute } from '../../utils/roles';
import {
  LayoutGrid,
  FileText,
  CheckSquare,
  Truck,
  CreditCard,
  BarChart3,
  Shield,
  MessageSquare,
  Users,
  Settings,
  ShoppingBag,
  PlusCircle,
  Clock,
  Layers,
  Package
} from 'lucide-react';

export default function RoleNavigation() {
  const { user } = useWorkspace();
  const navigate = useNavigate();
  const rawRole = user?.role || 'SALES_REP';
  const role = normalizeRole(rawRole);

  const defaultRoute = getRoleDefaultRoute(rawRole);

  // ADMIN LINKS
  if (role === 'ADMIN') {
    return (
      <nav style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
        <NavLink
          to="/admin/dashboard"
          className={({ isActive }) => `btn ${isActive ? 'btn-primary' : 'btn-outline'}`}
          style={{ padding: '0.45rem 0.85rem', fontSize: '0.825rem' }}
        >
          <BarChart3 size={16} />
          <span>Admin Dashboard</span>
        </NavLink>

        <NavLink
          to="/workspace/pipeline"
          className={({ isActive }) => `btn ${isActive ? 'btn-primary' : 'btn-outline'}`}
          style={{ padding: '0.45rem 0.85rem', fontSize: '0.825rem' }}
        >
          <LayoutGrid size={16} />
          <span>All Pipeline</span>
        </NavLink>

        <NavLink
          to="/workspace/approval"
          className={({ isActive }) => `btn ${isActive ? 'btn-primary' : 'btn-outline'}`}
          style={{ padding: '0.45rem 0.85rem', fontSize: '0.825rem' }}
        >
          <CheckSquare size={16} />
          <span>Approvals</span>
        </NavLink>

        <NavLink
          to="/workspace/fulfillment"
          className={({ isActive }) => `btn ${isActive ? 'btn-primary' : 'btn-outline'}`}
          style={{ padding: '0.45rem 0.85rem', fontSize: '0.825rem' }}
        >
          <Truck size={16} />
          <span>Fulfillment</span>
        </NavLink>

        <NavLink
          to="/workspace/billing"
          className={({ isActive }) => `btn ${isActive ? 'btn-primary' : 'btn-outline'}`}
          style={{ padding: '0.45rem 0.85rem', fontSize: '0.825rem' }}
        >
          <CreditCard size={16} />
          <span>Billing</span>
        </NavLink>

        <NavLink
          to="/workspace/products"
          className={({ isActive }) => `btn ${isActive ? 'btn-primary' : 'btn-outline'}`}
          style={{ padding: '0.45rem 0.85rem', fontSize: '0.825rem' }}
        >
          <Package size={16} />
          <span>Products</span>
        </NavLink>

        <NavLink
          to="/workspace/admin-dashboard"
          className={({ isActive }) => `btn ${isActive ? 'btn-primary' : 'btn-outline'}`}
          style={{ padding: '0.45rem 0.85rem', fontSize: '0.825rem', backgroundColor: '#faf5ff', color: '#7c3aed', borderColor: '#e9d5ff' }}
        >
          <Shield size={16} />
          <span>System Governance</span>
        </NavLink>
      </nav>
    );
  }

  // SALES MANAGER LINKS
  if (role === 'SALES_MANAGER' || role === 'MANAGER') {
    return (
      <nav style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
        <NavLink
          to="/manager/dashboard"
          className={({ isActive }) => `btn ${isActive ? 'btn-primary' : 'btn-outline'}`}
          style={{ padding: '0.45rem 0.85rem', fontSize: '0.825rem' }}
        >
          <BarChart3 size={16} />
          <span>Manager Dashboard</span>
        </NavLink>

        <NavLink
          to="/workspace/approval"
          className={({ isActive }) => `btn ${isActive ? 'btn-primary' : 'btn-outline'}`}
          style={{ padding: '0.45rem 0.85rem', fontSize: '0.825rem' }}
        >
          <CheckSquare size={16} />
          <span>Approval Queue</span>
        </NavLink>

        <NavLink
          to="/workspace/pipeline"
          className={({ isActive }) => `btn ${isActive ? 'btn-primary' : 'btn-outline'}`}
          style={{ padding: '0.45rem 0.85rem', fontSize: '0.825rem' }}
        >
          <LayoutGrid size={16} />
          <span>Team Pipeline</span>
        </NavLink>

        <NavLink
          to="/workspace/dashboard"
          className={({ isActive }) => `btn ${isActive ? 'btn-primary' : 'btn-outline'}`}
          style={{ padding: '0.45rem 0.85rem', fontSize: '0.825rem' }}
        >
          <Shield size={16} />
          <span>Risk Analytics</span>
        </NavLink>
      </nav>
    );
  }

  // FINANCE OPERATIONS LINKS
  if (role === 'FINANCE_OPERATIONS' || role === 'FINANCE') {
    return (
      <nav style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
        <NavLink
          to="/finance/dashboard"
          className={({ isActive }) => `btn ${isActive ? 'btn-primary' : 'btn-outline'}`}
          style={{ padding: '0.45rem 0.85rem', fontSize: '0.825rem' }}
        >
          <CreditCard size={16} />
          <span>Finance Dashboard</span>
        </NavLink>

        <NavLink
          to="/workspace/approval"
          className={({ isActive }) => `btn ${isActive ? 'btn-primary' : 'btn-outline'}`}
          style={{ padding: '0.45rem 0.85rem', fontSize: '0.825rem' }}
        >
          <Clock size={16} />
          <span>Finance Approvals</span>
        </NavLink>

        <NavLink
          to="/workspace/billing"
          className={({ isActive }) => `btn ${isActive ? 'btn-primary' : 'btn-outline'}`}
          style={{ padding: '0.45rem 0.85rem', fontSize: '0.825rem' }}
        >
          <FileText size={16} />
          <span>Invoices & Billing</span>
        </NavLink>

        <NavLink
          to="/workspace/fulfillment"
          className={({ isActive }) => `btn ${isActive ? 'btn-primary' : 'btn-outline'}`}
          style={{ padding: '0.45rem 0.85rem', fontSize: '0.825rem' }}
        >
          <Truck size={16} />
          <span>Fulfillment & Warehouses</span>
        </NavLink>
      </nav>
    );
  }

  // CUSTOMER PORTAL LINKS
  if (role === 'CUSTOMER') {
    return (
      <nav style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
        <NavLink
          to="/portal/dashboard"
          className={({ isActive }) => `btn ${isActive ? 'btn-primary' : 'btn-outline'}`}
          style={{ padding: '0.45rem 0.85rem', fontSize: '0.825rem' }}
        >
          <ShoppingBag size={16} />
          <span>Customer Dashboard</span>
        </NavLink>

        <NavLink
          to="/portal"
          className={({ isActive }) => `btn ${isActive ? 'btn-primary' : 'btn-outline'}`}
          style={{ padding: '0.45rem 0.85rem', fontSize: '0.825rem' }}
        >
          <FileText size={16} />
          <span>My Proposals & Bargaining</span>
        </NavLink>
      </nav>
    );
  }

  // DEFAULT: SALES_REP
  return (
    <nav style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
      <NavLink
        to="/sales/dashboard"
        className={({ isActive }) => `btn ${isActive ? 'btn-primary' : 'btn-outline'}`}
        style={{ padding: '0.45rem 0.85rem', fontSize: '0.825rem' }}
      >
        <BarChart3 size={16} />
        <span>Sales Dashboard</span>
      </NavLink>

      <NavLink
        to="/workspace/pipeline"
        className={({ isActive }) => `btn ${isActive ? 'btn-primary' : 'btn-outline'}`}
        style={{ padding: '0.45rem 0.85rem', fontSize: '0.825rem' }}
      >
        <LayoutGrid size={16} />
        <span>My Pipeline</span>
      </NavLink>

      <NavLink
        to="/workspace/quotation-builder"
        className={({ isActive }) => `btn ${isActive ? 'btn-primary' : 'btn-outline'}`}
        style={{ padding: '0.45rem 0.85rem', fontSize: '0.825rem' }}
      >
        <PlusCircle size={16} />
        <span>Quote Builder</span>
      </NavLink>

      <NavLink
        to="/workspace/products"
        className={({ isActive }) => `btn ${isActive ? 'btn-primary' : 'btn-outline'}`}
        style={{ padding: '0.45rem 0.85rem', fontSize: '0.825rem' }}
      >
        <Package size={16} />
        <span>Products</span>
      </NavLink>

      <NavLink
        to="/workspace/approval"
        className={({ isActive }) => `btn ${isActive ? 'btn-primary' : 'btn-outline'}`}
        style={{ padding: '0.45rem 0.85rem', fontSize: '0.825rem' }}
      >
        <CheckSquare size={16} />
        <span>Approvals</span>
      </NavLink>
    </nav>
  );
}
