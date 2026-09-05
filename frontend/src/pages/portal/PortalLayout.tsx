import React from 'react';
import { Outlet } from 'react-router-dom';
import { Layers } from 'lucide-react';
import './Portal.css';

export const PortalLayout: React.FC = () => {
  return (
    <div className="portal-shell">
      <header className="portal-topbar">
        <div className="portal-brand">
          <Layers size={24} color="#4f46e5" />
          <span className="portal-brand-name">DealFlow360 Customer Portal</span>
        </div>
      </header>

      <main className="portal-main">
        <Outlet />
      </main>
      
      <footer className="portal-footer">
        <p>&copy; {new Date().getFullYear()} DealFlow360. All rights reserved.</p>
        <div className="portal-footer-links">
          <a href="#">Terms of Service</a>
          <a href="#">Privacy Policy</a>
          <a href="#">Contact Support</a>
        </div>
      </footer>
    </div>
  );
};

export default PortalLayout;
