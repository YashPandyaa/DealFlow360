// approvals/approvals.service.ts
import { prisma } from '../shared/prisma';
import { discountsService } from '../discounts/discounts.service';

export interface SubmitApprovalInput {
  quotationId: string;
  customerTier?: string;
  userId?: string;
}

export interface ProcessActionInput {
  action: string;
  reason?: string;
}

export interface ApproverUser {
  id: string;
  role: string;
}

export class ApprovalsService {
  /**
   * 1. POST /approvals/submit
   * Submits a quotation for approval evaluation.
   * Calls discountsService.calculateRisk internally.
   */
  async submitApproval(input: SubmitApprovalInput) {
    const { quotationId, customerTier: tierOverride, userId } = input;

    if (!quotationId) {
      const err = new Error('quotationId is required');
      (err as any).statusCode = 400;
      throw err;
    }

    const quotation = await prisma.quotation.findUnique({
      where: { id: quotationId },
      include: {
        lines: {
          include: { product: true }
        }
      }
    });

    if (!quotation) {
      const err = new Error(`Quotation with ID '${quotationId}' not found`);
      (err as any).statusCode = 404;
      throw err;
    }

    const customerTier = tierOverride || quotation.customerTier || 'GOLD';

    const lines = quotation.lines.map((line) => ({
      category: line.product?.category || 'Hardware',
      discountPercent: line.discount,
      lineTotal: line.totalPrice
    }));

    const riskResult = await discountsService.calculateRisk({
      customerTier,
      lines
    });

    // If no approval is required
    if (!riskResult.requiredApprovalChain) {
      await prisma.quotation.update({
        where: { id: quotationId },
        data: { status: 'READY_FOR_FULFILLMENT' }
      });

      await prisma.auditLog.create({
        data: {
          entityType: 'Quotation',
          entityId: quotationId,
          userId: userId || quotation.userId,
          action: 'AUTO_APPROVED_FOR_FULFILLMENT',
          reason: 'No approval required based on risk score',
          metadata: JSON.stringify({ blendedRiskScore: riskResult.blendedRiskScore })
        }
      });

      return { requiresApproval: false };
    }

    // If approval is needed -> create fresh ApprovalRequest
    const approvalRequest = await prisma.approvalRequest.create({
      data: {
        quotationId,
        blendedRiskScore: riskResult.blendedRiskScore,
        requiredApprovers: riskResult.requiredApprovalChain,
        currentStep: 'MANAGER',
        status: 'PENDING'
      }
    });

    await prisma.quotation.update({
      where: { id: quotationId },
      data: { status: 'PENDING_APPROVAL' }
    });

    await prisma.auditLog.create({
      data: {
        entityType: 'Quotation',
        entityId: quotationId,
        userId: userId || quotation.userId,
        action: 'SUBMITTED_FOR_APPROVAL',
        reason: `Risk score ${riskResult.blendedRiskScore} requires ${riskResult.requiredApprovalChain} approval`,
        metadata: JSON.stringify({
          approvalRequestId: approvalRequest.id,
          requiredApprovers: riskResult.requiredApprovalChain,
          currentStep: 'MANAGER'
        })
      }
    });

    return {
      requiresApproval: true,
      approvalRequestId: approvalRequest.id,
      currentStep: 'MANAGER'
    };
  }

  /**
   * 2. POST /approvals/:id/action
   * Processes approval, rejection, or return for revision action on an ApprovalRequest.
   */
  async processAction(approvalRequestId: string, input: ProcessActionInput, user: ApproverUser) {
    const { action, reason } = input;
    const validActions = ['APPROVED', 'REJECTED', 'RETURNED_FOR_REVISION'];

    if (!action || !validActions.includes(action.toUpperCase())) {
      const err = new Error(`Invalid action. Allowed actions: ${validActions.join(', ')}`);
      (err as any).statusCode = 400;
      throw err;
    }

    const actionUpper = action.toUpperCase();

    // Rejection or Return for Revision requires a non-empty reason
    if (
      (actionUpper === 'REJECTED' || actionUpper === 'RETURNED_FOR_REVISION') &&
      (!reason || reason.trim() === '')
    ) {
      const err = new Error(`Reason is required when action is ${actionUpper}`);
      (err as any).statusCode = 400;
      throw err;
    }

    const approvalRequest = await prisma.approvalRequest.findUnique({
      where: { id: approvalRequestId }
    });

    if (!approvalRequest) {
      const err = new Error(`ApprovalRequest with ID '${approvalRequestId}' not found`);
      (err as any).statusCode = 404;
      throw err;
    }

    // Guard against acting on non-PENDING requests (409 Conflict)
    if (approvalRequest.status !== 'PENDING') {
      const err = new Error(`Cannot process action on approval request with status '${approvalRequest.status}'`);
      (err as any).statusCode = 409;
      throw err;
    }

    // Role Enforcement: Only role matching currentStep (or ADMIN) may act
    const requiredRole = approvalRequest.currentStep;
    if (user.role !== 'ADMIN' && user.role !== requiredRole) {
      const err = new Error(`Forbidden: Only users with role '${requiredRole}' or 'ADMIN' can act on step '${requiredRole}'`);
      (err as any).statusCode = 403;
      throw err;
    }

    // Compute next step and status
    let nextStep = approvalRequest.currentStep;
    let nextStatus = approvalRequest.status;
    let quotationStatus = 'PENDING_APPROVAL';

    if (actionUpper === 'APPROVED') {
      if (
        approvalRequest.requiredApprovers === 'MANAGER_THEN_FINANCE' &&
        approvalRequest.currentStep === 'MANAGER'
      ) {
        nextStep = 'FINANCE';
        nextStatus = 'PENDING';
        quotationStatus = 'PENDING_APPROVAL';
      } else {
        nextStep = 'COMPLETED';
        nextStatus = 'APPROVED';
        quotationStatus = 'APPROVED';
      }
    } else if (actionUpper === 'REJECTED') {
      // Don't advance currentStep
      nextStatus = 'REJECTED';
      quotationStatus = 'REJECTED';
    } else if (actionUpper === 'RETURNED_FOR_REVISION') {
      // Don't advance currentStep
      nextStatus = 'RETURNED_FOR_REVISION';
      quotationStatus = 'RETURNED_FOR_REVISION';
    }

    // DB-level atomic check & update to prevent double-processing / race conditions
    const updateResult = await prisma.approvalRequest.updateMany({
      where: {
        id: approvalRequestId,
        status: 'PENDING',
        currentStep: approvalRequest.currentStep
      },
      data: {
        status: nextStatus,
        currentStep: nextStep,
        updatedAt: new Date()
      }
    });

    if (updateResult.count === 0) {
      const err = new Error('Approval request status was modified by another transaction or request');
      (err as any).statusCode = 409;
      throw err;
    }

    // Update Quotation status
    await prisma.quotation.update({
      where: { id: approvalRequest.quotationId },
      data: { status: quotationStatus }
    });

    // Write ApprovalStepRecord (workflow state)
    const stepRecordAction = actionUpper === 'RETURNED_FOR_REVISION' ? 'RETURNED' : actionUpper;
    const stepRecord = await prisma.approvalStepRecord.create({
      data: {
        approvalRequestId,
        approverRole: user.role,
        approverId: user.id,
        action: stepRecordAction,
        reason: reason ? reason.trim() : null
      }
    });

    // Write AuditLog entry (compliance trail)
    await prisma.auditLog.create({
      data: {
        entityType: 'ApprovalRequest',
        entityId: approvalRequestId,
        userId: user.id,
        action: actionUpper,
        reason: reason ? reason.trim() : null,
        metadata: JSON.stringify({
          quotationId: approvalRequest.quotationId,
          previousStep: approvalRequest.currentStep,
          nextStep,
          status: nextStatus
        })
      }
    });

    const updatedRequest = await prisma.approvalRequest.findUnique({
      where: { id: approvalRequestId },
      include: { stepRecords: true }
    });

    return updatedRequest;
  }

  /**
   * 3. POST /approvals/:quotationId/reopen
   * Called on counter-offer/re-negotiation to re-evaluate risk and create a fresh ApprovalRequest if needed.
   */
  async reopenApproval(quotationId: string, customerTierOverride?: string, userId?: string) {
    if (!quotationId) {
      const err = new Error('quotationId is required');
      (err as any).statusCode = 400;
      throw err;
    }

    const quotation = await prisma.quotation.findUnique({
      where: { id: quotationId },
      include: {
        lines: {
          include: { product: true }
        }
      }
    });

    if (!quotation) {
      const err = new Error(`Quotation with ID '${quotationId}' not found`);
      (err as any).statusCode = 404;
      throw err;
    }

    const customerTier = customerTierOverride || quotation.customerTier || 'GOLD';

    const lines = quotation.lines.map((line) => ({
      category: line.product?.category || 'Hardware',
      discountPercent: line.discount,
      lineTotal: line.totalPrice
    }));

    const riskResult = await discountsService.calculateRisk({
      customerTier,
      lines
    });

    // Log AuditLog entry explicitly noting trigger by customer negotiation
    await prisma.auditLog.create({
      data: {
        entityType: 'Quotation',
        entityId: quotationId,
        userId: userId || quotation.userId,
        action: 'REOPENED_FOR_NEGOTIATION',
        reason: 'Triggered by customer negotiation counter-offer',
        metadata: JSON.stringify({ blendedRiskScore: riskResult.blendedRiskScore })
      }
    });

    if (!riskResult.requiredApprovalChain) {
      await prisma.quotation.update({
        where: { id: quotationId },
        data: { status: 'READY_FOR_FULFILLMENT' }
      });
      return { requiresApproval: false };
    }

    // Re-negotiated deal must re-clear approval -> create fresh ApprovalRequest even if previous was APPROVED
    const approvalRequest = await prisma.approvalRequest.create({
      data: {
        quotationId,
        blendedRiskScore: riskResult.blendedRiskScore,
        requiredApprovers: riskResult.requiredApprovalChain,
        currentStep: 'MANAGER',
        status: 'PENDING'
      }
    });

    await prisma.quotation.update({
      where: { id: quotationId },
      data: { status: 'PENDING_APPROVAL' }
    });

    return {
      requiresApproval: true,
      approvalRequestId: approvalRequest.id,
      currentStep: 'MANAGER'
    };
  }

  /**
   * 4. GET /approvals/:quotationId/history
   * Fetches step records and audit log entries for a quotation ordered chronologically.
   */
  async getHistory(quotationId: string) {
    if (!quotationId) {
      const err = new Error('quotationId is required');
      (err as any).statusCode = 400;
      throw err;
    }

    const approvalRequests = await prisma.approvalRequest.findMany({
      where: { quotationId },
      include: {
        stepRecords: true
      },
      orderBy: { createdAt: 'asc' }
    });

    const requestIds = approvalRequests.map((r) => r.id);

    const auditLogs = await prisma.auditLog.findMany({
      where: {
        OR: [
          { entityId: quotationId },
          { entityId: { in: requestIds } }
        ]
      },
      orderBy: { createdAt: 'asc' }
    });

    // Flatten step records across all approval requests
    const stepRecords = approvalRequests.flatMap((req) => req.stepRecords);
    stepRecords.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    return {
      quotationId,
      approvalRequests,
      stepRecords,
      auditLogs
    };
  }
}

export const approvalsService = new ApprovalsService();
