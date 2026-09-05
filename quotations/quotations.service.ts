// quotations/quotations.service.ts
import { prisma } from '../shared/prisma';
import { productsService } from '../products/products.service';

export interface CreateQuotationInput {
  customerId?: string;
  customerName?: string;
  customerTier?: string;
  currency?: string;
}

export interface LineInput {
  productId: string;
  quantity: number;
  discountPercent?: number;
  discount?: number;
}

export interface GetQuotationsFilter {
  status?: string;
  repId?: string;
  teamId?: string;
}

export interface UserContext {
  id: string;
  role: string;
}

export class QuotationsService {
  // ============================================================================
  // 1. POST /quotations - Create DRAFT Quotation
  // ============================================================================

  async createQuotation(input: CreateQuotationInput, repId: string) {
    if (input.customerId) {
      const customerUser = await prisma.user.findUnique({
        where: { id: input.customerId }
      });

      if (!customerUser) {
        const err = new Error(`Customer with ID '${input.customerId}' not found`);
        (err as any).statusCode = 400;
        throw err;
      }
    }

    const quoteNumber = `QT-2026-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;

    return prisma.quotation.create({
      data: {
        quoteNumber,
        userId: repId,
        customerId: input.customerId || null,
        customerName: input.customerName || null,
        customerTier: input.customerTier ? input.customerTier.toUpperCase() : 'GOLD',
        currency: input.currency ? input.currency.toUpperCase() : 'USD',
        status: 'DRAFT',
        totalAmount: 0
      },
      include: {
        lines: { include: { product: true } },
        user: true
      }
    });
  }

  // ============================================================================
  // 2. GET /quotations - Pipeline List View
  // ============================================================================

  async getQuotations(user: UserContext, filter?: GetQuotationsFilter) {
    const where: any = {};

    // Role-based visibility: Reps see only their own unless role is MANAGER or ADMIN
    if (user.role === 'REP') {
      where.userId = user.id;
    } else if (filter?.repId) {
      where.userId = filter.repId;
    }

    if (filter?.status) {
      where.status = filter.status.toUpperCase();
    }

    const quotations = await prisma.quotation.findMany({
      where,
      include: {
        user: true,
        lines: true
      },
      orderBy: { updatedAt: 'desc' }
    });

    return quotations.map((q) => ({
      id: q.id,
      quoteNumber: q.quoteNumber,
      repId: q.userId,
      repName: q.user?.name || null,
      customerId: q.customerId,
      customerName: q.customerName || 'Customer',
      customerTier: q.customerTier,
      currency: q.currency,
      amount: q.totalAmount,
      totalAmount: q.totalAmount,
      status: q.status,
      createdAt: q.createdAt,
      updatedAt: q.updatedAt
    }));
  }

  // ============================================================================
  // 3. GET /quotations/:id - Full Detail View
  // ============================================================================

  async getQuotationById(id: string) {
    const quotation = await prisma.quotation.findUnique({
      where: { id },
      include: {
        user: true,
        lines: {
          include: { product: true }
        },
        approvalRequests: {
          include: { stepRecords: true },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!quotation) {
      const err = new Error(`Quotation with ID '${id}' not found`);
      (err as any).statusCode = 404;
      throw err;
    }

    return quotation;
  }

  // ============================================================================
  // 4. PATCH /quotations/:id/lines - Upsert Lines with Server-Side Price Resolution
  // ============================================================================

  async updateQuotationLines(id: string, linesInput: LineInput[]) {
    const quotation = await this.getQuotationById(id);

    // Reject edits if status is not DRAFT (409 Conflict)
    if (quotation.status !== 'DRAFT') {
      const err = new Error(`Cannot edit lines on quotation with status '${quotation.status}'. Only DRAFT quotations can be modified.`);
      (err as any).statusCode = 409;
      throw err;
    }

    if (!linesInput || !Array.isArray(linesInput)) {
      const err = new Error('lines array is required');
      (err as any).statusCode = 400;
      throw err;
    }

    // Resolve unitPrice server-side from Products module for each line item
    const processedLines: Array<{
      productId: string;
      quantity: number;
      unitPrice: number;
      discountPercent: number;
      lineTotal: number;
    }> = [];
    for (const item of linesInput) {
      if (!item.productId) {
        const err = new Error('Each line must specify a productId');
        (err as any).statusCode = 400;
        throw err;
      }

      const priceResult = await productsService.resolveProductPrice(
        item.productId,
        quotation.customerTier || undefined,
        quotation.currency || undefined
      );

      const unitPrice = priceResult.resolvedPrice;
      const quantity = Number(item.quantity || 1);
      const discountPercent = Number(
        item.discountPercent !== undefined
          ? item.discountPercent
          : item.discount !== undefined
          ? item.discount
          : 0
      );

      const rawLineTotal = quantity * unitPrice * (1 - discountPercent / 100);
      const lineTotal = Number(rawLineTotal.toFixed(2));

      processedLines.push({
        productId: item.productId,
        quantity,
        unitPrice,
        discountPercent,
        lineTotal
      });
    }

    // Atomically replace full line set and update running total + updatedAt
    await prisma.$transaction(async (tx) => {
      await tx.quotationLine.deleteMany({ where: { quotationId: id } });

      for (const line of processedLines) {
        await tx.quotationLine.create({
          data: {
            quotationId: id,
            productId: line.productId,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            discount: line.discountPercent,
            discountPercent: line.discountPercent,
            totalPrice: line.lineTotal,
            lineTotal: line.lineTotal
          }
        });
      }

      const newTotalAmount = Number(
        processedLines.reduce((sum, l) => sum + l.lineTotal, 0).toFixed(2)
      );

      await tx.quotation.update({
        where: { id },
        data: {
          totalAmount: newTotalAmount,
          updatedAt: new Date()
        }
      });
    });

    return this.getQuotationById(id);
  }
}

export const quotationsService = new QuotationsService();
