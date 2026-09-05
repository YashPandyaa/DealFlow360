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
    const { quotationId, customerTier, customerId, customerName } = req.body;
    const userId = req.user?.id;

    const result = await approvalsService.submitApproval({
      quotationId,
      customerTier,
      customerId,
      customerName,
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
 * 2a. POST /approvals/:id/approve
 */
approvalsRouter.post('/:id/approve', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const id = getParamString(req.params.id);
    const { reason } = req.body || {};

    if (!req.user || !req.user.id || !req.user.role) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const result = await approvalsService.processAction(
      id,
      { action: 'APPROVED', reason },
      { id: req.user.id, role: req.user.role }
    );

    res.status(200).json(result);
  } catch (error: any) {
    const status = error.statusCode || error.status || 400;
    res.status(status).json({ error: error.message });
  }
});

/**
 * 2b. POST /approvals/:id/reject
 */
approvalsRouter.post('/:id/reject', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const id = getParamString(req.params.id);
    const { reason } = req.body || {};

    if (!req.user || !req.user.id || !req.user.role) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const result = await approvalsService.processAction(
      id,
      { action: 'REJECTED', reason },
      { id: req.user.id, role: req.user.role }
    );

    res.status(200).json(result);
  } catch (error: any) {
    const status = error.statusCode || error.status || 400;
    res.status(status).json({ error: error.message });
  }
});

/**
 * 2c. POST /approvals/:id/return-revision & /approvals/:id/request-revision
 */
const handleReturnRevision = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const id = getParamString(req.params.id);
    const { reason } = req.body || {};

    if (!req.user || !req.user.id || !req.user.role) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const result = await approvalsService.processAction(
      id,
      { action: 'RETURNED_FOR_REVISION', reason },
      { id: req.user.id, role: req.user.role }
    );

    res.status(200).json(result);
  } catch (error: any) {
    const status = error.statusCode || error.status || 400;
    res.status(status).json({ error: error.message });
  }
};

approvalsRouter.post('/:id/return-revision', authenticate, handleReturnRevision);
approvalsRouter.post('/:id/request-revision', authenticate, handleReturnRevision);

/**
 * 3. POST /approvals/:quotationId/reopen
 * Triggered on customer counter-offer / re-negotiation to re-evaluate approval needs.
 */
approvalsRouter.post('/:quotationId/reopen', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const quotationId = getParamString(req.params.quotationId);
    const { customerTier, discountProposal } = req.body;
    const userId = req.user?.id;
    const userRole = req.user?.role;

    const result = await approvalsService.reopenApproval(quotationId, customerTier, userId, discountProposal, userRole);
    res.status(200).json(result);
  } catch (error: any) {
    const status = error.statusCode || error.status || 400;
    res.status(status).json({ error: error.message });
  }
});

/**
 * 5. GET /approvals/queue
 * Retrieves Manager Approval Queue with filters and sorting.
 */
approvalsRouter.get('/queue', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { search, riskLevel, status, salesRepId, customerId, sortBy, sortOrder } = req.query;

    const queue = await approvalsService.getQueue({
      search: search ? String(search) : undefined,
      riskLevel: riskLevel ? String(riskLevel) : undefined,
      status: status ? String(status) : undefined,
      salesRepId: salesRepId ? String(salesRepId) : undefined,
      customerId: customerId ? String(customerId) : undefined,
      sortBy: sortBy ? (String(sortBy) as any) : undefined,
      sortOrder: sortOrder ? (String(sortOrder) as any) : undefined
    });

    res.status(200).json(queue);
  } catch (error: any) {
    const status = error.statusCode || error.status || 400;
    res.status(status).json({ error: error.message });
  }
});

/**
 * 6. GET /approvals/:quotationId/detail
 * Retrieves complete 360-degree Approval Context for Manager Review.
 */
approvalsRouter.get('/:quotationId/detail', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const quotationId = getParamString(req.params.quotationId);
    const detail = await approvalsService.getApprovalDetail(quotationId);
    res.status(200).json(detail);
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

