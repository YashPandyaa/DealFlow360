// upsell/upsell.router.ts
import { Router, Request, Response } from 'express';
import { upsellService } from './upsell.service';
import { authenticate, requireRole } from '../auth/auth.middleware';

export const upsellRouter = Router();

const getParamString = (param: string | string[] | undefined): string => {
  if (Array.isArray(param)) return param[0] || '';
  return param || '';
};

// ============================================================================
// 1. UpsellRule CRUD Endpoints (Admin Only)
// ============================================================================

/**
 * POST /upsell/rules
 * Creates a new UpsellRule. ADMIN only.
 */
upsellRouter.post(
  '/rules',
  authenticate,
  requireRole(['ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { triggerProductId, suggestedProductId, coPurchaseScore, isPromoted, isActive } = req.body;
      if (!triggerProductId || !suggestedProductId) {
        res.status(400).json({ error: 'triggerProductId and suggestedProductId are required' });
        return;
      }

      const rule = await upsellService.createRule({
        triggerProductId,
        suggestedProductId,
        coPurchaseScore: coPurchaseScore !== undefined ? Number(coPurchaseScore) : undefined,
        isPromoted,
        isActive
      });

      res.status(201).json(rule);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
);

/**
 * GET /upsell/rules
 * Lists all UpsellRules.
 */
upsellRouter.get('/rules', async (req: Request, res: Response): Promise<void> => {
  try {
    const triggerProductId = typeof req.query.triggerProductId === 'string' ? req.query.triggerProductId : undefined;
    const isActive = req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined;

    const rules = await upsellService.getRules({ triggerProductId, isActive });
    res.status(200).json(rules);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /upsell/rules/:id
 * Fetches single UpsellRule by ID.
 */
upsellRouter.get('/rules/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = getParamString(req.params.id);
    const rule = await upsellService.getRuleById(id);
    res.status(200).json(rule);
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
});

/**
 * PUT /upsell/rules/:id or PATCH /upsell/rules/:id
 * Updates an existing UpsellRule. ADMIN only.
 */
const handleUpdateRule = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = getParamString(req.params.id);
    const { triggerProductId, suggestedProductId, coPurchaseScore, isPromoted, isActive } = req.body;

    const updatedRule = await upsellService.updateRule(id, {
      triggerProductId,
      suggestedProductId,
      coPurchaseScore: coPurchaseScore !== undefined ? Number(coPurchaseScore) : undefined,
      isPromoted,
      isActive
    });

    res.status(200).json(updatedRule);
  } catch (error: any) {
    if (error.message?.includes('not found')) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(400).json({ error: error.message });
    }
  }
};

upsellRouter.put('/rules/:id', authenticate, requireRole(['ADMIN']), handleUpdateRule);
upsellRouter.patch('/rules/:id', authenticate, requireRole(['ADMIN']), handleUpdateRule);

/**
 * DELETE /upsell/rules/:id
 * Deletes an UpsellRule. ADMIN only.
 */
upsellRouter.delete(
  '/rules/:id',
  authenticate,
  requireRole(['ADMIN']),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const id = getParamString(req.params.id);
      await upsellService.deleteRule(id);
      res.status(200).json({ message: 'Upsell rule deleted successfully' });
    } catch (error: any) {
      if (error.message?.includes('not found')) {
        res.status(404).json({ error: error.message });
      } else {
        res.status(400).json({ error: error.message });
      }
    }
  }
);

// ============================================================================
// 2. Upsell / Cross-Sell Recommendation Endpoint
// ============================================================================

/**
 * GET /upsell/:quotationId
 * Computes ranked upsell recommendations for products in the quotation.
 * Returns: [{ productId, productName, marginDelta, isPromoted, coPurchaseScore }]
 */
upsellRouter.get('/:quotationId', async (req: Request, res: Response): Promise<void> => {
  try {
    const quotationId = getParamString(req.params.quotationId);
    if (!quotationId) {
      res.status(400).json({ error: 'quotationId is required' });
      return;
    }

    const minMarginThreshold =
      req.query.minMarginThreshold !== undefined
        ? Number(req.query.minMarginThreshold)
        : 0;

    const recommendations = await upsellService.getUpsellRecommendations(
      quotationId,
      minMarginThreshold
    );

    res.status(200).json(recommendations);
  } catch (error: any) {
    if (error.message.includes('not found')) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(400).json({ error: error.message });
    }
  }
});
