import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { 
  Lock, 
  LayoutDashboard, 
  GitPullRequest, 
  FileSpreadsheet, 
  CheckCircle2, 
  Layers,
  PackageCheck,
  CreditCard,
  Globe,
  BarChart3
} from 'lucide-react';

export const AppLayout: React.FC = () => {
  const navItems = [
    { to: '/workspace', label: 'Workspace', icon: LayoutDashboard },
    { to: '/dashboard', label: 'Dashboard', icon: BarChart3 },
    { to: '/pipeline', label: 'Pipeline', icon: GitPullRequest },
    { to: '/quotation-builder', label: 'Quotation Builder', icon: FileSpreadsheet },
    { to: '/approval', label: 'Approval', icon: CheckCircle2 },
    { to: '/fulfillment', label: 'Fulfillment', icon: PackageCheck },
    { to: '/billing', label: 'Billing', icon: CreditCard },
    { to: '/portal', label: 'Portal', icon: Globe },
    { to: '/auth', label: 'Auth', icon: Lock },
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <Layers size={22} color="#6366f1" />
          </div>
          <div className="brand-info">
            <span className="brand-name">DealFlow360</span>
            <span className="brand-tag">v0.1.0-dev</span>
          </div>
        </div>

        <nav className="nav-menu">
          <div className="nav-section-title">Navigation</div>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `nav-link ${isActive ? 'active' : ''}`
                }
              >
                <Icon size={18} className="nav-icon" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="system-pill">
            <span className="status-dot"></span>
            <span>Routing Skeleton Active</span>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            <span>DealFlow360</span>
            <span className="breadcrumb-separator">/</span>
            <span className="breadcrumb-current">Application</span>
          </div>
          <div className="topbar-actions">
            <span className="env-badge">Dev Scaffold</span>
          </div>
        </header>

        <div className="content-viewport">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default AppLayout;
