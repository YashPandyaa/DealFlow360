import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import AuthPage from './pages/auth/AuthPage';
import { AuthProvider } from './pages/auth/AuthContext';
import ProtectedRoute from './pages/auth/ProtectedRoute';
import WorkspacePage from './pages/workspace/WorkspacePage';
import { WorkspaceLayout, WorkspaceProvider } from './pages/workspace';
import PipelinePage from './pages/pipeline/PipelinePage';
import QuotationBuilderPage from './pages/quotation-builder/QuotationBuilderPage';
import ApprovalPage from './pages/approval/ApprovalPage';
import FulfillmentPage from './pages/fulfillment/FulfillmentPage';
import BillingPage from './pages/billing/BillingPage';
import DashboardPage from './pages/dashboard/DashboardPage';

// Portal Routes
import PortalLayout from './pages/portal/PortalLayout';
import PortalLoginPage from './pages/portal/PortalLoginPage';
import PortalQuotePage from './pages/portal/PortalQuotePage';

import './App.css';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* External Customer Portal (Completely decoupled from internal layouts) */}
          <Route path="/portal" element={<PortalLayout />}>
            <Route index element={<Navigate to="/portal/login" replace />} />
            <Route path="login" element={<PortalLoginPage />} />
            <Route path="quote/:id" element={<PortalQuotePage />} />
          </Route>

          {/* Internal CRM Routes */}
          <Route path="/" element={<AppLayout />}>
            <Route index element={<Navigate to="/pipeline" replace />} />
            
            {/* Public Auth Route */}
            <Route path="auth" element={<AuthPage />} />
            
            {/* Protected Routes */}
            <Route element={<ProtectedRoute />}>
              {/* Sales Workspace Layout Wrapper */}
              <Route
                element={
                  <WorkspaceProvider>
                    <WorkspaceLayout />
                  </WorkspaceProvider>
                }
              >
                <Route path="workspace" element={<WorkspacePage />} />
                <Route path="quotations" element={<Navigate to="/pipeline?view=list" replace />} />
                <Route path="pipeline" element={<PipelinePage />} />
                <Route path="quotation-builder" element={<QuotationBuilderPage />} />
                <Route path="quotation-builder/:id" element={<QuotationBuilderPage />} />
                <Route path="approval" element={<ApprovalPage />} />
                <Route path="dashboard" element={<DashboardPage />} />
              </Route>

              {/* Standalone Management / Backend Routes */}
              <Route path="fulfillment" element={<FulfillmentPage />} />
              <Route path="billing" element={<BillingPage />} />
            </Route>
            
            <Route path="*" element={<Navigate to="/pipeline" replace />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
