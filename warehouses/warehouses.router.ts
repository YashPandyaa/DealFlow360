// warehouses/warehouses.router.ts
import { Router, Request, Response } from 'express';
import { warehousesService } from './warehouses.service';
import { authenticate, requireRole, AuthenticatedRequest } from '../auth/auth.middleware';
import { prisma } from '../shared/prisma';

export const warehousesRouter = Router();

const getParamString = (param: string | string[] | undefined): string => {
  if (Array.isArray(param)) return param[0] || '';
  return param || '';
};

// ============================================================================
// 1. Fulfillment & Split Endpoints
// ============================================================================

/**
 * GET /warehouses/orders
 * Customer order and fulfillment status tracking list.
 */
warehousesRouter.get('/orders', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user || !req.user.id || !req.user.role) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    let where: any = {};
    if (req.user.role === 'CUSTOMER') {
      where.OR = [{ customerId: req.user.id }, { userId: req.user.id }];
      where.status = { in: ['CONFIRMED', 'FULFILLED', 'PROCESSING', 'PARTIALLY_FULFILLED', 'READY_FOR_FULFILLMENT', 'APPROVED'] };
    } else {
      where.status = { in: ['CONFIRMED', 'FULFILLED', 'PROCESSING', 'PARTIALLY_FULFILLED', 'READY_FOR_FULFILLMENT', 'APPROVED'] };
    }

    const quotations = await prisma.quotation.findMany({
      where,
      include: {
        lines: { include: { product: true } },
        allocations: true
      },
      orderBy: { updatedAt: 'desc' }
    });

    const orders = quotations.map((q: any) => {
      const totalAllocated = q.allocations ? q.allocations.reduce((acc: number, a: any) => acc + (a.status === 'FULFILLED' ? a.quantity : 0), 0) : 0;
      const totalRequested = q.lines ? q.lines.reduce((acc: number, l: any) => acc + l.quantity, 0) : 0;

      let fulfillmentStatus = 'Processing';
      if (q.status === 'FULFILLED' || (totalRequested > 0 && totalAllocated >= totalRequested)) {
        fulfillmentStatus = 'Fulfilled';
      } else if (totalAllocated > 0 && totalAllocated < totalRequested) {
        fulfillmentStatus = 'Partially Fulfilled';
      } else if (q.status === 'CONFIRMED') {
        fulfillmentStatus = 'Confirmed';
      }

      return {
        id: q.id,
        orderNumber: q.quoteNumber,
        quoteNumber: q.quoteNumber,
        customerName: q.customerName || 'Customer',
        totalAmount: q.totalAmount,
        status: q.status,
        fulfillmentStatus,
        orderDate: q.createdAt,
        expectedDelivery: new Date(new Date(q.createdAt).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        itemsCount: q.lines.length
      };
    });

    res.status(200).json(orders);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /warehouses/fulfill/:quotationId
 * Executes fulfillment split across warehouses for quotation.
 */
warehousesRouter.post('/fulfill/:quotationId', async (req: Request, res: Response): Promise<void> => {
  try {
    const quotationId = getParamString(req.params.quotationId);
    if (!quotationId) {
      res.status(400).json({ error: 'quotationId is required' });
      return;
    }

    const result = await warehousesService.fulfillQuotation(quotationId);
    res.status(200).json(result);
  } catch (error: any) {
    if (error.message.includes('not found')) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(400).json({ error: error.message });
    }
  }
});

// Import FulfillmentService
import { fulfillmentService } from './fulfillment.service';

/**
 * POST /warehouses/orders/create
 * Creates a Sales Order from a confirmed quotation.
 */
warehousesRouter.post('/orders/create', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { quotationId } = req.body;
    if (!quotationId) {
      res.status(400).json({ error: 'quotationId is required' });
      return;
    }
    const salesOrder = await fulfillmentService.createSalesOrderFromQuotation(quotationId);
    res.status(201).json(salesOrder);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /warehouses/fulfillment/suggest/:salesOrderId
 * Calculates optimal multi-warehouse split.
 */
warehousesRouter.get('/fulfillment/suggest/:salesOrderId', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const salesOrderId = getParamString(req.params.salesOrderId);
    const split = await fulfillmentService.calculateOptimalFulfillmentSplit(salesOrderId);
    res.status(200).json(split);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /warehouses/fulfillment/accept
 * Accepts auto-suggested split.
 */
warehousesRouter.post('/fulfillment/accept', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { salesOrderId } = req.body;
    if (!salesOrderId) {
      res.status(400).json({ error: 'salesOrderId is required' });
      return;
    }
    const result = await fulfillmentService.executeFulfillmentAllocation(salesOrderId);
    res.status(200).json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /warehouses/fulfillment/manual-override
 * Manual warehouse allocation override for Finance & Operations.
 */
warehousesRouter.post(
  '/fulfillment/manual-override',
  authenticate,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const userRole = (req.user?.role || '').toUpperCase();
      if (['SALES_REP', 'REP', 'CUSTOMER'].includes(userRole)) {
        res.status(403).json({ error: "Forbidden: Users with role 'SALES_REP' / 'CUSTOMER' cannot perform manual warehouse overrides." });
        return;
      }

      const { salesOrderId, manualAllocations } = req.body;
      if (!salesOrderId) {
        res.status(400).json({ error: 'salesOrderId is required' });
        return;
      }
      if (!manualAllocations || !Array.isArray(manualAllocations)) {
        res.status(400).json({ error: 'manualAllocations array is required' });
        return;
      }

      const result = await fulfillmentService.executeFulfillmentAllocation(salesOrderId, manualAllocations);
      res.status(200).json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
);

/**
 * GET /warehouses/backorders
 * Lists all active backorders.
 */
warehousesRouter.get('/backorders', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const backorders = await fulfillmentService.getBackorders();
    res.status(200).json(backorders);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /warehouses/backorders/:id/consolidate
 * Consolidates remaining backorders when new stock arrives.
 */
warehousesRouter.post('/backorders/:id/consolidate', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userRole = (req.user?.role || '').toUpperCase();
    if (['SALES_REP', 'REP', 'CUSTOMER'].includes(userRole)) {
      res.status(403).json({ error: "Forbidden: Users with role 'SALES_REP' / 'CUSTOMER' cannot consolidate backorders." });
      return;
    }

    const backorderId = getParamString(req.params.id);
    const { warehouseId } = req.body || {};

    const result = await fulfillmentService.consolidateBackorder(backorderId, warehouseId);
    res.status(200).json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// ============================================================================
// 2. Warehouse & Inventory CRUD
// ============================================================================

/**
 * GET /warehouses
 * Lists all active warehouses with inventory stock counts.
 */
warehousesRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const warehouses = await warehousesService.getWarehouses();
    res.status(200).json(warehouses);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /warehouses/:id
 * Gets single warehouse by ID.
 */
warehousesRouter.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = getParamString(req.params.id);
    const warehouse = await warehousesService.getWarehouseById(id);
    res.status(200).json(warehouse);
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
});

/**
 * POST /warehouses
 * Creates a new warehouse (Admin only).
 */
warehousesRouter.post(
  '/',
  authenticate,
  requireRole(['ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { name, code, location, capacity, isActive } = req.body;
      if (!name || typeof name !== 'string' || !name.trim()) {
        res.status(400).json({ error: 'Warehouse name is required' });
        return;
      }
      if (!code || typeof code !== 'string' || !code.trim()) {
        res.status(400).json({ error: 'Warehouse code is required' });
        return;
      }
      if (capacity !== undefined && (isNaN(Number(capacity)) || Number(capacity) < 0)) {
        res.status(400).json({ error: 'Capacity must be a non-negative number' });
        return;
      }

      const warehouse = await warehousesService.createWarehouse({
        name: name.trim(),
        code: code.trim(),
        location,
        capacity: capacity !== undefined ? Number(capacity) : undefined,
        isActive
      });
      res.status(201).json(warehouse);
    } catch (error: any) {
      if (error.code === 'P2002' || error.message?.includes('already exists') || error.message?.includes('Unique constraint')) {
        res.status(409).json({ error: `Warehouse with code '${req.body.code}' already exists` });
      } else {
        res.status(400).json({ error: error.message });
      }
    }
  }
);

/**
 * POST /warehouses/:id/stock
 * Sets or updates stock quantity for a product in a warehouse.
 */
warehousesRouter.post(
  '/:id/stock',
  authenticate,
  requireRole(['ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const warehouseId = getParamString(req.params.id);
      const { productId, quantity } = req.body;

      if (!productId || typeof productId !== 'string' || !productId.trim()) {
        res.status(400).json({ error: 'productId is required' });
        return;
      }

      if (quantity === undefined || isNaN(Number(quantity)) || Number(quantity) < 0) {
        res.status(400).json({ error: 'Valid non-negative quantity is required' });
        return;
      }

      const stockRecord = await warehousesService.setStock(
        warehouseId,
        productId.trim(),
        Number(quantity)
      );

      res.status(200).json(stockRecord);
    } catch (error: any) {
      if (error.message.includes('not found')) {
        res.status(404).json({ error: error.message });
      } else {
        res.status(400).json({ error: error.message });
      }
    }
  }
);
