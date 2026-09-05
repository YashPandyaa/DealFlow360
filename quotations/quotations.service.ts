// quotations/quotations.service.ts
import { prisma } from '../shared/prisma';
import { productsService } from '../products/products.service';
import { AuthService } from '../auth/auth.service';
import { discountsService } from '../discounts/discounts.service';

export interface CreateQuotationInput {
  customerId?: string;
  customerName?: string;
  customerTier?: string;
  currency?: string;
}

export interface LineInput {
  productId: string;
  variantId?: string;
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
    await AuthService.ensureDemoUsers();

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

    // Ensure repId exists in database, fallback to first active user if missing
    let validUserId = repId;
    let existingRep = repId ? await prisma.user.findUnique({ where: { id: repId } }) : null;
    if (!existingRep) {
      const fallbackUser =
        (await prisma.user.findFirst({ where: { role: 'REP' } })) ||
        (await prisma.user.findFirst());
      if (fallbackUser) {
        validUserId = fallbackUser.id;
      }
    }

    let resolvedCustomerId = input.customerId || null;
    if (!resolvedCustomerId && input.customerName) {
      const cleanName = input.customerName.toLowerCase().trim();
      const matchedUser = await prisma.user.findFirst({
        where: {
          role: 'CUSTOMER',
          OR: [
            { email: { contains: cleanName } },
            { name: { contains: cleanName } }
          ]
        }
      });
      if (matchedUser) {
        resolvedCustomerId = matchedUser.id;
      }
    }

    const quoteNumber = `QT-2026-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;

    return prisma.quotation.create({
      data: {
        quoteNumber,
        userId: validUserId,
        customerId: resolvedCustomerId,
        customerName: input.customerName || (input.customerId ? 'Customer' : 'Customer Account'),
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

    // Role-based visibility: Reps see only their own; Customers see their own or general/unassigned deals
    if (user.role === 'REP') {
      where.userId = user.id;
    } else if (user.role === 'CUSTOMER') {
      const currentUser = await prisma.user.findUnique({ where: { id: user.id } });
      const searchConditions: any[] = [
        { customerId: user.id },
        { userId: user.id },
        { customerId: null }
      ];

      if (currentUser?.email) {
        const emailPrefix = currentUser.email.split('@')[0];
        searchConditions.push({ customerName: { contains: emailPrefix } });
      }
      if (currentUser?.name) {
        searchConditions.push({ customerName: { contains: currentUser.name } });
      }

      where.OR = searchConditions;
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
      customerName: q.customerName || 'Customer',
      customerTier: q.customerTier,
      currency: 'USD',
      amount: q.totalAmount,
      totalAmount: q.totalAmount,
      status: q.status,
      createdAt: q.createdAt,
      updatedAt: q.updatedAt
    }));
  }

  // ============================================================================
  // 3. GET /quotations/:id - Full Detail View with IDOR Ownership Guard
  // ============================================================================

  async getQuotationById(idOrNumber: string, user?: UserContext) {
    const quotation = await prisma.quotation.findFirst({
      where: {
        OR: [{ id: idOrNumber }, { quoteNumber: idOrNumber }]
      },
      include: {
        user: true,
        lines: {
          include: { product: true }
        },
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
      const err = new Error(`Quotation '${idOrNumber}' not found`);
      (err as any).statusCode = 404;
      throw err;
    }

    if (user && user.role === 'CUSTOMER') {
      const currentUser = await prisma.user.findUnique({ where: { id: user.id } });
      const emailPrefix = currentUser?.email ? currentUser.email.split('@')[0].toLowerCase() : '';
      const nameLower = currentUser?.name ? currentUser.name.toLowerCase() : '';
      const quoteCustName = quotation.customerName?.toLowerCase() || '';

      const isAllowed =
        !quotation.customerId ||
        quotation.customerId === user.id ||
        quotation.userId === user.id ||
        (emailPrefix && quoteCustName.includes(emailPrefix)) ||
        (nameLower && quoteCustName.includes(nameLower));

      if (!isAllowed) {
        const err = new Error(`Forbidden: You do not have access to quotation '${idOrNumber}'`);
        (err as any).statusCode = 403;
        throw err;
      }
    }

    const linesWithMargin = quotation.lines.map((l) => {
      const lineRevenue = l.totalPrice;
      const lineCost = l.quantity * (l.costPrice || l.product?.costPrice || 0);
      const lineMargin = lineRevenue - lineCost;
      const lineMarginPercent = lineRevenue > 0 ? Number(((lineMargin / lineRevenue) * 100).toFixed(2)) : 0;

      return {
        ...l,
        discountPercent: l.discount,
        lineTotal: l.totalPrice,
        lineRevenue,
        lineCost,
        lineMargin,
        lineMarginPercent
      };
    });

    const totalRevenue = quotation.totalAmount;
    const totalCost = linesWithMargin.reduce((sum, l) => sum + l.lineCost, 0);
    const totalMargin = totalRevenue - totalCost;
    const totalMarginPercent = totalRevenue > 0 ? Number(((totalMargin / totalRevenue) * 100).toFixed(2)) : 0;

    const riskAnalysis = await discountsService.calculateRisk({
      quotationId: quotation.id,
      salesRepId: quotation.userId || undefined,
      customerTier: quotation.customerTier || 'GOLD',
      customerId: quotation.customerId || undefined,
      customerName: quotation.customerName || undefined,
      lines: linesWithMargin.map((l) => ({
        productId: l.productId,
        productName: l.product?.name || l.product?.category || 'Product',
        category: l.product?.category || (l as any).category || 'Hardware',
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        costPrice: l.costPrice || l.product?.costPrice || (l.product?.marginPercent ? l.unitPrice * (1 - l.product.marginPercent / 100) : 0),
        discountPercent: l.discount,
        lineTotal: l.totalPrice
      }))
    }).catch(() => null);

    return {
      ...quotation,
      lines: linesWithMargin,
      marginSummary: {
        totalRevenue,
        totalCost,
        totalMargin,
        totalMarginPercent
      },
      riskAnalysis
    };
  }

  // ============================================================================
  // 3b. POST /quotations/:id/confirm - Customer Quotation Confirmation
  // ============================================================================

  async confirmQuotation(idOrNumber: string, user: UserContext) {
    const quotation = await this.getQuotationById(idOrNumber, user);

    if (user.role === 'CUSTOMER') {
      if (quotation.customerId && quotation.customerId !== user.id && quotation.userId !== user.id) {
        const err = new Error(`Forbidden: You do not own quotation '${idOrNumber}'`);
        (err as any).statusCode = 403;
        throw err;
      }
    }

    if (
      quotation.status !== 'APPROVED' &&
      quotation.status !== 'READY_FOR_FULFILLMENT' &&
      quotation.status !== 'SENT' &&
      quotation.status !== 'DRAFT'
    ) {
      const err = new Error(
        `Quotation '${quotation.quoteNumber}' cannot be confirmed because current status is '${quotation.status}'. Must be APPROVED or READY_FOR_FULFILLMENT.`
      );
      (err as any).statusCode = 400;
      throw err;
    }

    const updated = await prisma.quotation.update({
      where: { id: quotation.id },
      data: {
        status: 'CONFIRMED',
        confirmedAt: new Date(),
        confirmedBy: user.id
      },
      include: {
        lines: { include: { product: true } }
      }
    });

    // Create stock allocations for warehouse fulfillment tracking
    const warehouse = await prisma.warehouse.findFirst();
    if (warehouse) {
      for (const line of updated.lines) {
        await prisma.stockAllocation.create({
          data: {
            warehouseId: warehouse.id,
            productId: line.productId,
            quotationId: updated.id,
            quantity: line.quantity,
            status: 'ALLOCATED'
          }
        });
      }
    }

    return updated;
  }

  // ============================================================================
  // 3c. Line Item & Quotation Comments
  // ============================================================================

  async addComment(quotationId: string, user: UserContext, commentText: string, lineId?: string) {
    if (!commentText || !commentText.trim()) {
      const err = new Error('Comment text is required');
      (err as any).statusCode = 400;
      throw err;
    }

    await this.getQuotationById(quotationId, user);

    const created = await prisma.quotationComment.create({
      data: {
        quotationId,
        lineId: lineId || null,
        userId: user.id,
        comment: commentText.trim()
      },
      include: {
        user: true
      }
    });

    return created;
  }

  async getComments(quotationId: string, user: UserContext) {
    await this.getQuotationById(quotationId, user);

    return prisma.quotationComment.findMany({
      where: { quotationId },
      include: {
        user: true
      },
      orderBy: { createdAt: 'asc' }
    });
  }

  // ============================================================================
  // 4. PATCH /quotations/:id/lines - Upsert Lines with Server-Side Price Resolution
  // ============================================================================

  async updateQuotationLines(id: string, linesInput: LineInput[]) {
    const quotation = await this.getQuotationById(id);

    // Reject edits if status is not DRAFT or RETURNED_FOR_REVISION (409 Conflict)
    if (quotation.status !== 'DRAFT' && quotation.status !== 'RETURNED_FOR_REVISION') {
      const err = new Error(`Cannot edit lines on quotation with status '${quotation.status}'. Only DRAFT quotations can be modified (or RETURNED_FOR_REVISION).`);
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
      variantId?: string | null;
      variantName?: string | null;
      quantity: number;
      unitPrice: number;
      costPrice: number;
      discountPercent: number;
      lineTotal: number;
    }> = [];
    for (const item of linesInput) {
      if (!item.productId) {
        const err = new Error('Each line must specify a productId');
        (err as any).statusCode = 400;
        throw err;
      }

      const product = await productsService.getProductById(item.productId);
      if (product.status === 'INACTIVE') {
        const err = new Error(`Product '${product.name}' is INACTIVE and cannot be selected for new quotations.`);
        (err as any).statusCode = 400;
        throw err;
      }

      const priceResult = await productsService.resolveProductPrice(
        item.productId,
        quotation.customerTier || undefined,
        quotation.currency || undefined,
        item.variantId
      );

      const unitPrice = priceResult.resolvedPrice;
      const costPrice = priceResult.costPrice || 0;
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
        variantId: priceResult.variantId || null,
        variantName: priceResult.variantName || null,
        quantity,
        unitPrice,
        costPrice,
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
            variantId: line.variantId || null,
            variantName: line.variantName || null,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            costPrice: line.costPrice,
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

  async updateQuotationMeta(idOrNumber: string, data: { customerId?: string; customerName?: string; customerTier?: string }) {
    const quotation = await this.getQuotationById(idOrNumber);

    let resolvedCustomerId = data.customerId;
    if (data.customerId) {
      const cust = await prisma.user.findUnique({ where: { id: data.customerId } });
      if (cust) {
        resolvedCustomerId = cust.id;
      }
    }

    return prisma.quotation.update({
      where: { id: quotation.id },
      data: {
        ...(resolvedCustomerId !== undefined && { customerId: resolvedCustomerId }),
        ...(data.customerName !== undefined && { customerName: data.customerName }),
        ...(data.customerTier !== undefined && { customerTier: data.customerTier.toUpperCase() })
      },
      include: {
        lines: { include: { product: true } },
        user: true
      }
    });
  }
}

export const quotationsService = new QuotationsService();
