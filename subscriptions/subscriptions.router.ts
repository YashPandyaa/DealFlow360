// subscriptions/subscriptions.router.ts
import { Router, Request, Response } from 'express';
import { subscriptionsService } from './subscriptions.service';
import { authenticate, requireRole, AuthenticatedRequest } from '../auth/auth.middleware';
import { prisma } from '../shared/prisma';

export const subscriptionsRouter = Router();

const getParamString = (param: string | string[] | undefined): string => {
  if (Array.isArray(param)) return param[0] || '';
  return param || '';
};

// ============================================================================
// 1. Subscription Plan Endpoints (CRUD)
// ============================================================================

/**
 * POST /subscriptions/plans
 * Creates a new subscription plan. ADMIN only.
 */
subscriptionsRouter.post(
  '/plans',
  authenticate,
  requireRole(['ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { name, billingCycle, productId, pricePerCycle } = req.body;
      if (!name || pricePerCycle === undefined) {
        res.status(400).json({ error: 'Name and pricePerCycle are required' });
        return;
      }

      const plan = await subscriptionsService.createPlan({
        name,
        billingCycle,
        productId,
        pricePerCycle: Number(pricePerCycle)
      });

      res.status(201).json(plan);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
);

/**
 * GET /subscriptions/plans
 * Lists all subscription plans.
 */
subscriptionsRouter.get('/plans', async (req: Request, res: Response): Promise<void> => {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const plans = await subscriptionsService.getPlans(includeInactive);
    res.status(200).json(plans);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /subscriptions/plans/:id
 * Fetches single subscription plan by ID.
 */
subscriptionsRouter.get('/plans/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = getParamString(req.params.id);
    const plan = await subscriptionsService.getPlanById(id);
    res.status(200).json(plan);
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
});

/**
 * PUT /subscriptions/plans/:id or PATCH /subscriptions/plans/:id
 * Updates an existing subscription plan. ADMIN only.
 */
const handleUpdatePlan = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = getParamString(req.params.id);
    const { name, billingCycle, productId, pricePerCycle, isActive } = req.body;
    const updatedPlan = await subscriptionsService.updatePlan(id, {
      name,
      billingCycle,
      productId,
      pricePerCycle: pricePerCycle !== undefined ? Number(pricePerCycle) : undefined,
      isActive
    });
    res.status(200).json(updatedPlan);
  } catch (error: any) {
    if (error.message?.includes('not found')) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(400).json({ error: error.message });
    }
  }
};

subscriptionsRouter.put('/plans/:id', authenticate, requireRole(['ADMIN']), handleUpdatePlan);
subscriptionsRouter.patch('/plans/:id', authenticate, requireRole(['ADMIN']), handleUpdatePlan);

/**
 * DELETE /subscriptions/plans/:id or PATCH /subscriptions/plans/:id/deactivate
 * Deactivates a subscription plan. ADMIN only.
 */
const handleDeactivatePlan = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = getParamString(req.params.id);
    const deactivatedPlan = await subscriptionsService.deactivatePlan(id);
    res.status(200).json({
      message: 'Plan deactivated successfully',
      plan: deactivatedPlan
    });
  } catch (error: any) {
    if (error.message?.includes('not found')) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(400).json({ error: error.message });
    }
  }
};

subscriptionsRouter.delete('/plans/:id', authenticate, requireRole(['ADMIN']), handleDeactivatePlan);
subscriptionsRouter.patch('/plans/:id/deactivate', authenticate, requireRole(['ADMIN']), handleDeactivatePlan);

// ============================================================================
// 2. Subscription Lifecycle Endpoints
// ============================================================================

/**
 * GET /subscriptions
 * Lists subscriptions with customer scoping.
 */
subscriptionsRouter.get('/', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user || !req.user.id || !req.user.role) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    let where: any = {};
    if (req.user.role === 'CUSTOMER') {
      const userQuotations = await prisma.quotation.findMany({
        where: { OR: [{ customerId: req.user.id }, { userId: req.user.id }] },
        select: { id: true }
      });
      const quotationIds = userQuotations.map((q) => q.id);
      where.quotationId = { in: quotationIds };
    }

    const subscriptions = await prisma.subscription.findMany({
      where,
      include: {
        plan: true,
        billingScheduleEntries: {
          orderBy: { billingDate: 'asc' }
        },
        creditNotes: true
      },
      orderBy: { createdAt: 'desc' }
    });

    res.status(200).json(subscriptions);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /subscriptions/invoices
 * Lists customer invoices.
 */
subscriptionsRouter.get('/invoices', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user || !req.user.id || !req.user.role) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    let quotations;
    if (req.user.role === 'CUSTOMER') {
      quotations = await prisma.quotation.findMany({
        where: { OR: [{ customerId: req.user.id }, { userId: req.user.id }] },
        orderBy: { createdAt: 'desc' }
      });
    } else {
      quotations = await prisma.quotation.findMany({
        orderBy: { createdAt: 'desc' }
      });
    }

    const invoices = await Promise.all(
      quotations.map(async (q) => {
        try {
          const inv = await subscriptionsService.getOrderInvoice(q.id);
          return {
            id: `INV-${q.quoteNumber || q.id.slice(0, 8)}`,
            invoiceNumber: `INV-${q.quoteNumber || q.id.slice(0, 8)}`,
            orderId: q.id,
            quoteNumber: q.quoteNumber,
            date: q.createdAt,
            dueDate: new Date(new Date(q.createdAt).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            amount: inv.combinedInvoiceTotal || q.totalAmount,
            status: q.status === 'CONFIRMED' || q.status === 'FULFILLED' ? 'PAID' : 'PENDING',
            customerName: q.customerName || 'Customer'
          };
        } catch {
          return null;
        }
      })
    );

    res.status(200).json(invoices.filter(Boolean));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /subscriptions
 * Creates a Subscription and generates first N (e.g. 12) BillingScheduleEntry rows.
 */
subscriptionsRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { quotationId, planId, quantity, startDate, cyclesToGenerate } = req.body;

    if (!planId || typeof planId !== 'string' || !planId.trim()) {
      res.status(400).json({ error: 'planId is required' });
      return;
    }

    if (quantity !== undefined && (isNaN(Number(quantity)) || Number(quantity) <= 0)) {
      res.status(400).json({ error: 'Quantity must be a positive number' });
      return;
    }

    const subscription = await subscriptionsService.createSubscription({
      quotationId,
      planId: planId.trim(),
      quantity: quantity !== undefined ? Number(quantity) : 1,
      startDate,
      cyclesToGenerate: cyclesToGenerate ? Number(cyclesToGenerate) : 12
    });

    res.status(201).json(subscription);
  } catch (error: any) {
    if (error.message?.includes('not found')) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(400).json({ error: error.message });
    }
  }
});

/**
 * GET /subscriptions/:id
 * Fetches subscription details by ID.
 */
subscriptionsRouter.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = getParamString(req.params.id);
    const subscription = await subscriptionsService.getOrderInvoice(id);
    res.status(200).json(subscription);
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
});

/**
 * PATCH /subscriptions/:id/quantity
 * Updates subscription quantity with proration.
 * Prorated amount = (newQuantity - oldQuantity) * pricePerUnit * (daysRemaining / totalDaysInCycle)
 */
subscriptionsRouter.patch('/:id/quantity', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = getParamString(req.params.id);
    const { newQuantity, effectiveDate } = req.body;

    if (newQuantity === undefined || isNaN(Number(newQuantity)) || Number(newQuantity) <= 0) {
      res.status(400).json({ error: 'Valid positive integer newQuantity is required' });
      return;
    }

    const result = await subscriptionsService.updateQuantity(
      id,
      Number(newQuantity),
      effectiveDate
    );

    res.status(200).json(result);
  } catch (error: any) {
    if (error.message?.includes('not found')) {
      res.status(404).json({ error: error.message });
    } else if (error.message?.includes('Cannot modify quantity of subscription with status')) {
      res.status(409).json({ error: error.message });
    } else {
      res.status(400).json({ error: error.message });
    }
  }
});

/**
 * POST /subscriptions/:id/cancel
 * Cancels subscription mid-cycle, issues CreditNote for unused days, voids future schedule.
 */
subscriptionsRouter.post('/:id/cancel', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = getParamString(req.params.id);
    const { effectiveDate, reason } = req.body;

    const result = await subscriptionsService.cancelSubscription(
      id,
      effectiveDate,
      reason
    );

    res.status(200).json(result);
  } catch (error: any) {
    if (error.message?.includes('not found')) {
      res.status(404).json({ error: error.message });
    } else if (error.message?.includes('already cancelled')) {
      res.status(409).json({ error: error.message });
    } else {
      res.status(400).json({ error: error.message });
    }
  }
});

// ============================================================================
// 5. Order / Quotation Hybrid Invoice Endpoint
// ============================================================================

/**
 * GET /subscriptions/orders/:orderId/invoice and GET /orders/:orderId/invoice
 */
export const orderInvoiceHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    const orderId = getParamString(req.params.orderId);
    if (!orderId) {
      res.status(400).json({ error: 'orderId is required' });
      return;
    }

    const invoice = await subscriptionsService.getOrderInvoice(orderId);
    res.status(200).json(invoice);
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
};

subscriptionsRouter.get('/orders/:orderId/invoice', orderInvoiceHandler);
