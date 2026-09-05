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
