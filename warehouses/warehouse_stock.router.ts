// warehouses/warehouse_stock.router.ts
import { Router, Request, Response } from 'express';
import { inventoryService } from './inventory.service';
import { authenticate, requireRole, AuthenticatedRequest } from '../auth/auth.middleware';

export const warehouseStockRouter = Router();

const getParamString = (param: string | string[] | undefined): string => {
  if (Array.isArray(param)) return param[0] || '';
  return param || '';
};

// Internal authorized roles for stock management
const AUTHORIZED_STOCK_ROLES = ['ADMIN', 'FINANCE_OPERATIONS', 'FINANCE', 'OPERATIONS', 'OPS'];

// ============================================================================
// 1. GET /warehouse-stock/summary & POST /warehouse-stock/replenish-all
// ============================================================================
warehouseStockRouter.get('/summary', authenticate, async (_req: Request, res: Response): Promise<void> => {
  try {
    const summary = await inventoryService.getInventorySummary();
    res.status(200).json(summary);
  } catch (error: any) {
    const status = error.statusCode || 500;
    res.status(status).json({ error: error.message });
  }
});

warehouseStockRouter.post(
  '/replenish-all',
  authenticate,
  requireRole(AUTHORIZED_STOCK_ROLES),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { quantity } = req.body || {};
      const amount = quantity !== undefined ? Number(quantity) : 50;
      const result = await inventoryService.replenishAllStock(amount, req.user?.id);
      res.status(200).json(result);
    } catch (error: any) {
      const status = error.statusCode || 400;
      res.status(status).json({ error: error.message });
    }
  }
);

// ============================================================================
// 2. GET /warehouse-stock (List with filters)
// ============================================================================
warehouseStockRouter.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const warehouseId = req.query.warehouseId ? getParamString(req.query.warehouseId as any) : undefined;
    const productId = req.query.productId ? getParamString(req.query.productId as any) : undefined;
    const search = req.query.search ? getParamString(req.query.search as any) : undefined;
    const status = req.query.status ? getParamString(req.query.status as any) : undefined;

    const stockList = await inventoryService.getAllStock({
      warehouseId,
      productId,
      search,
      status
    });

    res.status(200).json(stockList);
  } catch (error: any) {
    const status = error.statusCode || 500;
    res.status(status).json({ error: error.message });
  }
});

// ============================================================================
// 3. GET /warehouse-stock/:id
// ============================================================================
warehouseStockRouter.get('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const id = getParamString(req.params.id);
    const stock = await inventoryService.getStockById(id);
    res.status(200).json(stock);
  } catch (error: any) {
    const status = error.statusCode || 404;
    res.status(status).json({ error: error.message });
  }
});

// ============================================================================
// 4. POST /warehouse-stock (Create/Upsert Stock Record)
// ============================================================================
warehouseStockRouter.post(
  '/',
  authenticate,
  requireRole(AUTHORIZED_STOCK_ROLES),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { warehouseId, productId, quantity, reorderLevel, reservedQty } = req.body;

      const created = await inventoryService.createStock(
        {
          warehouseId,
          productId,
          quantity: quantity !== undefined ? Number(quantity) : quantity,
          reorderLevel: reorderLevel !== undefined ? Number(reorderLevel) : undefined,
          reservedQty: reservedQty !== undefined ? Number(reservedQty) : undefined
        },
        req.user?.id
      );

      res.status(201).json(created);
    } catch (error: any) {
      const status = error.statusCode || 400;
      res.status(status).json({ error: error.message });
    }
  }
);

// ============================================================================
// 5. PUT/PATCH /warehouse-stock/:id (Update Stock Record by ID)
// ============================================================================
const handleUpdateStockById = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const id = getParamString(req.params.id);
    const { quantity, reservedQty, reorderLevel, reason } = req.body;

    const updated = await inventoryService.updateStock(
      id,
      {
        quantity: quantity !== undefined ? Number(quantity) : undefined,
        reservedQty: reservedQty !== undefined ? Number(reservedQty) : undefined,
        reorderLevel: reorderLevel !== undefined ? Number(reorderLevel) : undefined,
        reason
      },
      req.user?.id
    );

    res.status(200).json(updated);
  } catch (error: any) {
    const status = error.statusCode || 400;
    res.status(status).json({ error: error.message });
  }
};

warehouseStockRouter.patch('/:id', authenticate, requireRole(AUTHORIZED_STOCK_ROLES), handleUpdateStockById);
warehouseStockRouter.put('/:id', authenticate, requireRole(AUTHORIZED_STOCK_ROLES), handleUpdateStockById);

// ============================================================================
// 6. DELETE /warehouse-stock/:id (Delete Stock Record by ID)
// ============================================================================
warehouseStockRouter.delete(
  '/:id',
  authenticate,
  requireRole(AUTHORIZED_STOCK_ROLES),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const id = getParamString(req.params.id);
      const result = await inventoryService.deleteStock(id, req.user?.id);
      res.status(200).json(result);
    } catch (error: any) {
      const status = error.statusCode || 400;
      res.status(status).json({ error: error.message });
    }
  }
);
