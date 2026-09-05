// subscriptions/subscriptions.test.ts
import request from 'supertest';
import app from '../src/index';
import { prisma } from '../shared/prisma';
import { calculateProration, getDaysDifference } from './subscriptions.service';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dealflow360-super-secret-key';

describe('Subscription & Hybrid Billing Module Tests', () => {
  let adminToken: string;
  let repToken: string;
  let customerToken: string;
  let adminUserId: string;

  beforeAll(async () => {
    // Clean up test DB
    await prisma.creditNote.deleteMany();
    await prisma.billingScheduleEntry.deleteMany();
    await prisma.subscription.deleteMany();
    await prisma.subscriptionPlan.deleteMany();
    await prisma.quotationLine.deleteMany();
    await prisma.quotation.deleteMany();
    await prisma.product.deleteMany();
    await prisma.user.deleteMany();

    // Create Admin User
    const adminUser = await prisma.user.create({
      data: {
        email: 'admin@dealflow360.com',
        name: 'Admin User',
        role: 'ADMIN'
      }
    });
    adminUserId = adminUser.id;
    adminToken = jwt.sign({ userId: adminUser.id, role: 'ADMIN' }, JWT_SECRET);

    // Create REP User
    const repUser = await prisma.user.create({
      data: {
        email: 'rep@dealflow360.com',
        name: 'Sales Rep',
        role: 'REP'
      }
    });
    repToken = jwt.sign({ userId: repUser.id, role: 'REP' }, JWT_SECRET);

    // Create CUSTOMER User
    const custUser = await prisma.user.create({
      data: {
        email: 'customer@client.com',
        name: 'Client User',
        role: 'CUSTOMER',
        isPortalUser: true
      }
    });
    customerToken = jwt.sign({ userId: custUser.id, role: 'CUSTOMER' }, JWT_SECRET);
  });

  afterAll(async () => {
    await prisma.creditNote.deleteMany();
    await prisma.billingScheduleEntry.deleteMany();
    await prisma.subscription.deleteMany();
    await prisma.subscriptionPlan.deleteMany();
    await prisma.quotationLine.deleteMany();
    await prisma.quotation.deleteMany();
    await prisma.product.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  // ==========================================================================
  // SECTION 1: Pure Proration Math (Hand-calculated verification)
  // ==========================================================================
  describe('Proration Math - Hand-Calculated Verification', () => {
    it('MUST match hand-calculated example exactly: (4-2) * $150/unit * (20/30) = $200.00', () => {
      // Monthly plan, $300/month for quantity 2 (so $150/unit)
      // 10 days into a 30-day cycle, quantity doubles to 4
      // Days remaining: 20 of 30
      // Prorated charge = (4-2) * $150 * (20/30) = 2 * 150 * (2/3) = $200
      const result = calculateProration({
        oldQuantity: 2,
        newQuantity: 4,
        pricePerUnit: 150,
        daysRemaining: 20,
        totalDaysInCycle: 30
      });

      expect(result).toBe(200);
    });

    it('should calculate negative proration amount correctly when quantity decreases', () => {
      // Quantity drops from 4 to 2 (20 of 30 days remaining at $150/unit)
      // (2 - 4) * $150 * (20/30) = -2 * 150 * (2/3) = -$200
      const result = calculateProration({
        oldQuantity: 4,
        newQuantity: 2,
        pricePerUnit: 150,
        daysRemaining: 20,
        totalDaysInCycle: 30
      });

      expect(result).toBe(-200);
    });

    it('should return 0 when daysRemaining is 0 (cancelling/changing on last day of cycle)', () => {
      const result = calculateProration({
        oldQuantity: 2,
        newQuantity: 4,
        pricePerUnit: 150,
        daysRemaining: 0,
        totalDaysInCycle: 30
      });

      expect(result).toBe(0);
    });
  });

  // ==========================================================================
  // SECTION 2: Subscription Plan CRUD Endpoints
  // ==========================================================================
  describe('Subscription Plan CRUD (POST/GET/PUT/DELETE /subscriptions/plans)', () => {
    let createdPlanId: string;

    it('should allow ADMIN to create a subscription plan', async () => {
      const res = await request(app)
        .post('/subscriptions/plans')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Pro SaaS Plan',
          billingCycle: 'MONTHLY',
          pricePerCycle: 150.0
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe('Pro SaaS Plan');
      expect(res.body.pricePerCycle).toBe(150.0);
      expect(res.body.billingCycle).toBe('MONTHLY');
      expect(res.body.isActive).toBe(true);

      createdPlanId = res.body.id;
    });

    it('should REJECT non-admin (REP) from creating a plan with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/subscriptions/plans')
        .set('Authorization', `Bearer ${repToken}`)
        .send({
          name: 'Unauthorized Plan',
          pricePerCycle: 99.0
        });

      expect(res.status).toBe(403);
    });

    it('should list all active subscription plans', async () => {
      const res = await request(app).get('/subscriptions/plans');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });

    it('should allow ADMIN to update a subscription plan', async () => {
      const res = await request(app)
        .put(`/subscriptions/plans/${createdPlanId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Pro SaaS Plan - Updated',
          pricePerCycle: 175.0
        });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Pro SaaS Plan - Updated');
      expect(res.body.pricePerCycle).toBe(175.0);
    });

    it('should allow ADMIN to deactivate a subscription plan', async () => {
      const res = await request(app)
        .delete(`/subscriptions/plans/${createdPlanId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.plan.isActive).toBe(false);
    });
  });

  // ==========================================================================
  // SECTION 3: Subscription Creation & Billing Schedule Generation
  // ==========================================================================
  describe('POST /subscriptions (Create & Generate Schedules)', () => {
    let testPlanId: string;
    let quotationId: string;

    beforeAll(async () => {
      // Create a test plan ($150/month)
      const plan = await prisma.subscriptionPlan.create({
        data: {
          name: 'Standard Monthly',
          billingCycle: 'MONTHLY',
          pricePerCycle: 150.0,
          isActive: true
        }
      });
      testPlanId = plan.id;

      // Create a quotation
      const quote = await prisma.quotation.create({
        data: {
          quoteNumber: 'QT-2026-SUB-01',
          userId: adminUserId,
          status: 'ACCEPTED',
          totalAmount: 300.0
        }
      });
      quotationId = quote.id;
    });

    it('should create subscription and generate 12 billing schedule entries', async () => {
      const startDate = new Date('2026-01-01T00:00:00.000Z');
      const res = await request(app)
        .post('/subscriptions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          quotationId,
          planId: testPlanId,
          quantity: 2,
          startDate: startDate.toISOString(),
          cyclesToGenerate: 12
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.quantity).toBe(2);
      expect(res.body.status).toBe('ACTIVE');
      expect(res.body.billingScheduleEntries).toHaveLength(12);

      // First entry should be INVOICED on start date ($150 * 2 = $300)
      const firstEntry = res.body.billingScheduleEntries[0];
      expect(firstEntry.status).toBe('INVOICED');
      expect(firstEntry.amount).toBe(300.0);

      // Subsequent entries should be UPCOMING
      const secondEntry = res.body.billingScheduleEntries[1];
      expect(secondEntry.status).toBe('UPCOMING');
      expect(secondEntry.amount).toBe(300.0);
    });
  });

  // ==========================================================================
  // SECTION 4: Quantity Change & Proration Flow (PATCH /subscriptions/:id/quantity)
  // ==========================================================================
  describe('PATCH /subscriptions/:id/quantity (Proration Engine)', () => {
    let subscriptionId: string;

    beforeEach(async () => {
      // Clean up previous test subscriptions
      await prisma.creditNote.deleteMany();
      await prisma.billingScheduleEntry.deleteMany();
      await prisma.subscription.deleteMany();

      // Create plan: $150/unit/month
      const plan = await prisma.subscriptionPlan.create({
        data: {
          name: 'Math Verification Plan',
          billingCycle: 'MONTHLY',
          pricePerCycle: 150.0,
          isActive: true
        }
      });

      // Period: 30 days total (Jan 1 to Jan 31)
      const periodStart = new Date('2026-01-01T00:00:00.000Z');
      const periodEnd = new Date('2026-01-31T00:00:00.000Z');

      const sub = await prisma.subscription.create({
        data: {
          planId: plan.id,
          quantity: 2,
          startDate: periodStart,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          status: 'ACTIVE'
        }
      });
      subscriptionId = sub.id;

      // Seed 3 schedule entries
      await prisma.billingScheduleEntry.createMany({
        data: [
          {
            subscriptionId: sub.id,
            billingDate: periodStart,
            amount: 300.0,
            status: 'INVOICED',
            description: 'Cycle 1'
          },
          {
            subscriptionId: sub.id,
            billingDate: periodEnd,
            amount: 300.0,
            status: 'UPCOMING',
            description: 'Cycle 2'
          },
          {
            subscriptionId: sub.id,
            billingDate: new Date('2026-03-02T00:00:00.000Z'),
            amount: 300.0,
            status: 'UPCOMING',
            description: 'Cycle 3'
          }
        ]
      });
    });

    it('Quantity Increase: upgrades 2 -> 4 at day 10 (20 of 30 days remaining) -> immediate prorated charge of $200.00', async () => {
      // Effective date: Jan 11 (10 days into 30-day cycle => 20 days remaining)
      const effectiveDate = new Date('2026-01-11T00:00:00.000Z');

      const res = await request(app)
        .patch(`/subscriptions/${subscriptionId}/quantity`)
        .send({
          newQuantity: 4,
          effectiveDate: effectiveDate.toISOString()
        });

      expect(res.status).toBe(200);
      expect(res.body.proratedAmount).toBe(200.0);
      expect(res.body.action).toBe('CHARGE');
      expect(res.body.subscription.quantity).toBe(4);

      // Immediate INVOICED entry created for prorated $200
      expect(res.body.immediateEntry).toBeDefined();
      expect(res.body.immediateEntry.status).toBe('INVOICED');
      expect(res.body.immediateEntry.amount).toBe(200.0);

      // Future entries updated to new regular cycle amount: 4 * $150 = $600
      const futureEntries = await prisma.billingScheduleEntry.findMany({
        where: { subscriptionId, status: 'UPCOMING' }
      });
      expect(futureEntries.length).toBeGreaterThanOrEqual(2);
      expect(futureEntries[0].amount).toBe(600.0);
      expect(futureEntries[1].amount).toBe(600.0);
    });

    it('CRITICAL EDGE CASE: Quantity Decrease creates CreditNote instead of negative invoice line', async () => {
      // First set quantity to 4
      await prisma.subscription.update({
        where: { id: subscriptionId },
        data: { quantity: 4 }
      });

      // Decrease from 4 to 2 at day 10 (20 of 30 days remaining)
      const effectiveDate = new Date('2026-01-11T00:00:00.000Z');

      const res = await request(app)
        .patch(`/subscriptions/${subscriptionId}/quantity`)
        .send({
          newQuantity: 2,
          effectiveDate: effectiveDate.toISOString()
        });

      expect(res.status).toBe(200);
      expect(res.body.proratedAmount).toBe(-200.0);
      expect(res.body.action).toBe('CREDIT');
      expect(res.body.subscription.quantity).toBe(2);

      // Must create a CreditNote for $200 overpayment
      expect(res.body.creditNote).toBeDefined();
      expect(res.body.creditNote.amount).toBe(200.0);

      // NO negative BillingScheduleEntry should exist anywhere in the DB
      const negativeEntries = await prisma.billingScheduleEntry.findMany({
        where: { subscriptionId, amount: { lt: 0 } }
      });
      expect(negativeEntries).toHaveLength(0);

      // Future UPCOMING entries updated to 2 * $150 = $300
      const futureEntries = await prisma.billingScheduleEntry.findMany({
        where: { subscriptionId, status: 'UPCOMING' }
      });
      expect(futureEntries[0].amount).toBe(300.0);
    });
  });

  // ==========================================================================
  // SECTION 5: Cancellation with Mid-Cycle Proration (POST /subscriptions/:id/cancel)
  // ==========================================================================
  describe('POST /subscriptions/:id/cancel (Cancellation Flow)', () => {
    let subPlanId: string;

    beforeAll(async () => {
      const plan = await prisma.subscriptionPlan.create({
        data: {
          name: 'Cancel Test Plan',
          billingCycle: 'MONTHLY',
          pricePerCycle: 100.0,
          isActive: true
        }
      });
      subPlanId = plan.id;
    });

    it('should issue CreditNote for mid-cycle cancellation and void future schedule entries', async () => {
      const periodStart = new Date('2026-01-01T00:00:00.000Z');
      const periodEnd = new Date('2026-01-31T00:00:00.000Z'); // 30 days

      const sub = await prisma.subscription.create({
        data: {
          planId: subPlanId,
          quantity: 2, // $200/month
          startDate: periodStart,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          status: 'ACTIVE'
        }
      });

      // Schedule entries
      await prisma.billingScheduleEntry.createMany({
        data: [
          { subscriptionId: sub.id, billingDate: periodStart, amount: 200, status: 'INVOICED' },
          { subscriptionId: sub.id, billingDate: periodEnd, amount: 200, status: 'UPCOMING' }
        ]
      });

      // Cancel at day 15 (15 of 30 days remaining) -> 50% refund = $100.00
      const effectiveDate = new Date('2026-01-16T00:00:00.000Z');

      const res = await request(app)
        .post(`/subscriptions/${sub.id}/cancel`)
        .send({
          effectiveDate: effectiveDate.toISOString(),
          reason: 'Customer requested cancellation'
        });

      expect(res.status).toBe(200);
      expect(res.body.subscription.status).toBe('CANCELLED');
      expect(res.body.creditNote).toBeDefined();
      expect(res.body.creditNote.amount).toBe(100.0);

      // Future UPCOMING schedule entries must be removed/voided
      const remainingUpcoming = await prisma.billingScheduleEntry.findMany({
        where: { subscriptionId: sub.id, status: 'UPCOMING' }
      });
      expect(remainingUpcoming).toHaveLength(0);
    });

    it('EDGE CASE: Cancelling on exact last day of cycle prorates to ~$0 credit without error', async () => {
      const periodStart = new Date('2026-01-01T00:00:00.000Z');
      const periodEnd = new Date('2026-01-31T00:00:00.000Z');

      const sub = await prisma.subscription.create({
        data: {
          planId: subPlanId,
          quantity: 1,
          startDate: periodStart,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          status: 'ACTIVE'
        }
      });

      // Cancel on exact end date
      const res = await request(app)
        .post(`/subscriptions/${sub.id}/cancel`)
        .send({
          effectiveDate: periodEnd.toISOString(),
          reason: 'Cancelled on last day'
        });

      expect(res.status).toBe(200);
      expect(res.body.subscription.status).toBe('CANCELLED');
      expect(res.body.unusedCredit).toBe(0);
      expect(res.body.creditNote).toBeNull();
    });
  });

  // ==========================================================================
  // SECTION 6: Combined Hybrid Order Invoice Endpoint (GET /orders/:orderId/invoice)
  // ==========================================================================
  describe('GET /orders/:orderId/invoice (Hybrid One-Time + Recurring Aggregation)', () => {
    let orderId: string;
    let quoteNumber: string;

    beforeAll(async () => {
      // 1. Create Product
      const prod = await prisma.product.create({
        data: {
          sku: 'HARDWARE-BOX-01',
          name: 'IoT Gateway Hardware',
          basePrice: 500.0
        }
      });

      // 2. Create Quotation with One-Time QuotationLines
      const quote = await prisma.quotation.create({
        data: {
          quoteNumber: 'ORD-HYBRID-999',
          userId: adminUserId,
          status: 'ACCEPTED',
          totalAmount: 1000.0
        }
      });
      orderId = quote.id;
      quoteNumber = quote.quoteNumber;

      // Add 2 hardware units at $500 = $1000 one-time
      await prisma.quotationLine.create({
        data: {
          quotationId: quote.id,
          productId: prod.id,
          quantity: 2,
          unitPrice: 500.0,
          totalPrice: 1000.0
        }
      });

      // 3. Create Subscription attached to this quotation ($150/month * 2 = $300 recurring)
      const plan = await prisma.subscriptionPlan.create({
        data: {
          name: 'Cloud Connectivity SaaS',
          billingCycle: 'MONTHLY',
          pricePerCycle: 150.0,
          isActive: true
        }
      });

      const periodStart = new Date('2026-01-01T00:00:00.000Z');
      const periodEnd = new Date('2026-02-01T00:00:00.000Z');

      const sub = await prisma.subscription.create({
        data: {
          quotationId: quote.id,
          planId: plan.id,
          quantity: 2,
          startDate: periodStart,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          status: 'ACTIVE'
        }
      });

      // Add upcoming schedule entry
      await prisma.billingScheduleEntry.create({
        data: {
          subscriptionId: sub.id,
          billingDate: periodEnd,
          amount: 300.0,
          status: 'UPCOMING',
          description: 'Cycle 2'
        }
      });
    });

    it('should return separated one-time and recurring totals and combined total', async () => {
      const res = await request(app).get(`/orders/${orderId}/invoice`);

      expect(res.status).toBe(200);
      expect(res.body.oneTimeTotal).toBe(1000.0);
      expect(res.body.recurringTotal).toBe(300.0);
      expect(res.body.combinedInvoiceTotal).toBe(1300.0);
      expect(res.body.quotationLines).toHaveLength(1);
      expect(res.body.subscriptions).toHaveLength(1);
      expect(res.body.upcomingSchedule).toHaveLength(1);
    });

    it('EDGE CASE: Subscription with zero remaining scheduled entries should return empty upcomingSchedule array without crashing', async () => {
      // Create empty quotation with subscription having 0 upcoming entries
      const emptyQuote = await prisma.quotation.create({
        data: {
          quoteNumber: 'ORD-EMPTY-SCHEDULE-01',
          userId: adminUserId,
          status: 'DRAFT',
          totalAmount: 0.0
        }
      });

      const plan = await prisma.subscriptionPlan.findFirst();

      await prisma.subscription.create({
        data: {
          quotationId: emptyQuote.id,
          planId: plan!.id,
          quantity: 1,
          startDate: new Date(),
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(),
          status: 'ACTIVE'
        }
      });

      const res = await request(app).get(`/orders/${emptyQuote.id}/invoice`);

      expect(res.status).toBe(200);
      expect(res.body.upcomingSchedule).toEqual([]);
      expect(res.body.oneTimeTotal).toBe(0);
      expect(res.body.recurringTotal).toBe(plan!.pricePerCycle);
    });
  });
});
