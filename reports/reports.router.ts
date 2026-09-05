// reports/reports.router.ts
import { Router, Request, Response } from 'express';
import { reportsService } from './reports.service';
import { AuthenticatedRequest } from '../auth/auth.middleware';

export const reportsRouter = Router();

const getParamString = (param: string | string[] | undefined): string => {
  if (Array.isArray(param)) return param[0] || '';
  return param || '';
};

// ============================================================================
// 1. Filtered Quotations Report
// ============================================================================

/**
 * GET /reports/quotations
 * Query params: from, to, salesRepId, teamId, approvalStatus (or status), category, page, limit
 */
reportsRouter.get('/quotations', async (req: Request, res: Response): Promise<void> => {
  try {
    const { from, to, salesRepId, teamId, approvalStatus, status, category, page, limit } = req.query;

    const report = await reportsService.getQuotationsReport({
      from: from ? String(from) : undefined,
      to: to ? String(to) : undefined,
      salesRepId: salesRepId ? String(salesRepId) : undefined,
      teamId: teamId ? String(teamId) : undefined,
      approvalStatus: approvalStatus ? String(approvalStatus) : (status ? String(status) : undefined),
      category: category ? String(category) : undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined
    });

    res.status(200).json(report);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// 2. Export Report (PDF / XLSX / CSV)
// ============================================================================

/**
 * GET /reports/export
 * Query params: same filters as /reports/quotations + format=pdf|xlsx|csv
 */
reportsRouter.get('/export', async (req: Request, res: Response): Promise<void> => {
  try {
    const { from, to, salesRepId, teamId, approvalStatus, status, category, format } = req.query;

    const exportData = await reportsService.exportReport(
      {
        from: from ? String(from) : undefined,
        to: to ? String(to) : undefined,
        salesRepId: salesRepId ? String(salesRepId) : undefined,
        teamId: teamId ? String(teamId) : undefined,
        approvalStatus: approvalStatus ? String(approvalStatus) : (status ? String(status) : undefined),
        category: category ? String(category) : undefined
      },
      format ? String(format) : 'pdf'
    );

    res.setHeader('Content-Type', exportData.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${exportData.filename}"`);
    res.status(200).send(exportData.buffer);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// 3. Deal Health Dashboard Analytics
// ============================================================================

/**
 * GET /reports/deal-health
 * Query params: stalledDays, discountAnomalyMultiplier, minHistoryFloor
 */
reportsRouter.get('/deal-health', async (req: Request, res: Response): Promise<void> => {
  try {
    const { stalledDays, discountAnomalyMultiplier, minHistoryFloor } = req.query;

    const health = await reportsService.getDealHealth({
      stalledDays: stalledDays !== undefined ? Number(stalledDays) : undefined,
      discountAnomalyMultiplier: discountAnomalyMultiplier !== undefined ? Number(discountAnomalyMultiplier) : undefined,
      minHistoryFloor: minHistoryFloor !== undefined ? Number(minHistoryFloor) : undefined
    });

    res.status(200).json(health);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// 4. Deal Health Nudge Escalation
// ============================================================================

/**
 * POST /reports/deal-health/:quotationId/nudge
 * Body: { message, escalationType, targetRole }
 */
reportsRouter.post('/deal-health/:quotationId/nudge', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const quotationId = getParamString(req.params.quotationId);
    if (!quotationId) {
      res.status(400).json({ error: 'quotationId is required' });
      return;
    }

    const { message, escalationType, targetRole } = req.body;
    const userId = req.user?.id;

    const result = await reportsService.nudgeQuotation(quotationId, {
      message,
      escalationType,
      targetRole,
      userId
    });

    res.status(200).json(result);
  } catch (error: any) {
    if (error.message.includes('not found')) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(400).json({ error: error.message });
    }
  }
});
