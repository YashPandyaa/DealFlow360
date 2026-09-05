// discounts/discounts.router.ts
import { Router, Request, Response } from 'express';
import { discountsService } from './discounts.service';
import { authenticate, requireRole } from '../auth/auth.middleware';

export const discountsRouter = Router();

const getParamString = (param: string | string[] | undefined): string => {
  if (Array.isArray(param)) return param[0] || '';
  return param || '';
};

// ============================================================================
// 1. DiscountTier Endpoints (CRUD - Admin Only for mutations)
// ============================================================================

discountsRouter.post(
  '/tiers',
  authenticate,
  requireRole(['ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { customerTier, maxDiscountPercent } = req.body;
      const tier = await discountsService.createDiscountTier({
        customerTier,
        maxDiscountPercent: Number(maxDiscountPercent)
      });
      res.status(201).json(tier);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
);

discountsRouter.get(
  '/tiers',
  authenticate,
  requireRole(['ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const tiers = await discountsService.getAllDiscountTiers();
      res.status(200).json(tiers);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

discountsRouter.get(
  '/tiers/:id',
  authenticate,
  requireRole(['ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const id = getParamString(req.params.id);
      const tier = await discountsService.getDiscountTierById(id);
      res.status(200).json(tier);
    } catch (error: any) {
      res.status(404).json({ error: error.message });
    }
  }
);

discountsRouter.put(
  '/tiers/:id',
  authenticate,
  requireRole(['ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const id = getParamString(req.params.id);
      const { customerTier, maxDiscountPercent } = req.body;
      const updated = await discountsService.updateDiscountTier(id, {
        customerTier,
        maxDiscountPercent: maxDiscountPercent !== undefined ? Number(maxDiscountPercent) : undefined
      });
      res.status(200).json(updated);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
);

discountsRouter.delete(
  '/tiers/:id',
  authenticate,
  requireRole(['ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const id = getParamString(req.params.id);
      await discountsService.deleteDiscountTier(id);
      res.status(200).json({ message: 'DiscountTier deleted successfully' });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
);

// ============================================================================
// 2. CategoryDiscountCeiling Endpoints (CRUD - Admin Only for mutations)
// ============================================================================

const handleCreateCategoryCeiling = async (req: Request, res: Response): Promise<void> => {
  try {
    const { category, maxDiscountPercent } = req.body;
    const ceiling = await discountsService.createCategoryDiscountCeiling({
      category,
      maxDiscountPercent: Number(maxDiscountPercent)
    });
    res.status(201).json(ceiling);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

discountsRouter.post('/categories', authenticate, requireRole(['ADMIN']), handleCreateCategoryCeiling);
discountsRouter.post('/category-ceilings', authenticate, requireRole(['ADMIN']), handleCreateCategoryCeiling);

const handleGetCategoryCeilings = async (req: Request, res: Response): Promise<void> => {
  try {
    const ceilings = await discountsService.getAllCategoryDiscountCeilings();
    res.status(200).json(ceilings);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

discountsRouter.get('/categories', authenticate, requireRole(['ADMIN']), handleGetCategoryCeilings);
discountsRouter.get('/category-ceilings', authenticate, requireRole(['ADMIN']), handleGetCategoryCeilings);

const handleGetCategoryCeilingById = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = getParamString(req.params.id);
    const ceiling = await discountsService.getCategoryDiscountCeilingById(id);
    res.status(200).json(ceiling);
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
};

discountsRouter.get('/categories/:id', authenticate, requireRole(['ADMIN']), handleGetCategoryCeilingById);
discountsRouter.get('/category-ceilings/:id', authenticate, requireRole(['ADMIN']), handleGetCategoryCeilingById);

const handleUpdateCategoryCeiling = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = getParamString(req.params.id);
    const { category, maxDiscountPercent } = req.body;
    const updated = await discountsService.updateCategoryDiscountCeiling(id, {
      category,
      maxDiscountPercent: maxDiscountPercent !== undefined ? Number(maxDiscountPercent) : undefined
    });
    res.status(200).json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

discountsRouter.put('/categories/:id', authenticate, requireRole(['ADMIN']), handleUpdateCategoryCeiling);
discountsRouter.put('/category-ceilings/:id', authenticate, requireRole(['ADMIN']), handleUpdateCategoryCeiling);

const handleDeleteCategoryCeiling = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = getParamString(req.params.id);
    await discountsService.deleteCategoryDiscountCeiling(id);
    res.status(200).json({ message: 'CategoryDiscountCeiling deleted successfully' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

discountsRouter.delete('/categories/:id', authenticate, requireRole(['ADMIN']), handleDeleteCategoryCeiling);
discountsRouter.delete('/category-ceilings/:id', authenticate, requireRole(['ADMIN']), handleDeleteCategoryCeiling);

// ============================================================================
// 3. ApprovalChain Endpoints (CRUD - Admin Only for mutations)
// ============================================================================

discountsRouter.post(
  '/approval-chains',
  authenticate,
  requireRole(['ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { minRiskScore, maxRiskScore, requiredApprovers } = req.body;
      const chain = await discountsService.createApprovalChain({
        minRiskScore: Number(minRiskScore),
        maxRiskScore: maxRiskScore !== undefined && maxRiskScore !== null ? Number(maxRiskScore) : null,
        requiredApprovers
      });
      res.status(201).json(chain);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
);

discountsRouter.get(
  '/approval-chains',
  authenticate,
  requireRole(['ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const chains = await discountsService.getAllApprovalChains();
      res.status(200).json(chains);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

discountsRouter.get(
  '/approval-chains/:id',
  authenticate,
  requireRole(['ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const id = getParamString(req.params.id);
      const chain = await discountsService.getApprovalChainById(id);
      res.status(200).json(chain);
    } catch (error: any) {
      res.status(404).json({ error: error.message });
    }
  }
);

discountsRouter.put(
  '/approval-chains/:id',
  authenticate,
  requireRole(['ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const id = getParamString(req.params.id);
      const { minRiskScore, maxRiskScore, requiredApprovers } = req.body;
      const updated = await discountsService.updateApprovalChain(id, {
        minRiskScore: minRiskScore !== undefined ? Number(minRiskScore) : undefined,
        maxRiskScore,
        requiredApprovers
      });
      res.status(200).json(updated);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
);

discountsRouter.delete(
  '/approval-chains/:id',
  authenticate,
  requireRole(['ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const id = getParamString(req.params.id);
      await discountsService.deleteApprovalChain(id);
      res.status(200).json({ message: 'ApprovalChain deleted successfully' });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
);

// ============================================================================
// 4. POST /discounts/calculate-risk
// ============================================================================

discountsRouter.post('/calculate-risk', async (req: Request, res: Response): Promise<void> => {
  try {
    const { customerTier, lines } = req.body;
    const result = await discountsService.calculateRisk({ customerTier, lines });
    res.status(200).json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});
