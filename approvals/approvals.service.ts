// approvals/approvals.service.ts
import { prisma } from '../shared/prisma';
import { discountsService } from '../discounts/discounts.service';

export interface SubmitApprovalInput {
  quotationId: string;
  customerTier?: string;
  customerId?: string;
  customerName?: string;
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
   * Helper to safely resolve a valid user ID for AuditLog foreign key reference.
   */
  private async resolveValidUserId(...candidateIds: (string | undefined | null)[]): Promise<string | null> {
    for (const id of candidateIds) {
      if (id) {
        const existingUser = await prisma.user.findUnique({ where: { id } });
        if (existingUser) return existingUser.id;
      }
    }
    return null;
  }

  /**
   * 1. POST /approvals/submit
   * Submits a quotation for approval evaluation.
   * Calls discountsService.calculateRisk internally.
   */
  async submitApproval(input: SubmitApprovalInput) {
    const { quotationId, customerTier: tierOverride, customerId: inputCustomerId, customerName: inputCustomerName, userId } = input;

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

    if (!quotation.lines || quotation.lines.length === 0) {
      const err = new Error('Cannot submit an empty quotation. Please add at least one line item from the catalog.');
      (err as any).statusCode = 400;
      throw err;
    }

    const customerTier = tierOverride || quotation.customerTier || 'GOLD';
    const targetCustomerId = inputCustomerId || quotation.customerId || undefined;
    const targetCustomerName = inputCustomerName || quotation.customerName || undefined;

    const lines = quotation.lines.map((line) => ({
      productId: line.productId,
      productName: line.product?.name || line.product?.category || 'Product',
      category: line.product?.category || 'Hardware',
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      costPrice: line.costPrice || line.product?.costPrice || 0,
      discountPercent: line.discount,
      lineTotal: line.totalPrice || line.lineTotal
    }));

    const riskResult = await discountsService.calculateRisk({
      quotationId,
      salesRepId: quotation.userId || userId,
      customerTier,
      customerId: targetCustomerId,
      customerName: targetCustomerName,
      lines
    });

    const validAuditUserId = await this.resolveValidUserId(userId, quotation.userId);

    // If no approval is required
    if (!riskResult.requiresApproval && !riskResult.requiredApprovalChain) {
      await prisma.quotation.update({
        where: { id: quotationId },
        data: { status: 'READY_FOR_FULFILLMENT' }
      });

      await prisma.auditLog.create({
        data: {
          entityType: 'Quotation',
          entityId: quotationId,
          userId: validAuditUserId,
          action: 'AUTO_APPROVED_FOR_FULFILLMENT',
          reason: 'No approval required based on risk score',
          metadata: JSON.stringify({ blendedRiskScore: riskResult.risk_score, riskResult })
        }
      });

      return { requiresApproval: false, riskResult };
    }

    // Check for existing pending ApprovalRequest to avoid duplicate records
    const existingPending = await prisma.approvalRequest.findFirst({
      where: { quotationId, status: 'PENDING' }
    });

    let approvalRequest;
    if (existingPending) {
      approvalRequest = await prisma.approvalRequest.update({
        where: { id: existingPending.id },
        data: {
          blendedRiskScore: riskResult.risk_score,
          riskLevel: riskResult.risk_level,
          calculationVersion: riskResult.calculation_version,
          riskSnapshot: JSON.stringify(riskResult),
          requiredApprovers: riskResult.requiredApprovalChain || 'MANAGER',
          currentStep: 'MANAGER',
          updatedAt: new Date()
        }
      });
    } else {
      approvalRequest = await prisma.approvalRequest.create({
        data: {
          quotationId,
          blendedRiskScore: riskResult.risk_score,
          riskLevel: riskResult.risk_level,
          calculationVersion: riskResult.calculation_version,
          riskSnapshot: JSON.stringify(riskResult),
          requiredApprovers: riskResult.requiredApprovalChain || 'MANAGER',
          currentStep: 'MANAGER',
          status: 'PENDING'
        }
      });
    }

    await prisma.quotation.update({
      where: { id: quotationId },
      data: { status: 'PENDING_APPROVAL' }
    });

    await prisma.auditLog.create({
      data: {
        entityType: 'Quotation',
        entityId: quotationId,
        userId: validAuditUserId,
        action: 'SUBMITTED_FOR_APPROVAL',
        reason: `Risk score ${riskResult.risk_score} (${riskResult.risk_level}) requires ${riskResult.requiredApprovalChain} approval`,
        metadata: JSON.stringify({
          approvalRequestId: approvalRequest.id,
          requiredApprovers: riskResult.requiredApprovalChain,
          currentStep: 'MANAGER',
          riskResult
        })
      }
    });

    return {
      requiresApproval: true,
      approvalRequestId: approvalRequest.id,
      currentStep: 'MANAGER',
      riskResult
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

    let approvalRequest = await prisma.approvalRequest.findUnique({
      where: { id: approvalRequestId }
    });

    if (!approvalRequest) {
      // Also check if the ID passed was a quotationId with an active pending approval request
      approvalRequest = await prisma.approvalRequest.findFirst({
        where: { quotationId: approvalRequestId, status: 'PENDING' },
        orderBy: { createdAt: 'desc' }
      });
    }

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

    // Fetch quotation to check for self-approval attempt
    const quotation = await prisma.quotation.findUnique({
      where: { id: approvalRequest.quotationId }
    });

    if (quotation && quotation.userId === user.id) {
      const err = new Error('Forbidden: You cannot approve or alter approval requests for a quotation you created (Self-approval is prohibited).');
      (err as any).statusCode = 403;
      throw err;
    }

    // Role Enforcement: Only role matching currentStep (or ADMIN) may act. Sales Reps & Customers are strictly forbidden.
    const normalizeRole = (roleStr: string): string => {
      const r = (roleStr || '').toUpperCase();
      if (['SALES_REP', 'REP', 'SALES_REPRESENTATIVE'].includes(r)) return 'REP';
      if (['SALES_MANAGER', 'MANAGER', 'SALES_MGR', 'APPROVER'].includes(r)) return 'MANAGER';
      if (['FINANCE', 'FINANCE_OPERATIONS', 'FINANCE_ADMIN', 'OPS'].includes(r)) return 'FINANCE';
      if (['CUSTOMER', 'PORTAL_USER'].includes(r)) return 'CUSTOMER';
      if (['ADMIN'].includes(r)) return 'ADMIN';
      return r;
    };

    const userRoleNorm = normalizeRole(user.role);

    if (userRoleNorm === 'REP' || userRoleNorm === 'CUSTOMER') {
      const err = new Error(`Forbidden: Users with role '${user.role}' cannot approve or alter approval requests.`);
      (err as any).statusCode = 403;
      throw err;
    }

    const requiredRole = approvalRequest.currentStep;
    if (userRoleNorm !== 'ADMIN' && userRoleNorm !== requiredRole) {
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
        id: approvalRequest.id,
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
        approvalRequestId: approvalRequest.id,
        approverRole: user.role,
        approverId: user.id,
        action: stepRecordAction,
        reason: reason ? reason.trim() : null
      }
    });

    // Write AuditLog entry (compliance trail)
    const validAuditUserId = await this.resolveValidUserId(user.id);
    await prisma.auditLog.create({
      data: {
        entityType: 'ApprovalRequest',
        entityId: approvalRequest.id,
        userId: validAuditUserId,
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
      where: { id: approvalRequest.id },
      include: { stepRecords: true }
    });

    return updatedRequest;
  }

  /**
   * 3. POST /approvals/:quotationId/reopen
   * Called on counter-offer/re-negotiation to re-evaluate risk and create a fresh ApprovalRequest if needed.
   */
  async reopenApproval(quotationId: string, customerTierOverride?: string, userId?: string, discountProposal?: number, userRole?: string) {
    if (!quotationId) {
      const err = new Error('quotationId is required');
      (err as any).statusCode = 400;
      throw err;
    }

    let quotation = await prisma.quotation.findUnique({
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

    if (userRole === 'CUSTOMER' && userId) {
      if (quotation.customerId && quotation.customerId !== userId && quotation.userId !== userId) {
        const err = new Error(`Forbidden: You do not have access to quotation '${quotationId}'`);
        (err as any).statusCode = 403;
        throw err;
      }
    }

    if (typeof discountProposal === 'number' && discountProposal >= 0) {
      for (const line of quotation.lines) {
        const lineTotal = line.quantity * line.unitPrice * (1 - discountProposal / 100);
        await prisma.quotationLine.update({
          where: { id: line.id },
          data: { discount: discountProposal, totalPrice: lineTotal }
        });
      }

      quotation = await prisma.quotation.findUnique({
        where: { id: quotationId },
        include: {
          lines: {
            include: { product: true }
          }
        }
      });
      if (!quotation) {
        throw new Error('Quotation missing after line update');
      }

      const newTotal = quotation.lines.reduce((sum, l) => sum + l.totalPrice, 0);
      await prisma.quotation.update({
        where: { id: quotationId },
        data: { totalAmount: newTotal }
      });
      quotation.totalAmount = newTotal;
    }

    const customerTier = customerTierOverride || quotation.customerTier || 'GOLD';

    const lines = quotation.lines.map((line) => ({
      category: line.product?.category || 'Hardware',
      discountPercent: line.discount,
      lineTotal: line.totalPrice
    }));

    const riskResult = await discountsService.calculateRisk({
      customerTier,
      customerId: quotation.customerId || undefined,
      customerName: quotation.customerName || undefined,
      lines
    });

    // Log AuditLog entry explicitly noting trigger by customer negotiation
    const validAuditUserId = await this.resolveValidUserId(userId, quotation.userId);
    await prisma.auditLog.create({
      data: {
        entityType: 'Quotation',
        entityId: quotationId,
        userId: validAuditUserId,
        action: 'REOPENED_FOR_NEGOTIATION',
        reason: 'Triggered by customer negotiation counter-offer',
        metadata: JSON.stringify({ blendedRiskScore: riskResult.blendedRiskScore })
      }
    });

    if (!riskResult.requiresApproval && !riskResult.requiredApprovalChain) {
      await prisma.quotation.update({
        where: { id: quotationId },
        data: { status: 'READY_FOR_FULFILLMENT' }
      });
      return { requiresApproval: false };
    }

    // Check for existing pending ApprovalRequest to prevent duplicate records
    const existingPending = await prisma.approvalRequest.findFirst({
      where: { quotationId, status: 'PENDING' }
    });

    let approvalRequest;
    if (existingPending) {
      approvalRequest = await prisma.approvalRequest.update({
        where: { id: existingPending.id },
        data: {
          blendedRiskScore: riskResult.blendedRiskScore,
          requiredApprovers: riskResult.requiredApprovalChain || 'MANAGER',
          currentStep: 'MANAGER',
          updatedAt: new Date()
        }
      });
    } else {
      approvalRequest = await prisma.approvalRequest.create({
        data: {
          quotationId,
          blendedRiskScore: riskResult.blendedRiskScore,
          requiredApprovers: riskResult.requiredApprovalChain || 'MANAGER',
          currentStep: 'MANAGER',
          status: 'PENDING'
        }
      });
    }

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
  async getHistory(idOrNumber: string) {
    if (!idOrNumber) {
      const err = new Error('quotationId is required');
      (err as any).statusCode = 400;
      throw err;
    }

    // Resolve target quotation ID
    let targetQuotationId = idOrNumber;
    const directQuotation = await prisma.quotation.findFirst({
      where: {
        OR: [{ id: idOrNumber }, { quoteNumber: idOrNumber }]
      }
    });

    if (directQuotation) {
      targetQuotationId = directQuotation.id;
    } else {
      const directAppReq = await prisma.approvalRequest.findUnique({
        where: { id: idOrNumber }
      });
      if (directAppReq) {
        targetQuotationId = directAppReq.quotationId;
      }
    }

    const approvalRequests = await prisma.approvalRequest.findMany({
      where: { quotationId: targetQuotationId },
      include: {
        stepRecords: true
      },
      orderBy: { createdAt: 'asc' }
    });

    const requestIds = approvalRequests.map((r) => r.id);

    const auditLogs = await prisma.auditLog.findMany({
      where: {
        OR: [
          { entityId: targetQuotationId },
          { entityId: { in: requestIds } }
        ]
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true }
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    // Flatten step records across all approval requests
    const stepRecords = approvalRequests.flatMap((req) => req.stepRecords);
    stepRecords.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    // Enrich step records with approver details
    const approverIds = Array.from(new Set(stepRecords.map((s) => s.approverId).filter(Boolean)));
    const approvers = await prisma.user.findMany({
      where: { id: { in: approverIds } },
      select: { id: true, name: true, email: true, role: true }
    });
    const approverMap = new Map(approvers.map((u) => [u.id, u]));

    const enrichedStepRecords = stepRecords.map((s) => {
      const u = approverMap.get(s.approverId);
      return {
        ...s,
        approverName: u?.name || s.approverRole,
        approverEmail: u?.email || null,
        approverRole: u?.role || s.approverRole
      };
    });

    const enrichedAuditLogs = auditLogs.map((a) => ({
      ...a,
      userName: a.user?.name || 'System',
      userEmail: a.user?.email || null,
      userRole: a.user?.role || null
    }));

    const activeApprovalRequest = approvalRequests.length > 0 ? approvalRequests[approvalRequests.length - 1] : null;

    return {
      quotationId: targetQuotationId,
      approvalRequests,
      activeApprovalRequest,
      approvalRequest: activeApprovalRequest,
      stepRecords: enrichedStepRecords,
      auditLogs: enrichedAuditLogs
    };
  }

  /**
   * 5. GET /approvals/queue
   * Retrieves Manager Approval Queue with searching, filtering, and sorting.
   */
  async getQueue(filters?: {
    search?: string;
    riskLevel?: string;
    status?: string;
    salesRepId?: string;
    customerId?: string;
    sortBy?: 'riskScore' | 'amount' | 'date';
    sortOrder?: 'asc' | 'desc';
  }) {
    const whereQuotation: any = {};

    if (filters?.status && filters.status !== 'ALL') {
      whereQuotation.status = filters.status.toUpperCase();
    }

    if (filters?.salesRepId) {
      whereQuotation.userId = filters.salesRepId;
    }

    if (filters?.customerId) {
      whereQuotation.customerId = filters.customerId;
    }

    if (filters?.search) {
      const term = filters.search.trim().toLowerCase();
      whereQuotation.OR = [
        { quoteNumber: { contains: term } },
        { customerName: { contains: term } }
      ];
    }

    const quotations = await prisma.quotation.findMany({
      where: whereQuotation,
      include: {
        user: true,
        lines: { include: { product: true } },
        approvalRequests: { orderBy: { createdAt: 'desc' } }
      },
      orderBy: { updatedAt: 'desc' }
    });

    await discountsService.ensureDiscountConfigsSeeded();

    const items = await Promise.all(
      quotations.map(async (q: any) => {
        const riskInputLines = q.lines.map((l: any) => ({
          category: l.product?.category || 'Hardware',
          discountPercent: l.discount,
          lineTotal: l.totalPrice
        }));

        const risk = await discountsService.calculateRisk({
          customerTier: q.customerTier || 'GOLD',
          lines: riskInputLines
        });

        const score = risk.blendedRiskScore;
        let riskLevel = 'LOW';
        if (score > 75) riskLevel = 'CRITICAL';
        else if (score > 50) riskLevel = 'HIGH';
        else if (score > 25) riskLevel = 'MEDIUM';

        const activeAppReq = q.approvalRequests && q.approvalRequests.length > 0 ? q.approvalRequests[0] : null;
        const totalDiscount = q.lines.reduce((sum: number, l: any) => sum + ((l.unitPrice * l.quantity) - l.totalPrice), 0);
        const grossSubtotal = q.lines.reduce((sum: number, l: any) => sum + (l.unitPrice * l.quantity), 0);
        const overallDiscountPercent = grossSubtotal > 0 ? Number(((totalDiscount / grossSubtotal) * 100).toFixed(1)) : 0;

        return {
          id: activeAppReq?.id || q.id,
          quotationId: q.id,
          quoteNumber: q.quoteNumber,
          customerName: q.customerName || 'Customer Account',
          salesRepId: q.userId,
          salesRepName: q.user?.name || 'Sales Rep',
          totalAmount: q.totalAmount,
          discountPercent: overallDiscountPercent,
          riskScore: score,
          riskLevel,
          status: q.status,
          currentStep: activeAppReq?.currentStep || (q.status === 'PENDING_APPROVAL' ? 'MANAGER' : 'COMPLETED'),
          createdAt: q.createdAt,
          updatedAt: q.updatedAt
        };
      })
    );

    let filteredItems = items;

    if (filters?.riskLevel && filters.riskLevel !== 'ALL') {
      filteredItems = filteredItems.filter((i) => i.riskLevel.toUpperCase() === filters.riskLevel!.toUpperCase());
    }

    if (filters?.sortBy) {
      const order = filters.sortOrder === 'asc' ? 1 : -1;
      filteredItems.sort((a, b) => {
        if (filters.sortBy === 'riskScore') return (a.riskScore - b.riskScore) * order;
        if (filters.sortBy === 'amount') return (a.totalAmount - b.totalAmount) * order;
        if (filters.sortBy === 'date') return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * order;
        return 0;
      });
    }

    return filteredItems;
  }

  /**
   * 6. GET /approvals/:quotationId/detail
   * Retrieves complete 360-degree Approval Context for Manager Review.
   */
  async getApprovalDetail(idOrNumber: string) {
    if (!idOrNumber) {
      const err = new Error('quotationId is required');
      (err as any).statusCode = 400;
      throw err;
    }

    let quotation: any = await prisma.quotation.findFirst({
      where: { OR: [{ id: idOrNumber }, { quoteNumber: idOrNumber }] },
      include: {
        user: true,
        lines: { include: { product: true } },
        approvalRequests: {
          include: { stepRecords: true },
          orderBy: { createdAt: 'desc' }
        },
        comments: {
          include: { user: true },
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    if (!quotation) {
      const directAppReq = await prisma.approvalRequest.findUnique({
        where: { id: idOrNumber }
      });
      if (directAppReq) {
        quotation = await prisma.quotation.findUnique({
          where: { id: directAppReq.quotationId },
          include: {
            user: true,
            lines: { include: { product: true } },
            approvalRequests: {
              include: { stepRecords: true },
              orderBy: { createdAt: 'desc' }
            },
            comments: {
              include: { user: true },
              orderBy: { createdAt: 'asc' }
            }
          }
        });
      }
    }

    if (!quotation) {
      const err = new Error(`Quotation '${idOrNumber}' not found`);
      (err as any).statusCode = 404;
      throw err;
    }

    await discountsService.ensureDiscountConfigsSeeded();

    const customerTier = quotation.customerTier || 'GOLD';
    const tierConfig = await prisma.discountTier.findUnique({ where: { customerTier } });
    const maxTierDiscount = tierConfig?.maxDiscountPercent || 15;

    const categoryCeilings = await prisma.categoryDiscountCeiling.findMany();
    const ceilingMap = new Map(categoryCeilings.map((c) => [c.category.toLowerCase(), c.maxDiscountPercent]));

    let grossSubtotal = 0;
    let totalDiscountAmount = 0;
    let totalCostAmount = 0;
    let oneTimeTotal = 0;
    let recurringTotal = 0;

    const lineItemsDetail = quotation.lines.map((line: any) => {
      const category = line.product?.category || 'Hardware';
      const categoryLimit = ceilingMap.get(category.toLowerCase()) ?? ceilingMap.get(category.toLowerCase().replace(/s$/, '')) ?? 15;
      const allowedDiscountLimit = Math.min(maxTierDiscount, categoryLimit);

      const quantity = line.quantity;
      const unitPrice = line.unitPrice;
      const originalBasePrice = line.product?.basePrice || unitPrice;
      const grossLine = quantity * originalBasePrice;
      const discountPercent = line.discount;
      const discountAmount = grossLine * (discountPercent / 100);
      const finalUnitPrice = originalBasePrice * (1 - discountPercent / 100);
      const lineTotal = line.totalPrice || Math.max(0, grossLine - discountAmount);

      const marginPercent = line.product?.marginPercent || 30;
      const lineCost = lineTotal * (1 - marginPercent / 100);
      const lineProfit = lineTotal - lineCost;

      const discountExcess = Math.max(0, discountPercent - allowedDiscountLimit);
      const isViolation = discountExcess > 0;

      const isSubscription = category.toLowerCase().includes('sub') || (line.product?.type === 'SUBSCRIPTION');

      grossSubtotal += grossLine;
      totalDiscountAmount += discountAmount;
      totalCostAmount += lineCost;

      if (isSubscription) {
        recurringTotal += lineTotal;
      } else {
        oneTimeTotal += lineTotal;
      }

      return {
        id: line.id,
        productId: line.productId,
        productName: line.product?.name || line.productId,
        sku: line.product?.sku || 'SKU-N/A',
        category,
        quantity,
        unitPrice,
        originalBasePrice,
        discountPercent,
        discountAmount: Number(discountAmount.toFixed(2)),
        finalUnitPrice: Number(finalUnitPrice.toFixed(2)),
        lineTotal: Number(lineTotal.toFixed(2)),
        isSubscription,
        marginPercent,
        marginAmount: Number(lineProfit.toFixed(2)),
        allowedDiscountLimit,
        discountExcess: Number(discountExcess.toFixed(2)),
        isViolation,
        riskContribution: Number((discountExcess * (lineTotal / Math.max(1, quotation.totalAmount))).toFixed(2))
      };
    });

    const netTotal = Math.max(0, grossSubtotal - totalDiscountAmount);
    const overallDiscountPercent = grossSubtotal > 0 ? Number(((totalDiscountAmount / grossSubtotal) * 100).toFixed(1)) : 0;
    const totalProfit = netTotal - totalCostAmount;
    const overallMarginPercent = netTotal > 0 ? Number(((totalProfit / netTotal) * 100).toFixed(1)) : 0;

    const riskInputLines = lineItemsDetail.map((l: any) => ({
      category: l.category,
      discountPercent: l.discountPercent,
      lineTotal: l.lineTotal
    }));

    const riskResult = await discountsService.calculateRisk({
      customerTier,
      lines: riskInputLines
    });

    const blendedRiskScore = riskResult.blendedRiskScore;
    let riskLevel = 'LOW';
    if (blendedRiskScore > 75) riskLevel = 'CRITICAL';
    else if (blendedRiskScore > 50) riskLevel = 'HIGH';
    else if (blendedRiskScore > 25) riskLevel = 'MEDIUM';

    const riskFactors: string[] = [];
    let highestDiscountViolation = 0;
    let violatedLinesCount = 0;

    lineItemsDetail.forEach((line: any) => {
      if (line.isViolation) {
        violatedLinesCount++;
        if (line.discountExcess > highestDiscountViolation) {
          highestDiscountViolation = line.discountExcess;
        }
        riskFactors.push(`${line.productName} (${line.category}) discount of ${line.discountPercent}% exceeds allowed limit of ${line.allowedDiscountLimit}% by ${line.discountExcess}%`);
      }
    });

    if (overallDiscountPercent > maxTierDiscount) {
      riskFactors.push(`Overall quotation discount (${overallDiscountPercent}%) exceeds ${customerTier} tier ceiling of ${maxTierDiscount}%`);
    }

    if (riskFactors.length === 0) {
      riskFactors.push('No discount violations detected. All line items are within governance limits.');
    }

    const history = await this.getHistory(quotation.id);

    let customerObj: any = null;
    if (quotation.customerId) {
      customerObj = await prisma.user.findUnique({ where: { id: quotation.customerId } });
    }
    if (!customerObj && quotation.customerName) {
      customerObj = await prisma.user.findFirst({
        where: {
          role: 'CUSTOMER',
          OR: [
            { email: { contains: quotation.customerName.toLowerCase() } },
            { name: { contains: quotation.customerName } }
          ]
        }
      });
    }

    const customerInfo = {
      name: quotation.customerName || customerObj?.name || 'Customer Account',
      company: customerObj?.company || 'Globex Enterprise Solutions',
      email: customerObj?.email || 'customer@globex.com',
      phone: customerObj?.phone || '+1 (555) 234-5678',
      tier: customerTier,
      allowedDiscountLimit: maxTierDiscount
    };

    const quoteInfo = {
      id: quotation.id,
      quoteNumber: quotation.quoteNumber,
      status: quotation.status,
      createdAt: quotation.createdAt,
      updatedAt: quotation.updatedAt,
      expirationDate: new Date(new Date(quotation.createdAt).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      currency: 'USD',
      salesRep: {
        id: quotation.userId,
        name: quotation.user?.name || 'Sales Rep',
        email: quotation.user?.email || 'rep@dealflow360.com'
      }
    };

    const totals = {
      subtotal: Number(grossSubtotal.toFixed(2)),
      totalDiscountAmount: Number(totalDiscountAmount.toFixed(2)),
      overallDiscountPercent,
      taxAmount: 0.00,
      shippingCharges: 0.00,
      oneTimeTotal: Number(oneTimeTotal.toFixed(2)),
      recurringTotal: Number(recurringTotal.toFixed(2)),
      grandTotal: Number(netTotal.toFixed(2))
    };

    const riskAnalysis = {
      blendedRiskScore,
      riskLevel,
      riskFactors,
      violatedLinesCount,
      highestDiscountViolationPercent: Number(highestDiscountViolation.toFixed(2)),
      overallDiscountPercent,
      totalMarginPercent: overallMarginPercent
    };

    const comments = quotation.comments || [];
    const counterOfferComment = comments.slice().reverse().find((c: any) => c.text && c.text.toLowerCase().includes('counter'));

    const negotiationInfo = counterOfferComment ? {
      hasNegotiation: true,
      previousDiscountPercent: Math.max(0, overallDiscountPercent - 5),
      requestedDiscountPercent: overallDiscountPercent,
      discountDeltaPercent: 5.0,
      customerComments: counterOfferComment.text,
      requestedAt: counterOfferComment.createdAt
    } : null;

    return {
      quotation: quoteInfo,
      customer: customerInfo,
      lineItems: lineItemsDetail,
      totals,
      discountAnalysis: lineItemsDetail.map((l: any) => ({
        productName: l.productName,
        category: l.category,
        actualDiscount: l.discountPercent,
        allowedDiscount: l.allowedDiscountLimit,
        excess: l.discountExcess,
        status: l.isViolation ? 'Violation' : 'Within Limit',
        riskContribution: l.riskContribution
      })),
      riskAnalysis,
      approvalHistory: history.stepRecords,
      auditLogs: history.auditLogs,
      negotiationInfo,
      activeApprovalRequest: history.activeApprovalRequest
    };
  }
}

export const approvalsService = new ApprovalsService();
