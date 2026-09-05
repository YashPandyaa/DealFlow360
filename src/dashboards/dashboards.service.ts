// src/dashboards/dashboards.service.ts
import { prisma } from '../../shared/prisma';
import { discountsService } from '../../discounts/discounts.service';

export class DashboardsService {
  /**
   * 1. ADMIN DASHBOARD DATA
   * System overview, configurations, user management & platform metrics.
   */
  async getAdminDashboard() {
    await discountsService.ensureDiscountConfigsSeeded();

    const [
      totalCustomers,
      totalProducts,
      totalQuotations,
      totalReps,
      pendingApprovals,
      approvedQuotations,
      activeSubscriptions,
      discountTiers,
      categoryCeilings,
      approvalChains,
      products,
      users,
      warehouses
    ] = await Promise.all([
      prisma.user.count({ where: { role: 'CUSTOMER' } }),
      prisma.product.count(),
      prisma.quotation.count(),
      prisma.user.count({ where: { role: 'REP' } }),
      prisma.approvalRequest.count({ where: { status: 'PENDING' } }),
      prisma.quotation.count({ where: { status: { in: ['APPROVED', 'READY_FOR_FULFILLMENT'] } } }),
      prisma.subscription.count({ where: { status: 'ACTIVE' } }),
      prisma.discountTier.findMany({ orderBy: { createdAt: 'asc' } }),
      prisma.categoryDiscountCeiling.findMany({ orderBy: { category: 'asc' } }),
      prisma.approvalChain.findMany({ orderBy: { minRiskScore: 'asc' } }),
      prisma.product.findMany({ orderBy: { createdAt: 'desc' }, take: 20 }),
      prisma.user.findMany({ select: { id: true, name: true, email: true, role: true, createdAt: true }, orderBy: { createdAt: 'desc' } }),
      prisma.warehouse.findMany().catch(() => [])
    ]);

    const totalOrders = await prisma.quotation.count({ where: { status: { in: ['CONFIRMED', 'FULFILLED', 'ALLOCATED'] } } });

    return {
      overview: {
        totalCustomers,
        totalProducts,
        totalQuotations,
        totalReps,
        pendingApprovals,
        approvedQuotations,
        activeSubscriptions,
        totalOrders
      },
      configurations: {
        discountTiers,
        categoryCeilings,
        approvalChains
      },
      products,
      users,
      warehouses
    };
  }

  /**
   * 2. SALES MANAGER DASHBOARD DATA
   * Approvals queue, risk score monitoring, team sales performance.
   */
  async getManagerDashboard(managerId: string) {
    await discountsService.ensureDiscountConfigsSeeded();

    const pendingRequests = await prisma.approvalRequest.findMany({
      where: { status: 'PENDING' },
      include: {
        quotation: {
          include: {
            user: true,
            lines: { include: { product: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    let totalValueAwaitingApproval = 0;
    let highRiskCount = 0;
    let criticalRiskCount = 0;

    const approvalQueue = await Promise.all(
      pendingRequests.map(async (req) => {
        const q = req.quotation;
        totalValueAwaitingApproval += q.totalAmount;

        const score = req.blendedRiskScore;
        let riskLevel = 'LOW';
        if (score > 75) {
          riskLevel = 'CRITICAL';
          criticalRiskCount++;
        } else if (score > 50) {
          riskLevel = 'HIGH';
          highRiskCount++;
        } else if (score > 25) {
          riskLevel = 'MEDIUM';
        }

        const totalDisc = q.lines.reduce((s, l) => s + ((l.unitPrice * l.quantity) - l.totalPrice), 0);
        const gross = q.lines.reduce((s, l) => s + (l.unitPrice * l.quantity), 0);
        const discountPercent = gross > 0 ? Number(((totalDisc / gross) * 100).toFixed(1)) : 0;

        return {
          id: req.id,
          quotationId: q.id,
          quoteNumber: q.quoteNumber,
          customerName: q.customerName || 'Customer Account',
          salesRepName: q.user?.name || 'Sales Rep',
          totalAmount: q.totalAmount,
          discountPercent,
          riskScore: score,
          riskLevel,
          currentStep: req.currentStep,
          status: req.status,
          createdAt: req.createdAt
        };
      })
    );

    const todayStr = new Date().toISOString().split('T')[0];
    const approvedToday = await prisma.approvalStepRecord.count({
      where: { action: 'APPROVED', createdAt: { gte: new Date(todayStr) } }
    });
    const rejectedToday = await prisma.approvalStepRecord.count({
      where: { action: 'REJECTED', createdAt: { gte: new Date(todayStr) } }
    });

    const recentQuotations = await prisma.quotation.findMany({
      take: 10,
      orderBy: { updatedAt: 'desc' },
      include: { user: true }
    });

    return {
      metrics: {
        pendingApprovalsCount: approvalQueue.length,
        highRiskCount,
        criticalRiskCount,
        approvedToday,
        rejectedToday,
        totalValueAwaitingApproval: Number(totalValueAwaitingApproval.toFixed(2))
      },
      approvalQueue,
      recentQuotations
    };
  }

  /**
   * 3. SALES REPRESENTATIVE DASHBOARD DATA
   * Own deals overview, quotation creation status, deal health, upsell recommendations.
   */
  async getSalesRepDashboard(repId: string) {
    const quotations = await prisma.quotation.findMany({
      where: { userId: repId },
      include: {
        lines: { include: { product: true } },
        approvalRequests: { orderBy: { createdAt: 'desc' } }
      },
      orderBy: { updatedAt: 'desc' }
    });

    const totalSalesValue = quotations.reduce((acc, q) => acc + q.totalAmount, 0);
    const draftCount = quotations.filter((q) => q.status === 'DRAFT').length;
    const sentCount = quotations.filter((q) => q.status === 'SENT').length;
    const pendingApprovalCount = quotations.filter((q) => q.status === 'PENDING_APPROVAL').length;
    const approvedCount = quotations.filter((q) => q.status === 'APPROVED' || q.status === 'READY_FOR_FULFILLMENT').length;
    const rejectedCount = quotations.filter((q) => q.status === 'REJECTED').length;
    const confirmedCount = quotations.filter((q) => q.status === 'CONFIRMED' || q.status === 'FULFILLED').length;

    // Stalled / Negotiation deals
    const myDealsHealth = quotations.filter((q) => q.status === 'PENDING_APPROVAL' || q.status === 'DRAFT').slice(0, 5);

    return {
      overview: {
        totalQuotations: quotations.length,
        totalSalesValue: Number(totalSalesValue.toFixed(2)),
        draftCount,
        sentCount,
        pendingApprovalCount,
        approvedCount,
        rejectedCount,
        confirmedCount
      },
      myQuotations: quotations.slice(0, 10),
      myDealsHealth
    };
  }

  /**
   * 4. FINANCE & OPERATIONS DASHBOARD DATA
   * Finance approvals, invoices, payments, subscriptions, fulfillment & warehouses.
   */
  async getFinanceDashboard() {
    const financeApprovals = await prisma.approvalRequest.findMany({
      where: { currentStep: 'FINANCE', status: 'PENDING' },
      include: {
        quotation: { include: { user: true } }
      }
    });

    const billingEntries = await prisma.billingScheduleEntry.findMany().catch(() => []);
    const totalInvoices = billingEntries.length;
    const paidInvoices = billingEntries.filter((b) => b.status === 'PAID').length;
    const pendingInvoices = billingEntries.filter((b) => b.status === 'INVOICED' || b.status === 'UPCOMING').length;
    const totalRevenue = billingEntries.filter((b) => b.status === 'PAID').reduce((sum, b) => sum + b.amount, 0);

    const subscriptions = await prisma.subscription.findMany({
      include: { plan: true }
    }).catch(() => []);

    const activeSubscriptionsCount = subscriptions.filter((s) => s.status === 'ACTIVE').length;

    const fulfillmentOrders = await prisma.quotation.findMany({
      where: { status: { in: ['READY_FOR_FULFILLMENT', 'ALLOCATED', 'FULFILLED'] } },
      take: 10,
      orderBy: { updatedAt: 'desc' }
    });

    const warehouses = await prisma.warehouse.findMany({
      include: { stockItems: { include: { product: true } } }
    }).catch(() => []);

    return {
      metrics: {
        financeApprovalsCount: financeApprovals.length,
        totalInvoices,
        paidInvoices,
        pendingInvoices,
        totalRevenue: Number(totalRevenue.toFixed(2)),
        activeSubscriptionsCount
      },
      financeApprovals,
      billingEntries: billingEntries.slice(0, 10),
      subscriptions: subscriptions.slice(0, 10),
      fulfillmentOrders,
      warehouses
    };
  }

  /**
   * 5. CUSTOMER DASHBOARD / PORTAL DATA
   * Customer's own quotations, counter-offers, confirmed orders, subscriptions, invoices.
   * Stripped of all internal risk scores, margin percentages, and internal comments.
   */
  async getCustomerDashboard(customerId: string, userEmail?: string) {
    const userConditions: any[] = [{ customerId }];
    if (userEmail) {
      const prefix = userEmail.split('@')[0];
      userConditions.push({ customerName: { contains: prefix } });
    }

    const quotations = await prisma.quotation.findMany({
      where: { OR: userConditions },
      include: {
        lines: { include: { product: true } }
      },
      orderBy: { updatedAt: 'desc' }
    });

    const pendingQuotes = quotations.filter((q) => q.status === 'PENDING_APPROVAL' || q.status === 'SENT');
    const underNegotiation = quotations.filter((q) => q.status === 'UNDER_NEGOTIATION');
    const confirmedOrders = quotations.filter((q) => q.status === 'CONFIRMED' || q.status === 'FULFILLED' || q.status === 'READY_FOR_FULFILLMENT');

    const sanitizedQuotations = quotations.map((q) => ({
      id: q.id,
      quoteNumber: q.quoteNumber,
      customerName: q.customerName,
      customerTier: q.customerTier,
      status: q.status,
      totalAmount: q.totalAmount,
      createdAt: q.createdAt,
      updatedAt: q.updatedAt,
      lines: q.lines.map((l) => ({
        id: l.id,
        productName: l.product?.name,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discountPercent: l.discount,
        lineTotal: l.totalPrice
      }))
    }));

    return {
      summary: {
        totalQuotations: quotations.length,
        pendingQuotesCount: pendingQuotes.length,
        underNegotiationCount: underNegotiation.length,
        confirmedOrdersCount: confirmedOrders.length
      },
      quotations: sanitizedQuotations
    };
  }
}

export const dashboardsService = new DashboardsService();
