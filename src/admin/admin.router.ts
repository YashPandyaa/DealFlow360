// src/admin/admin.router.ts
import { Router, Response } from 'express';
import { adminService } from './admin.service';
import { authenticate, AuthenticatedRequest } from '../../auth/auth.middleware';

export const adminRouter = Router();

/**
 * Strict RBAC Middleware for Admin Routes
 * Returns HTTP 403 Forbidden if user role is not ADMIN
 */
const requireAdminRole = (req: AuthenticatedRequest, res: Response, next: () => void): void => {
  if (!req.user || req.user.role !== 'ADMIN') {
    res.status(403).json({ error: 'Forbidden: Admin access required' });
    return;
  }
  next();
};

/**
 * GET /api/admin/statistics/overview
 * Overview & multi-dimensional executive statistics
 */
adminRouter.get('/statistics/overview', authenticate, requireAdminRole, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const {
      from,
      to,
      datePreset,
      salesRepId,
      customerId,
      customerTier,
      category,
      warehouseId,
      status,
      riskLevel,
      approvalStatus
    } = req.query;

    const statistics = await adminService.getOverviewStatistics({
      from: from ? String(from) : undefined,
      to: to ? String(to) : undefined,
      datePreset: datePreset ? (String(datePreset) as any) : undefined,
      salesRepId: salesRepId ? String(salesRepId) : undefined,
      customerId: customerId ? String(customerId) : undefined,
      customerTier: customerTier ? String(customerTier) : undefined,
      category: category ? String(category) : undefined,
      warehouseId: warehouseId ? String(warehouseId) : undefined,
      status: status ? String(status) : undefined,
      riskLevel: riskLevel ? String(riskLevel) : undefined,
      approvalStatus: approvalStatus ? String(approvalStatus) : undefined
    });

    res.status(200).json(statistics);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Convenience breakdown routes pointing to overall statistics
 */
adminRouter.get('/statistics/sales', authenticate, requireAdminRole, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const stats = await adminService.getOverviewStatistics(req.query as any);
    res.status(200).json(stats.sales);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

adminRouter.get('/statistics/quotations', authenticate, requireAdminRole, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const stats = await adminService.getOverviewStatistics(req.query as any);
    res.status(200).json(stats.quotations);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

adminRouter.get('/statistics/discounts', authenticate, requireAdminRole, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const stats = await adminService.getOverviewStatistics(req.query as any);
    res.status(200).json(stats.discounts);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

adminRouter.get('/statistics/risk', authenticate, requireAdminRole, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const stats = await adminService.getOverviewStatistics(req.query as any);
    res.status(200).json(stats.risk);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

adminRouter.get('/statistics/approvals', authenticate, requireAdminRole, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const stats = await adminService.getOverviewStatistics(req.query as any);
    res.status(200).json(stats.approvals);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

adminRouter.get('/statistics/customers', authenticate, requireAdminRole, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const stats = await adminService.getOverviewStatistics(req.query as any);
    res.status(200).json(stats.customers);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

adminRouter.get('/statistics/products', authenticate, requireAdminRole, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const stats = await adminService.getOverviewStatistics(req.query as any);
    res.status(200).json(stats.products);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

adminRouter.get('/statistics/fulfillment', authenticate, requireAdminRole, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const stats = await adminService.getOverviewStatistics(req.query as any);
    res.status(200).json(stats.fulfillment);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

adminRouter.get('/statistics/billing', authenticate, requireAdminRole, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const stats = await adminService.getOverviewStatistics(req.query as any);
    res.status(200).json(stats.billing);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
