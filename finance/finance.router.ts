// finance/finance.router.ts
import { Router, Request, Response } from 'express';
import { financeService } from './finance.service';
import { subscriptionsService } from '../subscriptions/subscriptions.service';
import { authenticate, AuthenticatedRequest } from '../auth/auth.middleware';

export const financeRouter = Router();

const getParamString = (param: string | string[] | undefined): string => {
  if (Array.isArray(param)) return param[0] || '';
  return param || '';
};

/**
 * Helper to enforce RBAC permissions for Finance operations.
 */
const requireFinanceRole = (req: AuthenticatedRequest, res: Response): boolean => {
  const role = (req.user?.role || '').toUpperCase();
  if (['SALES_REP', 'REP', 'CUSTOMER'].includes(role)) {
    res.status(403).json({ error: `Forbidden: Users with role '${req.user?.role}' are not authorized to perform finance mutations.` });
    return false;
  }
  return true;
};

/**
 * 1. GET /finance/dashboard
 * Finance & Operations KPIs and itemized transaction ledgers.
 */
financeRouter.get('/dashboard', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { startDate, endDate, status, customerId } = req.query;
    const metrics = await financeService.getFinanceDashboardMetrics({
      startDate: startDate ? String(startDate) : undefined,
      endDate: endDate ? String(endDate) : undefined,
      status: status ? String(status) : undefined,
      customerId: customerId ? String(customerId) : undefined
    });
    res.status(200).json(metrics);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 2. POST /finance/invoices/generate
 * Generates invoice for a confirmed order or quotation.
 */
financeRouter.post('/invoices/generate', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { salesOrderId, quotationId } = req.body;
    const targetId = salesOrderId || quotationId;

    if (!targetId) {
      res.status(400).json({ error: 'salesOrderId or quotationId is required' });
      return;
    }

    const invoice = await financeService.generateInvoiceForOrder(targetId);
    res.status(201).json(invoice);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * 3. GET /finance/invoices
 * Lists invoices.
 */
financeRouter.get('/invoices', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userRole = (req.user?.role || '').toUpperCase();
    const customerId = userRole === 'CUSTOMER' ? req.user?.id : undefined;

    const metrics = await financeService.getFinanceDashboardMetrics({ customerId });
    res.status(200).json(metrics.invoices);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 4. POST /finance/invoices/:id/payments
 * Records a payment against an invoice.
 */
financeRouter.post('/invoices/:id/payments', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!requireFinanceRole(req, res)) return;

    const invoiceId = getParamString(req.params.id);
    const { amount, paymentMethod, reference } = req.body;

    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      res.status(400).json({ error: 'Valid positive payment amount is required' });
      return;
    }

    const result = await financeService.recordPayment({
      invoiceId,
      amount: Number(amount),
      paymentMethod,
      reference
    });

    res.status(200).json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * 5. POST /finance/subscriptions/modify-quantity
 * Modifies subscription quantity with mid-cycle proration.
 */
financeRouter.post('/subscriptions/modify-quantity', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!requireFinanceRole(req, res)) return;

    const { subscriptionId, newQuantity, effectiveDate } = req.body;
    if (!subscriptionId || newQuantity === undefined) {
      res.status(400).json({ error: 'subscriptionId and newQuantity are required' });
      return;
    }

    const result = await subscriptionsService.updateQuantity(subscriptionId, Number(newQuantity), effectiveDate);
    res.status(200).json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * 6. POST /finance/subscriptions/cancel
 * Cancels a subscription and calculates unused credit.
 */
financeRouter.post('/subscriptions/cancel', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!requireFinanceRole(req, res)) return;

    const { subscriptionId, effectiveDate, reason } = req.body;
    if (!subscriptionId) {
      res.status(400).json({ error: 'subscriptionId is required' });
      return;
    }

    const result = await subscriptionsService.cancelSubscription(subscriptionId, effectiveDate, reason);
    res.status(200).json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * 7. GET /finance/credit-notes
 * Lists all credit notes.
 */
financeRouter.get('/credit-notes', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userRole = (req.user?.role || '').toUpperCase();
    const customerId = userRole === 'CUSTOMER' ? req.user?.id : undefined;

    const metrics = await financeService.getFinanceDashboardMetrics({ customerId });
    res.status(200).json(metrics.creditNotes);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 8. POST /finance/credit-notes
 * Creates a credit note for invoice or subscription adjustments.
 */
financeRouter.post('/credit-notes', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!requireFinanceRole(req, res)) return;

    const { invoiceId, subscriptionId, salesOrderId, customerId, amount, taxAdjustment, reason } = req.body;

    const creditNote = await financeService.createCreditNote({
      invoiceId,
      subscriptionId,
      salesOrderId,
      customerId,
      amount: Number(amount),
      taxAdjustment: taxAdjustment ? Number(taxAdjustment) : 0,
      reason,
      createdBy: req.user?.name || req.user?.id
    });

    res.status(201).json(creditNote);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});
