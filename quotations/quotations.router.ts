// quotations/quotations.router.ts
import { Router, Request, Response } from 'express';
import { quotationsService } from './quotations.service';
import { authenticate, AuthenticatedRequest } from '../auth/auth.middleware';
import { sanitizeForCustomer } from '../shared/auth.sanitizer';

export const quotationsRouter = Router();

const getParamString = (param: string | string[] | undefined): string => {
  if (Array.isArray(param)) return param[0] || '';
  return param || '';
};

// ============================================================================
// 1. POST /quotations - Create DRAFT Quotation
// ============================================================================
quotationsRouter.post('/', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user || !req.user.id) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { customerId, customerName, customerTier, currency } = req.body;
    const quotation = await quotationsService.createQuotation(
      { customerId, customerName, customerTier, currency },
      req.user.id
    );

    res.status(201).json({
      quotationId: quotation.id,
      id: quotation.id,
      quoteNumber: quotation.quoteNumber,
      status: quotation.status,
      customerName: quotation.customerName,
      customerTier: quotation.customerTier,
      totalAmount: quotation.totalAmount
    });
  } catch (error: any) {
    const status = error.statusCode || 400;
    res.status(status).json({ error: error.message });
  }
});

// ============================================================================
// 2. GET /quotations - List View with Scoping and Filters
// ============================================================================
quotationsRouter.get('/', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user || !req.user.id || !req.user.role) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const status = req.query.status ? getParamString(req.query.status as any) : undefined;
    const repId = req.query.repId ? getParamString(req.query.repId as any) : undefined;
    const teamId = req.query.teamId ? getParamString(req.query.teamId as any) : undefined;

    let list = await quotationsService.getQuotations(
      { id: req.user.id, role: req.user.role },
      { status, repId, teamId }
    );

    if (req.user.role === 'CUSTOMER') {
      list = sanitizeForCustomer(list);
    }

    res.status(200).json(list);
  } catch (error: any) {
    const status = error.statusCode || 500;
    res.status(status).json({ error: error.message });
  }
});

// ============================================================================
// 3. GET /quotations/:id - Full Detail View
// ============================================================================
quotationsRouter.get('/:id', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const id = getParamString(req.params.id);
    const userContext = req.user ? { id: req.user.id, role: req.user.role } : undefined;
    let quotation = await quotationsService.getQuotationById(id, userContext);
    if (req.user?.role === 'CUSTOMER') {
      quotation = sanitizeForCustomer(quotation);
    }
    res.status(200).json(quotation);
  } catch (error: any) {
    const status = error.statusCode || 404;
    res.status(status).json({ error: error.message });
  }
});

// ============================================================================
// 3b. POST /quotations/:id/confirm - Confirm Quotation
// ============================================================================
quotationsRouter.post('/:id/confirm', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user || !req.user.id || !req.user.role) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const id = getParamString(req.params.id);
    let quotation = await quotationsService.confirmQuotation(id, { id: req.user.id, role: req.user.role });
    if (req.user.role === 'CUSTOMER') {
      quotation = sanitizeForCustomer(quotation);
    }
    res.status(200).json(quotation);
  } catch (error: any) {
    const status = error.statusCode || 400;
    res.status(status).json({ error: error.message });
  }
});

// ============================================================================
// 3c. Line Item & Quotation Comments
// ============================================================================
quotationsRouter.post('/:id/comments', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user || !req.user.id || !req.user.role) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const id = getParamString(req.params.id);
    const { comment, lineId } = req.body;
    const created = await quotationsService.addComment(
      id,
      { id: req.user.id, role: req.user.role },
      comment,
      lineId
    );
    res.status(201).json(created);
  } catch (error: any) {
    const status = error.statusCode || 400;
    res.status(status).json({ error: error.message });
  }
});

quotationsRouter.get('/:id/comments', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user || !req.user.id || !req.user.role) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const id = getParamString(req.params.id);
    const comments = await quotationsService.getComments(id, { id: req.user.id, role: req.user.role });
    res.status(200).json(comments);
  } catch (error: any) {
    const status = error.statusCode || 400;
    res.status(status).json({ error: error.message });
  }
});

// ============================================================================
// 4. PATCH /quotations/:id/lines - Upsert Lines
// ============================================================================
const handleUpdateLines = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = getParamString(req.params.id);
    const { lines } = req.body;

    const updatedQuotation = await quotationsService.updateQuotationLines(id, lines);
    res.status(200).json(updatedQuotation);
  } catch (error: any) {
    const status = error.statusCode || 400;
    res.status(status).json({ error: error.message });
  }
};

quotationsRouter.patch('/:id/lines', authenticate, handleUpdateLines);
quotationsRouter.put('/:id/lines', authenticate, handleUpdateLines);

quotationsRouter.patch('/:id', authenticate, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const id = getParamString(req.params.id);
    const { customerId, customerName, customerTier } = req.body;
    const updated = await quotationsService.updateQuotationMeta(id, { customerId, customerName, customerTier });
    res.status(200).json(updated);
  } catch (error: any) {
    const status = error.statusCode || 400;
    res.status(status).json({ error: error.message });
  }
});
