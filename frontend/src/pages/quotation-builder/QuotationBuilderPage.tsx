import React from 'react';
import { FileSpreadsheet } from 'lucide-react';

export const QuotationBuilderPage: React.FC = () => {
  return (
    <div className="page-container">
      <div className="page-header">
        <div className="page-badge">
          <FileSpreadsheet size={16} />
          <span>Quotation Builder</span>
        </div>
        <h1 className="page-title">Quotation & Proposal Builder</h1>
        <p className="page-subtitle">
          Interactive line-item configuration, pricing tiers, discounts, and instant quote generation.
        </p>
      </div>

      <div className="placeholder-card">
        <div className="card-header">
          <h3>Quotation Workspace</h3>
          <span className="status-tag status-dev">Ready for CPQ Engine</span>
        </div>
        <p className="card-description">
          This route (<code>/quotation-builder</code>) is dedicated to generating custom quotes, calculations, and PDF export workflows.
        </p>
        <div className="details-grid">
          <div className="detail-item">
            <span className="detail-label">Route</span>
            <span className="detail-val">/quotation-builder</span>
          </div>
          <div className="detail-item">
            <span className="detail-label">Status</span>
            <span className="detail-val">Scaffolded Placeholder</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuotationBuilderPage;
