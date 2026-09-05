import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import AuthPage from './pages/auth/AuthPage';
import WorkspacePage from './pages/workspace/WorkspacePage';
import PipelinePage from './pages/pipeline/PipelinePage';
import QuotationBuilderPage from './pages/quotation-builder/QuotationBuilderPage';
import ApprovalPage from './pages/approval/ApprovalPage';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<Navigate to="/workspace" replace />} />
          <Route path="auth" element={<AuthPage />} />
          <Route path="workspace" element={<WorkspacePage />} />
          <Route path="pipeline" element={<PipelinePage />} />
          <Route path="quotation-builder" element={<QuotationBuilderPage />} />
          <Route path="approval" element={<ApprovalPage />} />
          <Route path="*" element={<Navigate to="/workspace" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
