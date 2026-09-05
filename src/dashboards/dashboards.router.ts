// src/dashboards/dashboards.router.ts
import { Router, Response } from 'express';
import { dashboardsService } from './dashboards.service';
import { authenticate, AuthenticatedRequest } from '../../auth/auth.middleware';

export const dashboardsRouter = Router();

/**
 * 1. GET /api/dashboards/admin
 * ADMIN Role Dashboard API
 */
dashboardsRouter.get('/admin', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user || req.user.role !== 'ADMIN') {
      res.status(403).json({ error: 'Forbidden: Admin role required' });
      return;
    }

    const data = await dashboardsService.getAdminDashboard();
    res.status(200).json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 2. GET /api/dashboards/manager
 * SALES_MANAGER Role Dashboard API
 */
dashboardsRouter.get('/manager', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user || (req.user.role !== 'MANAGER' && req.user.role !== 'ADMIN')) {
      res.status(403).json({ error: 'Forbidden: Sales Manager role required' });
      return;
    }

    const data = await dashboardsService.getManagerDashboard(req.user.id);
    res.status(200).json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 3. GET /api/dashboards/sales-rep
 * SALES_REP Role Dashboard API
 */
dashboardsRouter.get('/sales-rep', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user || (req.user.role !== 'REP' && req.user.role !== 'MANAGER' && req.user.role !== 'ADMIN')) {
      res.status(403).json({ error: 'Forbidden: Sales Representative role required' });
      return;
    }

    const data = await dashboardsService.getSalesRepDashboard(req.user.id);
    res.status(200).json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 4. GET /api/dashboards/finance
 * FINANCE_OPERATIONS Role Dashboard API
 */
dashboardsRouter.get('/finance', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user || (req.user.role !== 'FINANCE' && req.user.role !== 'ADMIN')) {
      res.status(403).json({ error: 'Forbidden: Finance & Operations role required' });
      return;
    }

    const data = await dashboardsService.getFinanceDashboard();
    res.status(200).json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * 5. GET /api/dashboards/customer
 * CUSTOMER Role Dashboard API (Strictly returns customer's own data)
 */
dashboardsRouter.get('/customer', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const data = await dashboardsService.getCustomerDashboard(req.user.id, req.user.email);
    res.status(200).json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
