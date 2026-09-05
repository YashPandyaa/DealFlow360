import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { WorkspaceProvider, useWorkspace } from './context/WorkspaceContext';
import { normalizeRole, getRoleDefaultRoute } from './utils/roles';

import Login from './pages/auth/Login';
import Signup from './pages/auth/Signup';
import WorkspaceLayout from './pages/workspace/WorkspaceLayout';
import Pipeline from './pages/pipeline/Pipeline';
import QuotationBuilder from './pages/quotation-builder/QuotationBuilder';
import ApprovalScreen from './pages/approval/ApprovalScreen';
import FulfillmentScreen from './pages/fulfillment/FulfillmentScreen';
import BillingScreen from './pages/billing/BillingScreen';
import ProductManagementScreen from './pages/products/ProductManagementScreen';
import PortalScreen from './pages/portal/PortalScreen';
import DealHealthDashboard from './pages/dashboard/DealHealthDashboard';

import AdminRoleDashboard from './pages/dashboards/AdminRoleDashboard';
import ManagerRoleDashboard from './pages/dashboards/ManagerRoleDashboard';
import SalesRepRoleDashboard from './pages/dashboards/SalesRepRoleDashboard';
import FinanceRoleDashboard from './pages/dashboards/FinanceRoleDashboard';
import CustomerRoleDashboard from './pages/dashboards/CustomerRoleDashboard';

const ProtectedRoute = ({ children }) => {
  const { token, user } = useWorkspace();
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  const normRole = normalizeRole(user?.role);
  if (normRole === 'CUSTOMER') {
    return <Navigate to="/portal" replace />;
  }
  return children;
};

const DefaultRedirect = () => {
  const { token, user } = useWorkspace();
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  const dest = getRoleDefaultRoute(user?.role);
  return <Navigate to={dest} replace />;
};

export default function App() {
  return (
    <WorkspaceProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Auth Routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />

          {/* Standalone Customer Portal Route Tree */}
          <Route path="/portal/*" element={<PortalScreen />} />

          {/* Direct Role Dashboard Routes */}
          <Route
            path="/admin/dashboard"
            element={
              <ProtectedRoute>
                <WorkspaceLayout>
                  <AdminRoleDashboard />
                </WorkspaceLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/manager/dashboard"
            element={
              <ProtectedRoute>
                <WorkspaceLayout>
                  <ManagerRoleDashboard />
                </WorkspaceLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/sales/dashboard"
            element={
              <ProtectedRoute>
                <WorkspaceLayout>
                  <SalesRepRoleDashboard />
                </WorkspaceLayout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/finance/dashboard"
            element={
              <ProtectedRoute>
                <WorkspaceLayout>
                  <FinanceRoleDashboard />
                </WorkspaceLayout>
              </ProtectedRoute>
            }
          />

          {/* Protected Sales Workspace Nested Routes */}
          <Route
            path="/workspace"
            element={
              <ProtectedRoute>
                <WorkspaceLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<DefaultRedirect />} />
            <Route path="pipeline" element={<Pipeline />} />
            <Route path="quotation-builder" element={<QuotationBuilder />} />
            <Route path="quotation/new" element={<QuotationBuilder />} />
            <Route path="quotations/:id" element={<QuotationBuilder />} />
            <Route path="approval" element={<ApprovalScreen />} />
            <Route path="approvals/:id" element={<ApprovalScreen />} />
            <Route path="fulfillment" element={<FulfillmentScreen />} />
            <Route path="billing" element={<BillingScreen />} />
            <Route path="products" element={<ProductManagementScreen />} />
            <Route path="dashboard" element={<DealHealthDashboard />} />
            <Route path="admin-dashboard" element={<AdminRoleDashboard />} />
            <Route path="manager-dashboard" element={<ManagerRoleDashboard />} />
            <Route path="sales-dashboard" element={<SalesRepRoleDashboard />} />
            <Route path="finance-dashboard" element={<FinanceRoleDashboard />} />
          </Route>

          {/* Default Wildcard Catch-All Redirect */}
          <Route path="*" element={<DefaultRedirect />} />
        </Routes>
      </BrowserRouter>
    </WorkspaceProvider>
  );
}
