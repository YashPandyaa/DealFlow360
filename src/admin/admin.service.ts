// src/admin/admin.service.ts
import { prisma } from '../../shared/prisma';
import { discountsService } from '../../discounts/discounts.service';

export interface StatisticsFilter {
  from?: string;
  to?: string;
  datePreset?: 'TODAY' | '7D' | '30D' | 'THIS_MONTH' | 'LAST_MONTH' | 'THIS_YEAR' | 'ALL';
  salesRepId?: string;
  customerId?: string;
  customerTier?: string;
  category?: string;
  warehouseId?: string;
  status?: string;
  riskLevel?: string;
  approvalStatus?: string;
}

export class AdminService {
  /**
   * Calculates comprehensive live statistics from authoritative Prisma database records.
   */
  async getOverviewStatistics(filters: StatisticsFilter = {}) {
    await discountsService.ensureDiscountConfigsSeeded();

    // 1. Resolve date boundaries
    let startDate: Date | undefined;
    let endDate: Date | undefined;

    if (filters.from) {
      startDate = new Date(filters.from);
    }
    if (filters.to) {
      endDate = new Date(filters.to);
    }

    if (!startDate && filters.datePreset) {
      const now = new Date();
      if (filters.datePreset === 'TODAY') {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else if (filters.datePreset === '7D') {
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (filters.datePreset === '30D') {
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      } else if (filters.datePreset === 'THIS_MONTH') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      } else if (filters.datePreset === 'LAST_MONTH') {
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0);
      } else if (filters.datePreset === 'THIS_YEAR') {
        startDate = new Date(now.getFullYear(), 0, 1);
      }
    }

    const whereQuote: any = {};

    if (startDate || endDate) {
      whereQuote.createdAt = {};
      if (startDate) whereQuote.createdAt.gte = startDate;
      if (endDate) whereQuote.createdAt.lte = endDate;
    }

    if (filters.salesRepId) whereQuote.userId = filters.salesRepId;
    if (filters.customerId) whereQuote.customerId = filters.customerId;
    if (filters.customerTier) whereQuote.customerTier = filters.customerTier.toUpperCase();
    if (filters.status && filters.status !== 'ALL') whereQuote.status = filters.status.toUpperCase();

    // Fetch all relevant quotations
    const quotations: any[] = await prisma.quotation.findMany({
      where: whereQuote,
      include: {
        user: true,
        lines: { include: { product: true } },
        approvalRequests: { include: { stepRecords: true }, orderBy: { createdAt: 'desc' } },
        comments: true
      },
      orderBy: { createdAt: 'desc' }
    });

    // --------------------------------------------------------------------------
    // A. QUOTATION STATISTICS
    // --------------------------------------------------------------------------
    const totalQuotations = quotations.length;
    const draftQuotations = quotations.filter((q) => q.status === 'DRAFT').length;
    const sentQuotations = quotations.filter((q) => q.status === 'SENT').length;
    const pendingApprovalQuotations = quotations.filter((q) => q.status === 'PENDING_APPROVAL').length;
    const approvedQuotations = quotations.filter((q) => q.status === 'APPROVED' || q.status === 'READY_FOR_FULFILLMENT').length;
    const rejectedQuotations = quotations.filter((q) => q.status === 'REJECTED' || q.status === 'RETURNED_FOR_REVISION').length;
    const underNegotiationQuotations = quotations.filter((q) => q.comments && q.comments.some((c: any) => c.text?.toLowerCase().includes('counter') || c.text?.toLowerCase().includes('negotiat'))).length;
    const confirmedQuotations = quotations.filter((q) => q.status === 'CONFIRMED' || q.status === 'FULFILLED' || q.status === 'ALLOCATED').length;
    const cancelledQuotations = quotations.filter((q) => q.status === 'CANCELLED').length;

    // --------------------------------------------------------------------------
    // B. SALES STATISTICS
    // --------------------------------------------------------------------------
    const totalSalesValue = quotations.reduce((acc, q) => acc + q.totalAmount, 0);
    const confirmedQuotesList = quotations.filter((q) => ['CONFIRMED', 'FULFILLED', 'ALLOCATED', 'READY_FOR_FULFILLMENT', 'APPROVED'].includes(q.status));
    const totalConfirmedSales = confirmedQuotesList.reduce((acc, q) => acc + q.totalAmount, 0);
    const averageDealValue = totalQuotations > 0 ? Number((totalSalesValue / totalQuotations).toFixed(2)) : 0;
    const conversionRate = totalQuotations > 0 ? Number(((confirmedQuotations / totalQuotations) * 100).toFixed(1)) : 0;

    // Sales by Rep
    const repSalesMap = new Map<string, { repId: string; repName: string; totalValue: number; count: number }>();
    // Sales by Customer
    const customerSalesMap = new Map<string, { customerName: string; totalValue: number; count: number }>();
    // Sales by Category
    const categorySalesMap = new Map<string, { category: string; totalValue: number; qty: number }>();

    quotations.forEach((q) => {
      const repName = q.user?.name || 'Sales Rep';
      const repId = q.userId;
      const repEntry = repSalesMap.get(repId) || { repId, repName, totalValue: 0, count: 0 };
      repEntry.totalValue += q.totalAmount;
      repEntry.count += 1;
      repSalesMap.set(repId, repEntry);

      const custName = q.customerName || 'Customer Account';
      const custEntry = customerSalesMap.get(custName) || { customerName: custName, totalValue: 0, count: 0 };
      custEntry.totalValue += q.totalAmount;
      custEntry.count += 1;
      customerSalesMap.set(custName, custEntry);

      q.lines.forEach((l: any) => {
        const cat = l.product?.category || 'Hardware';
        const catEntry = categorySalesMap.get(cat) || { category: cat, totalValue: 0, qty: 0 };
        catEntry.totalValue += l.totalPrice;
        catEntry.qty += l.quantity;
        categorySalesMap.set(cat, catEntry);
      });
    });

    // --------------------------------------------------------------------------
    // C. DISCOUNT & RISK STATISTICS
    // --------------------------------------------------------------------------
    let maxDiscountPercent = 0;
    let totalDiscountAmount = 0;
    let totalGrossSubtotal = 0;
    let quotationsWithViolationsCount = 0;

    const riskEvaluations = await Promise.all(
      quotations.map(async (q) => {
        const riskInputLines = q.lines.map((l: any) => ({
          productId: l.productId,
          productName: l.product?.name || l.product?.category || 'Product',
          category: l.product?.category || 'Hardware',
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          costPrice: l.costPrice || l.product?.costPrice || (l.product?.marginPercent ? l.unitPrice * (1 - l.product.marginPercent / 100) : 0),
          discountPercent: l.discount,
          lineTotal: l.totalPrice
        }));

        const risk = await discountsService.calculateRisk({
          quotationId: q.id,
          salesRepId: q.userId,
          customerTier: q.customerTier || 'GOLD',
          customerId: q.customerId || undefined,
          customerName: q.customerName || undefined,
          lines: riskInputLines
        });

        const gross = q.lines.reduce((sum: number, l: any) => sum + (l.unitPrice * l.quantity), 0);
        const disc = q.lines.reduce((sum: number, l: any) => sum + ((l.unitPrice * l.quantity) - l.totalPrice), 0);
        totalGrossSubtotal += gross;
        totalDiscountAmount += disc;

        const maxLineDisc = q.lines.reduce((max: number, l: any) => Math.max(max, l.discount), 0);
        if (maxLineDisc > maxDiscountPercent) maxDiscountPercent = maxLineDisc;

        if (risk.flaggedLines.length > 0) quotationsWithViolationsCount++;

        return {
          quotation: q,
          risk
        };
      })
    );

    const averageDiscountPercent = totalGrossSubtotal > 0 ? Number(((totalDiscountAmount / totalGrossSubtotal) * 100).toFixed(1)) : 0;

    let lowRiskCount = 0;
    let mediumRiskCount = 0;
    let highRiskCount = 0;
    let criticalRiskCount = 0;
    let totalRiskSum = 0;

    const topRiskyQuotationsList: any[] = [];

    riskEvaluations.forEach(({ quotation: q, risk }) => {
      const score = risk.blendedRiskScore;
      totalRiskSum += score;

      let riskLevel = 'LOW';
      if (score > 75) {
        riskLevel = 'CRITICAL';
        criticalRiskCount++;
      } else if (score > 50) {
        riskLevel = 'HIGH';
        highRiskCount++;
      } else if (score > 25) {
        riskLevel = 'MEDIUM';
        mediumRiskCount++;
      } else {
        lowRiskCount++;
      }

      if (score > 0 || q.status === 'PENDING_APPROVAL') {
        const lineGross = q.lines.reduce((s: number, l: any) => s + (l.unitPrice * l.quantity), 0);
        const lineDisc = q.lines.reduce((s: number, l: any) => s + ((l.unitPrice * l.quantity) - l.totalPrice), 0);
        const discPct = lineGross > 0 ? Number(((lineDisc / lineGross) * 100).toFixed(1)) : 0;

        topRiskyQuotationsList.push({
          id: q.id,
          quoteNumber: q.quoteNumber,
          customerName: q.customerName || 'Customer Account',
          riskScore: score,
          riskLevel,
          discountPercent: discPct,
          status: q.status
        });
      }
    });

    topRiskyQuotationsList.sort((a, b) => b.riskScore - a.riskScore);

    const averageRiskScore = totalQuotations > 0 ? Number((totalRiskSum / totalQuotations).toFixed(1)) : 0;

    // --------------------------------------------------------------------------
    // D. APPROVAL STATISTICS
    // --------------------------------------------------------------------------
    const allApprovalRequests = await prisma.approvalRequest.findMany({
      include: { stepRecords: true }
    });

    const pendingApprovals = allApprovalRequests.filter((a) => a.status === 'PENDING').length;
    const todayStr = new Date().toISOString().split('T')[0];
    const approvedToday = allApprovalRequests.filter((a) => a.status === 'APPROVED' && a.updatedAt.toISOString().startsWith(todayStr)).length;
    const rejectedToday = allApprovalRequests.filter((a) => a.status === 'REJECTED' && a.updatedAt.toISOString().startsWith(todayStr)).length;
    const approvalRate = allApprovalRequests.length > 0 ? Number(((allApprovalRequests.filter((a) => a.status === 'APPROVED').length / allApprovalRequests.length) * 100).toFixed(1)) : 100;

    // --------------------------------------------------------------------------
    // E. CUSTOMER STATISTICS
    // --------------------------------------------------------------------------
    const totalCustomers = await prisma.user.count({ where: { role: 'CUSTOMER' } });

    const tierBreakdownMap = new Map<string, number>();
    quotations.forEach((q) => {
      const tier = q.customerTier || 'GOLD';
      tierBreakdownMap.set(tier, (tierBreakdownMap.get(tier) || 0) + 1);
    });

    // --------------------------------------------------------------------------
    // F. PRODUCT STATISTICS
    // --------------------------------------------------------------------------
    const totalProducts = await prisma.product.count();
    const activeProducts = totalProducts;

    const productSalesMap = new Map<string, { product: any; qtySold: number; revenue: number; totalDiscountPct: number; count: number }>();
    quotations.forEach((q) => {
      q.lines.forEach((l: any) => {
        const prodId = l.productId;
        const entry = productSalesMap.get(prodId) || {
          product: l.product,
          qtySold: 0,
          revenue: 0,
          totalDiscountPct: 0,
          count: 0
        };
        entry.qtySold += l.quantity;
        entry.revenue += l.totalPrice;
        entry.totalDiscountPct += l.discount;
        entry.count += 1;
        productSalesMap.set(prodId, entry);
      });
    });

    const topProducts = Array.from(productSalesMap.values()).map((p) => ({
      productId: p.product?.id,
      name: p.product?.name || 'Product',
      category: p.product?.category || 'Hardware',
      quantitySold: p.qtySold,
      revenue: Number(p.revenue.toFixed(2)),
      averageDiscount: p.count > 0 ? Number((p.totalDiscountPct / p.count).toFixed(1)) : 0,
      marginPercent: p.product?.marginPercent || 30
    }));

    topProducts.sort((a, b) => b.revenue - a.revenue);

    // --------------------------------------------------------------------------
    // G. FULFILLMENT & BILLING STATISTICS
    // --------------------------------------------------------------------------
    const ordersAwaitingFulfillment = quotations.filter((q) => q.status === 'READY_FOR_FULFILLMENT' || q.status === 'PENDING_APPROVAL').length;
    const fullyFulfilled = quotations.filter((q) => q.status === 'FULFILLED' || q.status === 'CONFIRMED').length;
    const partiallyFulfilled = quotations.filter((q) => q.status === 'ALLOCATED').length;

    const billingEntries: any[] = await prisma.billingScheduleEntry.findMany().catch(() => []);
    const totalInvoices = billingEntries.length;
    const paidInvoices = billingEntries.filter((b) => b.status === 'PAID').length;
    const pendingInvoices = billingEntries.filter((b) => b.status === 'INVOICED' || b.status === 'UPCOMING').length;
    const overdueInvoices = 0;
    const totalPaidRevenue = billingEntries.filter((b) => b.status === 'PAID').reduce((acc, b) => acc + (b.amount || 0), 0);

    const subscriptions = await prisma.subscription.findMany().catch(() => []);
    const activeSubscriptions = subscriptions.filter((s) => s.status === 'ACTIVE').length;

    return {
      quotations: {
        total: totalQuotations,
        draft: draftQuotations,
        sent: sentQuotations,
        pending_approval: pendingApprovalQuotations,
        approved: approvedQuotations,
        rejected: rejectedQuotations,
        under_negotiation: underNegotiationQuotations,
        confirmed: confirmedQuotations,
        cancelled: cancelledQuotations
      },
      sales: {
        total_value: Number(totalSalesValue.toFixed(2)),
        total_confirmed_sales: Number(totalConfirmedSales.toFixed(2)),
        average_deal_value: averageDealValue,
        number_of_deals: totalQuotations,
        conversion_rate: conversionRate,
        sales_by_rep: Array.from(repSalesMap.values()),
        sales_by_customer: Array.from(customerSalesMap.values()),
        sales_by_category: Array.from(categorySalesMap.values())
      },
      discounts: {
        average_discount_percent: averageDiscountPercent,
        maximum_discount_percent: maxDiscountPercent,
        total_discount_amount: Number(totalDiscountAmount.toFixed(2)),
        quotations_with_violations: quotationsWithViolationsCount,
        number_of_approval_requests: allApprovalRequests.length,
        approval_rate: approvalRate
      },
      risk: {
        average_score: averageRiskScore,
        low: lowRiskCount,
        medium: mediumRiskCount,
        high: highRiskCount,
        critical: criticalRiskCount,
        top_risky_quotations: topRiskyQuotationsList.slice(0, 10)
      },
      approvals: {
        pending: pendingApprovals,
        approved_today: approvedToday,
        rejected_today: rejectedToday,
        approval_rate: approvalRate,
        funnel: {
          created: totalQuotations,
          submitted: allApprovalRequests.length,
          approved: approvedQuotations,
          confirmed: confirmedQuotations
        }
      },
      customers: {
        total: totalCustomers,
        active: totalCustomers,
        with_open_quotes: pendingApprovalQuotations + sentQuotations,
        under_negotiation: underNegotiationQuotations,
        confirmed_orders: confirmedQuotations,
        top_customers: Array.from(customerSalesMap.values()).sort((a, b) => b.totalValue - a.totalValue).slice(0, 5),
        tier_distribution: Object.fromEntries(tierBreakdownMap)
      },
      products: {
        total: totalProducts,
        active: activeProducts,
        top_selling: topProducts.slice(0, 10)
      },
      fulfillment: {
        awaiting_fulfillment: ordersAwaitingFulfillment,
        fully_fulfilled: fullyFulfilled,
        partially_fulfilled: partiallyFulfilled
      },
      billing: {
        total_invoices: totalInvoices,
        paid_invoices: paidInvoices,
        pending_invoices: pendingInvoices,
        overdue_invoices: overdueInvoices,
        total_revenue: totalPaidRevenue > 0 ? totalPaidRevenue : totalConfirmedSales,
        active_subscriptions: activeSubscriptions
      }
    };
  }
}

export const adminService = new AdminService();
