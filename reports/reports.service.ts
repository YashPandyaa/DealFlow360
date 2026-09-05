// reports/reports.service.ts
import { prisma } from '../shared/prisma';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

export interface QuotationReportFilter {
  from?: string | Date;
  to?: string | Date;
  salesRepId?: string;
  teamId?: string;
  approvalStatus?: string;
  category?: string;
  page?: number;
  limit?: number;
}

export interface DealHealthOptions {
  stalledDays?: number;
  discountAnomalyMultiplier?: number;
  minHistoryFloor?: number;
}

export class ReportsService {
  // ==========================================================================
  // 1. Filtered Quotations Report
  // ==========================================================================

  async getQuotationsReport(filter: QuotationReportFilter = {}) {
    const where: any = {};

    // Date range filter
    if (filter.from || filter.to) {
      where.createdAt = {};
      if (filter.from) where.createdAt.gte = new Date(filter.from);
      if (filter.to) where.createdAt.lte = new Date(filter.to);
    }

    // Sales Rep filter
    if (filter.salesRepId) {
      where.userId = filter.salesRepId;
    }

    // Team filter
    if (filter.teamId) {
      where.user = {
        teamId: filter.teamId
      };
    }

    // Status / Approval Status filter
    if (filter.approvalStatus) {
      where.status = filter.approvalStatus;
    }

    // Category filter
    if (filter.category) {
      where.lines = {
        some: {
          product: {
            category: filter.category
          }
        }
      };
    }

    const page = Math.max(1, Number(filter.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(filter.limit) || 20));
    const skip = (page - 1) * limit;

    const [totalCount, rawQuotations] = await Promise.all([
      prisma.quotation.count({ where }),
      prisma.quotation.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              teamId: true,
              role: true
            }
          },
          lines: {
            include: {
              product: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      })
    ]);

    const quotations = rawQuotations.map((q) => ({
      id: q.id,
      quoteNumber: q.quoteNumber,
      userId: q.userId,
      salesRep: {
        id: q.user.id,
        name: q.user.name || 'Unknown Rep',
        email: q.user.email,
        teamId: q.user.teamId
      },
      customerName: q.customerName || q.user.name || 'Customer',
      status: q.status,
      totalAmount: q.totalAmount,
      linesCount: q.lines.length,
      lines: q.lines.map((l) => ({
        id: l.id,
        productId: l.productId,
        productName: l.product?.name || 'Unknown Product',
        category: l.product?.category || 'General',
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discount: l.discount,
        totalPrice: l.totalPrice
      })),
      targetDeliveryDate: q.targetDeliveryDate,
      actualDeliveryDate: q.actualDeliveryDate,
      createdAt: q.createdAt,
      updatedAt: q.updatedAt
    }));

    return {
      quotations,
      totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit) || 1
    };
  }

  // ==========================================================================
  // 2. Export Generator (PDF / XLSX / CSV)
  // ==========================================================================

  async exportReport(
    filter: QuotationReportFilter = {},
    format: string = 'pdf'
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    // Fetch all matching records without pagination
    const where: any = {};
    if (filter.from || filter.to) {
      where.createdAt = {};
      if (filter.from) where.createdAt.gte = new Date(filter.from);
      if (filter.to) where.createdAt.lte = new Date(filter.to);
    }
    if (filter.salesRepId) where.userId = filter.salesRepId;
    if (filter.teamId) where.user = { teamId: filter.teamId };
    if (filter.approvalStatus) where.status = filter.approvalStatus;
    if (filter.category) {
      where.lines = { some: { product: { category: filter.category } } };
    }

    const rawQuotations = await prisma.quotation.findMany({
      where,
      include: {
        user: true,
        lines: { include: { product: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    const formatLower = (format || 'pdf').toLowerCase();

    if (formatLower === 'xlsx') {
      const buffer = await this.generateExcel(rawQuotations);
      return {
        buffer,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        filename: 'quotations-report.xlsx'
      };
    } else if (formatLower === 'csv') {
      const buffer = this.generateCSV(rawQuotations);
      return {
        buffer,
        contentType: 'text/csv',
        filename: 'quotations-report.csv'
      };
    } else {
      // Default PDF
      const buffer = await this.generatePDF(rawQuotations);
      return {
        buffer,
        contentType: 'application/pdf',
        filename: 'quotations-report.pdf'
      };
    }
  }

  private async generateExcel(quotations: any[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Quotations Report');

    worksheet.columns = [
      { header: 'Quote Number', key: 'quoteNumber', width: 20 },
      { header: 'Customer Name', key: 'customerName', width: 25 },
      { header: 'Sales Rep', key: 'salesRep', width: 25 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Total Amount ($)', key: 'totalAmount', width: 18 },
      { header: 'Items Count', key: 'linesCount', width: 14 },
      { header: 'Created Date', key: 'createdAt', width: 22 }
    ];

    for (const q of quotations) {
      worksheet.addRow({
        quoteNumber: q.quoteNumber,
        customerName: q.customerName || q.user?.name || 'Customer',
        salesRep: q.user?.name || q.user?.email || 'Unknown Rep',
        status: q.status,
        totalAmount: q.totalAmount.toFixed(2),
        linesCount: q.lines ? q.lines.length : 0,
        createdAt: new Date(q.createdAt).toISOString().split('T')[0]
      });
    }

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  private generateCSV(quotations: any[]): Buffer {
    const headers = ['Quote Number', 'Customer Name', 'Sales Rep', 'Status', 'Total Amount', 'Items Count', 'Created Date'];
    const rows = quotations.map((q) => [
      `"${q.quoteNumber}"`,
      `"${(q.customerName || q.user?.name || 'Customer').replace(/"/g, '""')}"`,
      `"${(q.user?.name || q.user?.email || 'Unknown Rep').replace(/"/g, '""')}"`,
      `"${q.status}"`,
      q.totalAmount.toFixed(2),
      q.lines ? q.lines.length : 0,
      `"${new Date(q.createdAt).toISOString().split('T')[0]}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    return Buffer.from(csvContent, 'utf-8');
  }

  private generatePDF(quotations: any[]): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      // Header
      doc.fontSize(20).text('DealFlow360 Quotations Report', { align: 'center' });
      doc.fontSize(10).text(`Generated at: ${new Date().toISOString()}`, { align: 'center' });
      doc.moveDown(1.5);

      if (quotations.length === 0) {
        doc.fontSize(12).text('No quotations matching the specified filter criteria.', { align: 'center' });
        doc.end();
        return;
      }

      // Table Header
      doc.fontSize(10).font('Helvetica-Bold');
      doc.text('Quote #', 40, doc.y, { width: 100, continued: true });
      doc.text('Customer', { width: 120, continued: true });
      doc.text('Rep', { width: 110, continued: true });
      doc.text('Status', { width: 80, continued: true });
      doc.text('Amount ($)', { width: 80 });
      doc.moveDown(0.5);
      doc.font('Helvetica');

      // Table Rows
      for (const q of quotations) {
        if (doc.y > 750) {
          doc.addPage();
        }
        const quoteNum = q.quoteNumber;
        const custName = q.customerName || q.user?.name || 'Customer';
        const repName = q.user?.name || 'Rep';
        const status = q.status;
        const amount = `$${q.totalAmount.toFixed(2)}`;

        doc.text(quoteNum, 40, doc.y, { width: 100, continued: true });
        doc.text(custName.substring(0, 18), { width: 120, continued: true });
        doc.text(repName.substring(0, 16), { width: 110, continued: true });
        doc.text(status, { width: 80, continued: true });
        doc.text(amount, { width: 80 });
        doc.moveDown(0.3);
      }

      doc.end();
    });
  }

  // ==========================================================================
  // 3. Deal Health Analytics Engine
  // ==========================================================================

  async getDealHealth(options: DealHealthOptions = {}) {
    const stalledDaysThreshold = options.stalledDays !== undefined ? Number(options.stalledDays) : 5;
    const anomalyMultiplier = options.discountAnomalyMultiplier !== undefined ? Number(options.discountAnomalyMultiplier) : 1.5;
    const minHistoryFloor = options.minHistoryFloor !== undefined ? Number(options.minHistoryFloor) : 3;

    const now = new Date();

    // Fetch all quotations with lines and products
    const allQuotations = await prisma.quotation.findMany({
      include: {
        user: true,
        lines: {
          include: {
            product: true
          }
        }
      },
      orderBy: { updatedAt: 'desc' }
    });

    // 1. Compute Stalled Deals
    const nonTerminalStatuses = ['DRAFT', 'PENDING_APPROVAL', 'SUBMITTED', 'IN_REVIEW', 'UNDER_REVIEW'];
    const stalledDeals: Array<{
      quotationId: string;
      quoteNumber: string;
      customerName: string;
      salesRepId: string;
      salesRepName: string;
      status: string;
      daysInactive: number;
      updatedAt: Date;
      totalAmount: number;
    }> = [];

    for (const q of allQuotations) {
      if (nonTerminalStatuses.includes(q.status.toUpperCase())) {
        const msInactive = now.getTime() - new Date(q.updatedAt).getTime();
        const daysInactive = Math.floor(msInactive / (1000 * 60 * 60 * 24));

        if (daysInactive >= stalledDaysThreshold) {
          stalledDeals.push({
            quotationId: q.id,
            quoteNumber: q.quoteNumber,
            customerName: q.customerName || q.user?.name || 'Customer',
            salesRepId: q.userId,
            salesRepName: q.user?.name || 'Sales Rep',
            status: q.status,
            daysInactive,
            updatedAt: q.updatedAt,
            totalAmount: q.totalAmount
          });
        }
      }
    }

    stalledDeals.sort((a, b) => b.daysInactive - a.daysInactive);

    // 2. Compute Discount Anomalies (with historical floor of >= minHistoryFloor)
    // Group quotations by Sales Rep
    const repQuotationsMap = new Map<string, typeof allQuotations>();
    for (const q of allQuotations) {
      const repId = q.userId;
      if (!repQuotationsMap.has(repId)) {
        repQuotationsMap.set(repId, []);
      }
      repQuotationsMap.get(repId)!.push(q);
    }

    const discountAnomalies: Array<{
      quotationId: string;
      quoteNumber: string;
      customerName: string;
      salesRepId: string;
      salesRepName: string;
      status: string;
      discountPercent: number;
      repAvgDiscount: number;
      anomalyRatio: number;
      totalAmount: number;
      createdAt: Date;
    }> = [];

    // Helper: calculate quotation discount percentage
    const calculateQuoteDiscount = (q: typeof allQuotations[0]): number => {
      if (!q.lines || q.lines.length === 0) return 0;
      let totalGross = 0;
      let totalDiscountAmount = 0;

      for (const line of q.lines) {
        const gross = line.unitPrice * line.quantity;
        totalGross += gross;
        if (line.discount > 0) {
          // If discount field is percentage
          totalDiscountAmount += gross * (line.discount / 100);
        }
      }

      if (totalGross === 0) return 0;
      return (totalDiscountAmount / totalGross) * 100;
    };

    for (const [repId, repQuotes] of repQuotationsMap.entries()) {
      // Edge Case: Skip anomaly detection if rep has fewer than minHistoryFloor deals
      if (repQuotes.length < minHistoryFloor) {
        continue;
      }

      // Compute rep's historical average discount percentage
      const discountList = repQuotes.map(calculateQuoteDiscount);
      const repAvgDiscount = discountList.reduce((sum, d) => sum + d, 0) / discountList.length;

      // If rep gives negligible average discount (e.g. 0%), use a standard base threshold (e.g. 5%)
      const baselineAvg = Math.max(repAvgDiscount, 5.0);

      // Check each quotation for an anomaly
      for (const q of repQuotes) {
        const quoteDiscount = calculateQuoteDiscount(q);
        if (quoteDiscount > baselineAvg * anomalyMultiplier && quoteDiscount > 0) {
          const ratio = Math.round((quoteDiscount / baselineAvg) * 100) / 100;
          discountAnomalies.push({
            quotationId: q.id,
            quoteNumber: q.quoteNumber,
            customerName: q.customerName || q.user?.name || 'Customer',
            salesRepId: repId,
            salesRepName: q.user?.name || 'Sales Rep',
            status: q.status,
            discountPercent: Math.round(quoteDiscount * 100) / 100,
            repAvgDiscount: Math.round(repAvgDiscount * 100) / 100,
            anomalyRatio: ratio,
            totalAmount: q.totalAmount,
            createdAt: q.createdAt
          });
        }
      }
    }

    discountAnomalies.sort((a, b) => b.anomalyRatio - a.anomalyRatio);

    // 3. Compute Delivery Slippage
    const deliverySlippage: Array<{
      quotationId: string;
      quoteNumber: string;
      customerName: string;
      salesRepName: string;
      status: string;
      daysSlipped: number;
      targetDeliveryDate: Date | null;
      actualDeliveryDate: Date | null;
      totalAmount: number;
    }> = [];

    const completedStatuses = ['DELIVERED', 'COMPLETED', 'FULFILLED', 'CANCELLED'];

    for (const q of allQuotations) {
      if (q.targetDeliveryDate) {
        const targetDate = new Date(q.targetDeliveryDate);
        if (!completedStatuses.includes(q.status.toUpperCase())) {
          // Unfulfilled and target delivery date in the past
          if (now.getTime() > targetDate.getTime()) {
            const daysSlipped = Math.floor((now.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24));
            deliverySlippage.push({
              quotationId: q.id,
              quoteNumber: q.quoteNumber,
              customerName: q.customerName || q.user?.name || 'Customer',
              salesRepName: q.user?.name || 'Sales Rep',
              status: q.status,
              daysSlipped,
              targetDeliveryDate: q.targetDeliveryDate,
              actualDeliveryDate: q.actualDeliveryDate,
              totalAmount: q.totalAmount
            });
          }
        } else if (q.actualDeliveryDate) {
          // Completed but delivered after target date
          const actualDate = new Date(q.actualDeliveryDate);
          if (actualDate.getTime() > targetDate.getTime()) {
            const daysSlipped = Math.floor((actualDate.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24));
            deliverySlippage.push({
              quotationId: q.id,
              quoteNumber: q.quoteNumber,
              customerName: q.customerName || q.user?.name || 'Customer',
              salesRepName: q.user?.name || 'Sales Rep',
              status: q.status,
              daysSlipped,
              targetDeliveryDate: q.targetDeliveryDate,
              actualDeliveryDate: q.actualDeliveryDate,
              totalAmount: q.totalAmount
            });
          }
        }
      }
    }

    deliverySlippage.sort((a, b) => b.daysSlipped - a.daysSlipped);

    return {
      stalledDeals,
      discountAnomalies,
      deliverySlippage
    };
  }

  // ==========================================================================
  // 4. Nudge / Escalation Action
  // ==========================================================================

  async nudgeQuotation(
    quotationId: string,
    data: {
      message?: string;
      escalationType?: string;
      targetRole?: string;
      userId?: string;
    } = {}
  ) {
    const quotation = await prisma.quotation.findFirst({
      where: {
        OR: [{ id: quotationId }, { quoteNumber: quotationId }]
      },
      include: {
        user: true
      }
    });

    if (!quotation) {
      throw new Error(`Quotation with ID or quoteNumber ${quotationId} not found`);
    }

    const logEntry = await prisma.auditLog.create({
      data: {
        action: 'NUDGE_ESCALATION',
        entity: 'Quotation',
        entityId: quotation.id,
        userId: data.userId || quotation.userId,
        details: JSON.stringify({
          message: data.message || `Escalation nudge sent for quotation ${quotation.quoteNumber}`,
          escalationType: data.escalationType || 'STALLED_DEAL_NUDGE',
          targetRole: data.targetRole || 'MANAGER',
          quoteNumber: quotation.quoteNumber,
          triggeredAt: new Date().toISOString()
        })
      }
    });

    return {
      success: true,
      message: `Nudge escalation sent successfully for quotation ${quotation.quoteNumber}`,
      quotationId: quotation.id,
      quoteNumber: quotation.quoteNumber,
      actionId: logEntry.id,
      timestamp: logEntry.createdAt.toISOString()
    };
  }
}

export const reportsService = new ReportsService();
