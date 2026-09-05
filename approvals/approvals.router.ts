// approvals/approvals.router.ts
import { Router, Request, Response } from 'express';
import { approvalsService } from './approvals.service';
import { authenticate, AuthenticatedRequest } from '../auth/auth.middleware';

export const approvalsRouter = Router();

const getParamString = (param: string | string[] | undefined): string => {
  if (Array.isArray(param)) return param[0] || '';
  return param || '';
};

/**
 * 1. POST /approvals/submit
 * Submits a quotation for approval.
 */
approvalsRouter.post('/submit', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { quotationId, customerTier } = req.body;
    const userId = req.user?.id;

    const result = await approvalsService.submitApproval({
      quotationId,
      customerTier,
      userId
    });

    res.status(200).json(result);
  } catch (error: any) {
    const status = error.statusCode || error.status || 400;
    res.status(status).json({ error: error.message });
  }
});

/**
 * 2. POST /approvals/:id/action
 * Approves, rejects, or returns an approval request for revision.
 */
approvalsRouter.post('/:id/action', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const id = getParamString(req.params.id);
    const { action, reason } = req.body;

    if (!req.user || !req.user.id || !req.user.role) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const result = await approvalsService.processAction(
      id,
      { action, reason },
      { id: req.user.id, role: req.user.role }
    );

    res.status(200).json(result);
  } catch (error: any) {
    const status = error.statusCode || error.status || 400;
    res.status(status).json({ error: error.message });
  }
});

/**
 * 3. POST /approvals/:quotationId/reopen
 * Triggered on customer counter-offer / re-negotiation to re-evaluate approval needs.
 */
approvalsRouter.post('/:quotationId/reopen', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const quotationId = getParamString(req.params.quotationId);
    const { customerTier } = req.body;
    const userId = req.user?.id;

    const result = await approvalsService.reopenApproval(quotationId, customerTier, userId);
    res.status(200).json(result);
  } catch (error: any) {
    const status = error.statusCode || error.status || 400;
    res.status(status).json({ error: error.message });
  }
});

/**
 * 4. GET /approvals/:quotationId/history
 * Returns approval step records and audit log trail for a quotation.
 */
approvalsRouter.get('/:quotationId/history', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const quotationId = getParamString(req.params.quotationId);
    const history = await approvalsService.getHistory(quotationId);
    res.status(200).json(history);
  } catch (error: any) {
    const status = error.statusCode || error.status || 400;
    res.status(status).json({ error: error.message });
  }
});
