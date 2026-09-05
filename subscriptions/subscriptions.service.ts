// subscriptions/subscriptions.service.ts
import { prisma } from '../shared/prisma';

export interface ProrationInput {
  oldQuantity: number;
  newQuantity: number;
  pricePerUnit: number;
  daysRemaining: number;
  totalDaysInCycle: number;
}

/**
 * Pure function to calculate prorated amount for subscription quantity changes.
 * Formula: (newQuantity - oldQuantity) * pricePerUnit * (daysRemaining / totalDaysInCycle)
 * Rounded to 2 decimal places.
 */
export function calculateProration({
  oldQuantity,
  newQuantity,
  pricePerUnit,
  daysRemaining,
  totalDaysInCycle
}: ProrationInput): number {
  if (totalDaysInCycle <= 0 || daysRemaining <= 0) {
    return 0;
  }
  const deltaQuantity = newQuantity - oldQuantity;
  const ratio = daysRemaining / totalDaysInCycle;
  const rawProrated = deltaQuantity * pricePerUnit * ratio;
  return Math.round(rawProrated * 100) / 100;
}

/**
 * Calculate difference in whole days between two dates.
 */
export function getDaysDifference(start: Date, end: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / msPerDay));
}

/**
 * Advance date by N billing cycles.
 */
export function addBillingCycles(date: Date, cycle: string, count: number = 1): Date {
  const result = new Date(date);
  const upperCycle = (cycle || 'MONTHLY').toUpperCase();
  if (upperCycle === 'QUARTERLY') {
    result.setMonth(result.getMonth() + 3 * count);
  } else if (upperCycle === 'YEARLY') {
    result.setFullYear(result.getFullYear() + count);
  } else {
    // Default MONTHLY
    result.setMonth(result.getMonth() + count);
  }
  return result;
}

export class SubscriptionsService {
  // -------------------------------------------------------------
  // 1. Subscription Plan CRUD
  // -------------------------------------------------------------

  async createPlan(data: {
    name: string;
    billingCycle?: string;
    productId?: string;
    pricePerCycle: number;
  }) {
    if (!data.name || data.pricePerCycle === undefined || data.pricePerCycle < 0) {
      throw new Error('Name and valid non-negative pricePerCycle are required');
    }

    const billingCycle = (data.billingCycle || 'MONTHLY').toUpperCase();
    if (!['MONTHLY', 'QUARTERLY', 'YEARLY'].includes(billingCycle)) {
      throw new Error('Invalid billingCycle. Allowed: MONTHLY, QUARTERLY, YEARLY');
    }

    return prisma.subscriptionPlan.create({
      data: {
        name: data.name,
        billingCycle,
        productId: data.productId || null,
        pricePerCycle: data.pricePerCycle,
        isActive: true
      }
    });
  }

  async getPlans(includeInactive: boolean = false) {
    return prisma.subscriptionPlan.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { createdAt: 'desc' }
    });
  }

  async getPlanById(id: string) {
    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id }
    });
    if (!plan) {
      throw new Error('Subscription plan not found');
    }
    return plan;
  }

  async updatePlan(
    id: string,
    data: {
      name?: string;
      billingCycle?: string;
      productId?: string;
      pricePerCycle?: number;
      isActive?: boolean;
    }
  ) {
    await this.getPlanById(id);

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.productId !== undefined) updateData.productId = data.productId;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.pricePerCycle !== undefined) {
      if (data.pricePerCycle < 0) throw new Error('Price must be non-negative');
      updateData.pricePerCycle = data.pricePerCycle;
    }
    if (data.billingCycle !== undefined) {
      const cycle = data.billingCycle.toUpperCase();
      if (!['MONTHLY', 'QUARTERLY', 'YEARLY'].includes(cycle)) {
        throw new Error('Invalid billingCycle. Allowed: MONTHLY, QUARTERLY, YEARLY');
      }
      updateData.billingCycle = cycle;
    }

    return prisma.subscriptionPlan.update({
      where: { id },
      data: updateData
    });
  }

  async deactivatePlan(id: string) {
    await this.getPlanById(id);
    return prisma.subscriptionPlan.update({
      where: { id },
      data: { isActive: false }
    });
  }

  // -------------------------------------------------------------
  // 2. Create Subscription & Schedule Generator
  // -------------------------------------------------------------

  async createSubscription(data: {
    quotationId?: string;
    planId: string;
    quantity?: number;
    startDate?: string | Date;
    cyclesToGenerate?: number;
  }) {
    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id: data.planId }
    });

    if (!plan) {
      throw new Error('Subscription plan not found');
    }
    if (!plan.isActive) {
      throw new Error('Cannot create subscription for inactive plan');
    }

    const quantity = data.quantity && data.quantity > 0 ? data.quantity : 1;
    const startDate = data.startDate ? new Date(data.startDate) : new Date();
    const periodStart = new Date(startDate);
    const periodEnd = addBillingCycles(periodStart, plan.billingCycle, 1);

    const subscription = await prisma.subscription.create({
      data: {
        quotationId: data.quotationId || null,
        planId: plan.id,
        quantity,
        startDate: periodStart,
        status: 'ACTIVE',
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd
      }
    });

    // Generate schedule entries (default 12 cycles)
    const cyclesCount = data.cyclesToGenerate && data.cyclesToGenerate > 0 ? data.cyclesToGenerate : 12;
    const scheduleEntries: Array<{
      subscriptionId: string;
      billingDate: Date;
      amount: number;
      status: string;
      description: string;
    }> = [];

    const cycleAmount = Math.round(quantity * plan.pricePerCycle * 100) / 100;

    for (let i = 0; i < cyclesCount; i++) {
      const billingDate = addBillingCycles(periodStart, plan.billingCycle, i);
      scheduleEntries.push({
        subscriptionId: subscription.id,
        billingDate,
        amount: cycleAmount,
        status: i === 0 ? 'INVOICED' : 'UPCOMING',
        description: `Billing Cycle ${i + 1} (${plan.billingCycle})`
      });
    }

    await prisma.billingScheduleEntry.createMany({
      data: scheduleEntries
    });

    return prisma.subscription.findUnique({
      where: { id: subscription.id },
      include: {
        plan: true,
        billingScheduleEntries: {
          orderBy: { billingDate: 'asc' }
        },
        creditNotes: true
      }
    });
  }

  // -------------------------------------------------------------
  // 3. Update Quantity with Proration
  // -------------------------------------------------------------

  async updateQuantity(
    subscriptionId: string,
    newQuantity: number,
    effectiveDateInput?: string | Date
  ) {
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: {
        plan: true,
        billingScheduleEntries: true
      }
    });

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    if (subscription.status !== 'ACTIVE') {
      throw new Error(`Cannot modify quantity of subscription with status ${subscription.status}`);
    }

    if (newQuantity <= 0 || !Number.isInteger(newQuantity)) {
      throw new Error('newQuantity must be a positive integer');
    }

    if (newQuantity === subscription.quantity) {
      return {
        subscription,
        proratedAmount: 0,
        action: 'NONE',
        message: 'Quantity unchanged'
      };
    }

    const effectiveDate = effectiveDateInput ? new Date(effectiveDateInput) : new Date();
    const periodStart = new Date(subscription.currentPeriodStart);
    const periodEnd = new Date(subscription.currentPeriodEnd);

    const totalDaysInCycle = Math.max(1, getDaysDifference(periodStart, periodEnd));
    const daysRemaining = Math.max(
      0,
      Math.round((periodEnd.getTime() - effectiveDate.getTime()) / (1000 * 60 * 60 * 24))
    );

    const pricePerUnit = subscription.plan.pricePerCycle;
    const oldQuantity = subscription.quantity;

    const proratedAmount = calculateProration({
      oldQuantity,
      newQuantity,
      pricePerUnit,
      daysRemaining,
      totalDaysInCycle
    });

    let immediateEntry = null;
    let creditNote = null;

    if (newQuantity > oldQuantity) {
      // Quantity Increase: Create immediate prorated charge
      immediateEntry = await prisma.billingScheduleEntry.create({
        data: {
          subscriptionId: subscription.id,
          billingDate: effectiveDate,
          amount: Math.abs(proratedAmount),
          status: 'INVOICED',
          description: `Prorated charge: quantity increased from ${oldQuantity} to ${newQuantity} (${daysRemaining}/${totalDaysInCycle} days remaining)`
        }
      });
    } else {
      // Quantity Decrease: Create CreditNote for prorated overpayment
      const creditAmount = Math.abs(proratedAmount);
      if (creditAmount > 0) {
        creditNote = await prisma.creditNote.create({
          data: {
            creditNoteNumber: `CN-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
            subscriptionId: subscription.id,
            amount: creditAmount,
            reason: `Prorated credit for quantity decrease from ${oldQuantity} to ${newQuantity} (${daysRemaining}/${totalDaysInCycle} days remaining)`
          }
        });
      }
    }

    // Update future UPCOMING BillingScheduleEntry rows to reflect new quantity
    const newCycleAmount = Math.round(newQuantity * pricePerUnit * 100) / 100;
    await prisma.billingScheduleEntry.updateMany({
      where: {
        subscriptionId: subscription.id,
        status: 'UPCOMING',
        billingDate: {
          gt: effectiveDate
        }
      },
      data: {
        amount: newCycleAmount
      }
    });

    // Update subscription record with new quantity
    const updatedSubscription = await prisma.subscription.update({
      where: { id: subscription.id },
      data: { quantity: newQuantity },
      include: {
        plan: true,
        billingScheduleEntries: {
          orderBy: { billingDate: 'asc' }
        },
        creditNotes: true
      }
    });

    return {
      subscription: updatedSubscription,
      oldQuantity,
      newQuantity,
      daysRemaining,
      totalDaysInCycle,
      proratedAmount,
      action: newQuantity > oldQuantity ? 'CHARGE' : 'CREDIT',
      immediateEntry,
      creditNote
    };
  }

  // -------------------------------------------------------------
  // 4. Cancel Subscription with Mid-Cycle Proration
  // -------------------------------------------------------------

  async cancelSubscription(
    subscriptionId: string,
    effectiveDateInput?: string | Date,
    reason?: string
  ) {
    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: {
        plan: true,
        billingScheduleEntries: true
      }
    });

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    if (subscription.status === 'CANCELLED') {
      throw new Error('Subscription is already cancelled');
    }

    const effectiveDate = effectiveDateInput ? new Date(effectiveDateInput) : new Date();
    const periodStart = new Date(subscription.currentPeriodStart);
    const periodEnd = new Date(subscription.currentPeriodEnd);

    const totalDaysInCycle = Math.max(1, getDaysDifference(periodStart, periodEnd));
    const daysRemaining = Math.max(
      0,
      Math.round((periodEnd.getTime() - effectiveDate.getTime()) / (1000 * 60 * 60 * 24))
    );

    let creditNote = null;
    let unusedCredit = 0;

    // Proration on cancellation for remaining unused days
    if (daysRemaining > 0 && totalDaysInCycle > 0) {
      const rawCredit = subscription.quantity * subscription.plan.pricePerCycle * (daysRemaining / totalDaysInCycle);
      unusedCredit = Math.round(rawCredit * 100) / 100;

      if (unusedCredit > 0) {
        creditNote = await prisma.creditNote.create({
          data: {
            creditNoteNumber: `CN-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
            subscriptionId: subscription.id,
            amount: unusedCredit,
            reason: reason || `Subscription cancelled mid-cycle: refund for ${daysRemaining}/${totalDaysInCycle} unused days`
          }
        });
      }
    }

    // Void/remove future UPCOMING billing schedule entries
    await prisma.billingScheduleEntry.deleteMany({
      where: {
        subscriptionId: subscription.id,
        status: 'UPCOMING',
        billingDate: {
          gte: effectiveDate
        }
      }
    });

    // Mark subscription status as CANCELLED
    const cancelledSubscription = await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: 'CANCELLED'
      },
      include: {
        plan: true,
        billingScheduleEntries: {
          orderBy: { billingDate: 'asc' }
        },
        creditNotes: true
      }
    });

    return {
      subscription: cancelledSubscription,
      creditNote,
      unusedCredit,
      daysRemaining,
      totalDaysInCycle,
      message: 'Subscription cancelled successfully'
    };
  }

  // -------------------------------------------------------------
  // 5. Hybrid Order / Quotation Invoice Aggregator
  // -------------------------------------------------------------

  async getOrderInvoice(orderId: string) {
    // 1. Fetch quotation if exists (by ID or quoteNumber)
    let quotation = await prisma.quotation.findFirst({
      where: {
        OR: [{ id: orderId }, { quoteNumber: orderId }]
      },
      include: {
        lines: {
          include: {
            product: true
          }
        }
      }
    });

    const quotationId = quotation ? quotation.id : orderId;

    // 2. Fetch associated subscriptions
    const subscriptions = await prisma.subscription.findMany({
      where: { quotationId },
      include: {
        plan: true,
        billingScheduleEntries: {
          where: { status: 'UPCOMING' },
          orderBy: { billingDate: 'asc' }
        },
        creditNotes: true
      }
    });

    // Calculate one-time total from QuotationLines
    const oneTimeTotal = quotation
      ? quotation.lines.reduce((sum, line) => sum + line.totalPrice, 0)
      : 0;

    // Calculate recurring total (sum of active subscriptions' per-cycle amount)
    const recurringTotal = subscriptions
      .filter((s) => s.status === 'ACTIVE')
      .reduce((sum, s) => sum + s.quantity * s.plan.pricePerCycle, 0);

    const combinedInvoiceTotal = Math.round((oneTimeTotal + recurringTotal) * 100) / 100;

    // Aggregate upcoming schedule across all subscriptions
    const upcomingSchedule = subscriptions
      .flatMap((s) =>
        s.billingScheduleEntries.map((entry) => ({
          id: entry.id,
          subscriptionId: s.id,
          planName: s.plan.name,
          billingDate: entry.billingDate,
          amount: entry.amount,
          status: entry.status,
          description: entry.description
        }))
      )
      .sort((a, b) => new Date(a.billingDate).getTime() - new Date(b.billingDate).getTime());

    const creditNotes = subscriptions.flatMap((s) => s.creditNotes);

    return {
      orderId: quotationId,
      quoteNumber: quotation ? quotation.quoteNumber : null,
      oneTimeTotal: Math.round(oneTimeTotal * 100) / 100,
      recurringTotal: Math.round(recurringTotal * 100) / 100,
      combinedInvoiceTotal,
      quotationLines: quotation
        ? quotation.lines.map((l) => ({
            id: l.id,
            productId: l.productId,
            productName: l.product ? l.product.name : 'Unknown Product',
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            discount: l.discount,
            totalPrice: l.totalPrice
          }))
        : [],
      subscriptions: subscriptions.map((s) => ({
        id: s.id,
        planId: s.planId,
        planName: s.plan.name,
        billingCycle: s.plan.billingCycle,
        pricePerCycle: s.plan.pricePerCycle,
        quantity: s.quantity,
        cycleTotal: Math.round(s.quantity * s.plan.pricePerCycle * 100) / 100,
        status: s.status,
        currentPeriodStart: s.currentPeriodStart,
        currentPeriodEnd: s.currentPeriodEnd
      })),
      upcomingSchedule,
      creditNotes
    };
  }
}

export const subscriptionsService = new SubscriptionsService();
