// src/index.ts
import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import { authRouter } from '../auth/auth.router';
import { subscriptionsRouter, orderInvoiceHandler } from '../subscriptions/subscriptions.router';
import { discountsRouter } from '../discounts/discounts.router';
import { upsellRouter } from '../upsell/upsell.router';
import { reportsRouter } from '../reports/reports.router';
import { approvalsRouter } from '../approvals/approvals.router';
import { productsRouter } from '../products/products.router';
import { warehousesRouter } from '../warehouses/warehouses.router';
import { quotationsRouter } from '../quotations/quotations.router';
import { adminRouter } from './admin/admin.router';
import { dashboardsRouter } from './dashboards/dashboards.router';
import { financeRouter } from '../finance/finance.router';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Auth Module Routes
app.use('/auth', authRouter);
app.use('/backend/auth', authRouter);

// Subscription Module Routes
app.use('/subscriptions', subscriptionsRouter);
app.use('/backend/subscriptions', subscriptionsRouter);

// Discount Governance Module Routes
app.use('/discounts', discountsRouter);
app.use('/backend/discounts', discountsRouter);

// Upsell & Cross-Sell Module Routes
app.use('/upsell', upsellRouter);
app.use('/backend/upsell', upsellRouter);

// Approval Engine Module Routes
app.use('/approvals', approvalsRouter);
app.use('/backend/approvals', approvalsRouter);

// Product Catalog Module Routes
app.use('/products', productsRouter);
app.use('/backend/products', productsRouter);

// Core Quotation Management Routes
app.use('/quotations', quotationsRouter);
app.use('/backend/quotations', quotationsRouter);

// Warehouse & Inventory Fulfillment Routes
app.use('/warehouses', warehousesRouter);
app.use('/backend/warehouses', warehousesRouter);

// Reporting & Deal Health Analytics Module Routes
app.use('/reports', reportsRouter);
app.use('/backend/reports', reportsRouter);

// Finance & Billing Module Routes
app.use('/finance', financeRouter);
app.use('/backend/finance', financeRouter);
app.use('/api/finance', financeRouter);

// Admin Analytics & Statistics Routes
app.use('/admin', adminRouter);
app.use('/backend/admin', adminRouter);
app.use('/api/admin', adminRouter);

// Dedicated Role-Based Dashboard Routes
app.use('/dashboards', dashboardsRouter);
app.use('/backend/dashboards', dashboardsRouter);
app.use('/api/dashboards', dashboardsRouter);

// Order / Quotation Invoice Route
app.get('/orders/:orderId/invoice', orderInvoiceHandler);
app.get('/backend/orders/:orderId/invoice', orderInvoiceHandler);

// Health Check Route
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`[Server] DealFlow360 backend listening on port ${PORT}`);
  });
}

export default app;
