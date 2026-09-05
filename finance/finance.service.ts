// finance/finance.service.ts
import { prisma } from '../shared/prisma';
import { calculateProration, getDaysDifference, addBillingCycles } from '../subscriptions/subscriptions.service';

export interface RecordPaymentInput {
  invoiceId: string;
  amount: number;
  paymentMethod?: string;
  reference?: string;
}

export interface CreateCreditNoteInput {
  invoiceId?: string;
  subscriptionId?: string;
  salesOrderId?: string;
  customerId?: string;
  amount: number;
  taxAdjustment?: number;
  reason: string;
  createdBy?: string;
}

export class FinanceService {
  /**
   * 1. Generates a One-Time Invoice for confirmed Sales Order or Quotation lines.
   */
  async generateInvoiceForOrder(salesOrderIdOrQuotationId: string) {
    let salesOrder = await prisma.salesOrder.findFirst({
      where: {
        OR: [
          { id: salesOrderIdOrQuotationId },
          { orderNumber: salesOrderIdOrQuotationId },
          { quotationId: salesOrderIdOrQuotationId }
        ]
      },
      include: {
        lines: { include: { product: true } }
      }
    });

    let quotation = null;
    if (!salesOrder) {
      quotation = await prisma.quotation.findFirst({
        where: {
          OR: [{ id: salesOrderIdOrQuotationId }, { quoteNumber: salesOrderIdOrQuotationId }]
        },
        include: {
          lines: { include: { product: true } }
        }
      });
    }

    if (!salesOrder && !quotation) {
      throw new Error(`Order or Quotation '${salesOrderIdOrQuotationId}' not found`);
    }

    const orderId = salesOrder ? salesOrder.id : null;
    const quoteId = quotation ? quotation.id : salesOrder ? salesOrder.quotationId : null;
    const customerId = salesOrder ? salesOrder.customerId : quotation ? quotation.customerId : null;
    const customerName = salesOrder ? salesOrder.customerName : quotation ? quotation.customerName : 'Customer';

    // Prevent duplicate active invoice generation
    const existingInvoice = await prisma.invoice.findFirst({
      where: {
        OR: [
          { salesOrderId: orderId || undefined },
          { quotationId: quoteId || undefined }
        ],
        status: { notIn: ['CANCELLED'] }
      },
      include: { lines: true, payments: true, creditNotes: true }
    });

    if (existingInvoice) {
      return existingInvoice;
    }

    const sourceLines = salesOrder
      ? salesOrder.lines.filter((l) => !l.isRecurring)
      : quotation
      ? quotation.lines.filter((l) =>
          !['SOFTWARE', 'SAAS', 'SERVICES', 'SUBSCRIPTIONS', 'SERVICE'].includes(
            (l.product?.category || '').toUpperCase()
          )
        )
      : [];

    // Fallback: If all lines are recurring, include lines as initial cycle charge
    const linesToBill = sourceLines.length > 0 ? sourceLines : salesOrder ? salesOrder.lines : quotation ? quotation.lines : [];

    let subtotal = 0;
    let discountTotal = 0;
    let taxTotal = 0;

    const invoiceLinesData = linesToBill.map((l: any) => {
      const lineSubtotal = l.quantity * l.unitPrice;
      const discAmount = (lineSubtotal * (l.discount || 0)) / 100;
      const taxAmount = (l.product?.tax ? (lineSubtotal - discAmount) * l.product.tax : 0) / 100;
      const lineTotal = lineSubtotal - discAmount + taxAmount;

      subtotal += lineSubtotal;
      discountTotal += discAmount;
      taxTotal += taxAmount;

      return {
        productId: l.productId,
        productName: l.product ? l.product.name : 'Item',
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discount: l.discount || 0,
        tax: l.product?.tax || 0,
        subtotal: lineSubtotal,
        lineTotal
      };
    });

    const totalAmount = Math.round((subtotal - discountTotal + taxTotal) * 100) / 100;
    const invoiceNumber = `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const today = new Date();
    const dueDate = new Date(today);
    dueDate.setDate(dueDate.getDate() + 30); // 30 days Net Terms

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber,
        salesOrderId: orderId,
        quotationId: quoteId,
        customerId,
        customerName,
        invoiceDate: today,
        dueDate,
        subtotal: Math.round(subtotal * 100) / 100,
        discountTotal: Math.round(discountTotal * 100) / 100,
        taxTotal: Math.round(taxTotal * 100) / 100,
        totalAmount,
        paidAmount: 0,
        outstandingAmount: totalAmount,
        status: 'ISSUED',
        invoiceType: 'ONE_TIME',
        lines: {
          create: invoiceLinesData
        }
      },
      include: {
        lines: true,
        payments: true,
        creditNotes: true
      }
    });

    return invoice;
  }

  /**
   * 2. Records a Payment against an Invoice with automatic state transitions and overpayment checks.
   */
  async recordPayment(input: RecordPaymentInput) {
    const { invoiceId, amount, paymentMethod, reference } = input;

    if (!amount || amount <= 0) {
      throw new Error('Payment amount must be greater than 0');
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { lines: true, payments: true }
    });

    if (!invoice) {
      throw new Error(`Invoice with ID '${invoiceId}' not found`);
    }

    if (invoice.status === 'PAID') {
      throw new Error(`Invoice '${invoice.invoiceNumber}' is already fully PAID.`);
    }

    if (invoice.status === 'CANCELLED') {
      throw new Error(`Cannot record payment on CANCELLED invoice '${invoice.invoiceNumber}'.`);
    }

    const outstanding = Math.round(invoice.outstandingAmount * 100) / 100;
    const paymentAmount = Math.round(amount * 100) / 100;

    if (paymentAmount > outstanding + 0.01) {
      throw new Error(
        `Payment amount ($${paymentAmount.toFixed(2)}) exceeds outstanding invoice balance ($${outstanding.toFixed(2)}). Overpayments are not allowed.`
      );
    }

    const newPaidAmount = Math.round((invoice.paidAmount + paymentAmount) * 100) / 100;
    const newOutstandingAmount = Math.max(0, Math.round((invoice.totalAmount - newPaidAmount) * 100) / 100);
    const newStatus = newOutstandingAmount === 0 ? 'PAID' : 'PARTIALLY_PAID';

    const paymentNumber = `PAY-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const payment = await prisma.payment.create({
      data: {
        paymentNumber,
        invoiceId: invoice.id,
        customerId: invoice.customerId,
        amount: paymentAmount,
        paymentDate: new Date(),
        paymentMethod: paymentMethod || 'BANK_TRANSFER',
        reference: reference || null,
        status: 'COMPLETED'
      }
    });

    const updatedInvoice = await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        paidAmount: newPaidAmount,
        outstandingAmount: newOutstandingAmount,
        status: newStatus
      },
      include: {
        lines: true,
        payments: true,
        creditNotes: true
      }
    });

    return {
      payment,
      invoice: updatedInvoice,
      message: newStatus === 'PAID' ? 'Invoice fully paid!' : 'Partial payment recorded successfully.'
    };
  }

  /**
   * 3. Creates Credit Notes for invoice adjustments or subscription cancellations.
   */
  async createCreditNote(input: CreateCreditNoteInput) {
    const { invoiceId, subscriptionId, salesOrderId, customerId, amount, taxAdjustment, reason, createdBy } = input;

    if (!amount || amount <= 0) {
      throw new Error('Credit note amount must be greater than 0');
    }

    if (!reason || !reason.trim()) {
      throw new Error('Credit note reason is mandatory');
    }

    const creditNoteNumber = `CN-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const creditNote = await prisma.creditNote.create({
      data: {
        creditNoteNumber,
        invoiceId: invoiceId || null,
        subscriptionId: subscriptionId || null,
        salesOrderId: salesOrderId || null,
        customerId: customerId || null,
        amount: Math.round(amount * 100) / 100,
        taxAdjustment: taxAdjustment ? Math.round(taxAdjustment * 100) / 100 : 0,
        reason: reason.trim(),
        createdBy: createdBy || 'FINANCE_OPERATIONS',
        status: 'ISSUED',
        lines: {
          create: [
            {
              description: reason.trim(),
              amount: Math.round(amount * 100) / 100
            }
          ]
        }
      },
      include: {
        lines: true,
        invoice: true,
        subscription: true
      }
    });

    return creditNote;
  }

  /**
   * 4. Retrieves Finance & Operations Dashboard aggregate KPIs and itemized ledgers.
   */
  async getFinanceDashboardMetrics(filters?: {
    startDate?: string;
    endDate?: string;
    status?: string;
    customerId?: string;
  }) {
    const invoices = await prisma.invoice.findMany({
      include: { lines: true, payments: true, creditNotes: true, salesOrder: true },
      orderBy: { invoiceDate: 'desc' }
    });

    const subscriptions = await prisma.subscription.findMany({
      include: { plan: true, billingScheduleEntries: true, creditNotes: true },
      orderBy: { createdAt: 'desc' }
    });

    const payments = await prisma.payment.findMany({
      include: { invoice: true },
      orderBy: { paymentDate: 'desc' }
    });

    const creditNotes = await prisma.creditNote.findMany({
      include: { lines: true, invoice: true, subscription: true },
      orderBy: { createdAt: 'desc' }
    });

    const salesOrders = await prisma.salesOrder.findMany({
      include: { lines: true, allocations: true, backorders: true },
      orderBy: { createdAt: 'desc' }
    });

    const backorders = await prisma.backorder.findMany({
      include: { product: true, warehouse: true, salesOrder: true },
      orderBy: { createdAt: 'desc' }
    });

    // Compute Metrics
    const totalInvoicesCount = invoices.length;
    const openInvoices = invoices.filter((i) => ['ISSUED', 'PARTIALLY_PAID'].includes(i.status));
    const paidInvoices = invoices.filter((i) => i.status === 'PAID');
    const overdueInvoices = invoices.filter(
      (i) => i.status !== 'PAID' && i.status !== 'CANCELLED' && new Date(i.dueDate).getTime() < Date.now()
    );

    const totalOutstandingAmount = Math.round(
      invoices.reduce((sum, i) => sum + (i.status !== 'CANCELLED' ? i.outstandingAmount : 0), 0) * 100
    ) / 100;

    const totalPaidAmount = Math.round(payments.reduce((sum, p) => sum + p.amount, 0) * 100) / 100;
    const totalCreditNotesAmount = Math.round(creditNotes.reduce((sum, c) => sum + c.amount, 0) * 100) / 100;

    const activeSubscriptions = subscriptions.filter((s) => s.status === 'ACTIVE');
    const recurringMonthlyRevenue = Math.round(
      activeSubscriptions.reduce((sum, s) => {
        const cycle = s.plan.billingCycle.toUpperCase();
        const cyclePrice = s.quantity * s.plan.pricePerCycle;
        if (cycle === 'YEARLY') return sum + cyclePrice / 12;
        if (cycle === 'QUARTERLY') return sum + cyclePrice / 3;
        return sum + cyclePrice;
      }, 0) * 100
    ) / 100;

    const activeBackordersCount = backorders.filter((b) => b.status === 'BACKORDERED').length;

    return {
      kpis: {
        totalInvoicesCount,
        openInvoicesCount: openInvoices.length,
        openInvoicesAmount: Math.round(openInvoices.reduce((s, i) => s + i.outstandingAmount, 0) * 100) / 100,
        paidInvoicesCount: paidInvoices.length,
        paidInvoicesAmount: totalPaidAmount,
        overdueInvoicesCount: overdueInvoices.length,
        overdueInvoicesAmount: Math.round(overdueInvoices.reduce((s, i) => s + i.outstandingAmount, 0) * 100) / 100,
        totalOutstandingAmount,
        activeSubscriptionsCount: activeSubscriptions.length,
        recurringMonthlyRevenue,
        creditNotesCount: creditNotes.length,
        creditNotesTotalAmount: totalCreditNotesAmount,
        fulfillmentOrdersCount: salesOrders.length,
        activeBackordersCount
      },
      invoices,
      subscriptions,
      payments,
      creditNotes,
      salesOrders,
      backorders
    };
  }
}

export const financeService = new FinanceService();
