// src/index.ts
import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import { authRouter } from '../auth/auth.router';
import { subscriptionsRouter, orderInvoiceHandler } from '../subscriptions/subscriptions.router';
import { discountsRouter } from '../discounts/discounts.router';
import { upsellRouter } from '../upsell/upsell.router';
import { approvalsRouter } from '../approvals/approvals.router';

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
  app.listen(PORT, () => {
    console.log(`[Server] DealFlow360 backend listening on port ${PORT}`);
  });
}

export default app;
