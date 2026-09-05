// warehouses/warehouses.router.ts
import { Router, Request, Response } from 'express';
import { warehousesService } from './warehouses.service';
import { authenticate, requireRole } from '../auth/auth.middleware';

export const warehousesRouter = Router();

const getParamString = (param: string | string[] | undefined): string => {
  if (Array.isArray(param)) return param[0] || '';
  return param || '';
};

// ============================================================================
// 1. Fulfillment & Split Endpoints
// ============================================================================

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

/**
 * GET /warehouses/suggest-split/:quotationId
 * Preview fulfillment split suggestions without persisting.
 */
warehousesRouter.get('/suggest-split/:quotationId', async (req: Request, res: Response): Promise<void> => {
  try {
    const quotationId = getParamString(req.params.quotationId);
    const result = await warehousesService.suggestFulfillmentSplit(quotationId);
    res.status(200).json(result);
  } catch (error: any) {
    if (error.message.includes('not found')) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(400).json({ error: error.message });
    }
  }
});

/**
 * GET /warehouses/allocations/:quotationId
 * Fetches existing stock allocations for a quotation.
 */
warehousesRouter.get('/allocations/:quotationId', async (req: Request, res: Response): Promise<void> => {
  try {
    const quotationId = getParamString(req.params.quotationId);
    const result = await warehousesService.getAllocationsForQuotation(quotationId);
    res.status(200).json(result);
  } catch (error: any) {
    if (error.message.includes('not found')) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(400).json({ error: error.message });
    }
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
      const warehouse = await warehousesService.createWarehouse({
        name,
        code,
        location,
        capacity,
        isActive
      });
      res.status(201).json(warehouse);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
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

      if (!productId || quantity === undefined) {
        res.status(400).json({ error: 'productId and quantity are required' });
        return;
      }

      const stockRecord = await warehousesService.setStock(
        warehouseId,
        productId,
        Number(quantity)
      );

      res.status(200).json(stockRecord);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
);
