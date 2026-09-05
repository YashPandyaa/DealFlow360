// quick_test_flow.test.ts
import request from 'supertest';
import app from './src/index';
import { prisma } from './shared/prisma';
import bcrypt from 'bcryptjs';

describe('Quick Test Flow - End-to-End DealFlow360 Integration', () => {
  let repToken: string;
  let managerToken: string;
  let adminToken: string;

  let repUser: any;
  let managerUser: any;
  let adminUser: any;

  let serverProduct: any;
  let sensorProduct: any;
  let warrantyProduct: any;
  let subPlan: any;

  let whEast: any;
  let whWest: any;
  let whCentral: any;

  let createdQuotation: any;
  let approvalRequestId: string;

  beforeAll(async () => {
    // 1. Clean Database
    await prisma.stockAllocation.deleteMany();
    await prisma.quotationLine.deleteMany();
    await prisma.approvalStepRecord.deleteMany();
    await prisma.approvalRequest.deleteMany();
    await prisma.quotation.deleteMany();
    await prisma.approvalChain.deleteMany();
    await prisma.categoryDiscountCeiling.deleteMany();
    await prisma.discountTier.deleteMany();
    await prisma.upsellRule.deleteMany();
    await prisma.warehouseStock.deleteMany();
    await prisma.warehouse.deleteMany();
    await prisma.billingScheduleEntry.deleteMany();
    await prisma.creditNote.deleteMany();
    await prisma.subscription.deleteMany();
    await prisma.subscriptionPlan.deleteMany();
    await prisma.product.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.portalMagicLink.deleteMany();
    await prisma.user.deleteMany();

    // 2. Create Users
    const hashedPassword = await bcrypt.hash('Password123!', 10);
    adminUser = await prisma.user.create({
      data: {
        email: 'admin_flow@dealflow.com',
        passwordHash: hashedPassword,
        name: 'Admin Flow',
        role: 'ADMIN'
      }
    });

    managerUser = await prisma.user.create({
      data: {
        email: 'manager_flow@dealflow.com',
        passwordHash: hashedPassword,
        name: 'Manager Flow',
        role: 'MANAGER',
        teamId: 'TEAM-EAST'
      }
    });

    repUser = await prisma.user.create({
      data: {
        email: 'rep_flow@dealflow.com',
        passwordHash: hashedPassword,
        name: 'Sales Rep Flow',
        role: 'REP',
        teamId: 'TEAM-EAST'
      }
    });

    // 3. Create Products
    serverProduct = await prisma.product.create({
      data: {
        sku: 'HW-SRV-100',
        name: 'Enterprise App Server',
        category: 'Hardware',
        basePrice: 4000.0,
        marginPercent: 35.0
      }
    });

    sensorProduct = await prisma.product.create({
      data: {
        sku: 'HW-IOT-SENSOR',
        name: 'Telemetry Sensor Pack',
        category: 'Hardware',
        basePrice: 100.0,
        marginPercent: 45.0
      }
    });

    warrantyProduct = await prisma.product.create({
      data: {
        sku: 'SVC-EXT-WAR',
        name: '3-Year Extended Warranty Support',
        category: 'Services',
        basePrice: 600.0,
        marginPercent: 60.0
      }
    });

    // 4. Create Subscription Plan
    subPlan = await prisma.subscriptionPlan.create({
      data: {
        name: 'Enterprise Cloud Fleet License',
        billingCycle: 'MONTHLY',
        pricePerCycle: 250.0
      }
    });

    // 5. Create Upsell Rule (Server -> Extended Warranty)
    await prisma.upsellRule.create({
      data: {
        triggerProductId: serverProduct.id,
        suggestedProductId: warrantyProduct.id,
        coPurchaseScore: 0.92,
        isPromoted: true
      }
    });

    // 6. Create Warehouses and stock levels:
    // Sensor Product: East = 3, West = 4, Central = 0
    whEast = await prisma.warehouse.create({
      data: { code: 'WH-EAST', name: 'East Coast DC', location: 'Newark, NJ', isActive: true }
    });
    whWest = await prisma.warehouse.create({
      data: { code: 'WH-WEST', name: 'West Coast DC', location: 'Reno, NV', isActive: true }
    });
    whCentral = await prisma.warehouse.create({
      data: { code: 'WH-CENTRAL', name: 'Central DC', location: 'Dallas, TX', isActive: true }
    });

    await prisma.warehouseStock.createMany({
      data: [
        { warehouseId: whEast.id, productId: sensorProduct.id, quantity: 3, allocatedQty: 0 },
        { warehouseId: whWest.id, productId: sensorProduct.id, quantity: 4, allocatedQty: 0 },
        { warehouseId: whCentral.id, productId: sensorProduct.id, quantity: 0, allocatedQty: 0 },
        { warehouseId: whEast.id, productId: serverProduct.id, quantity: 5, allocatedQty: 0 }
      ]
    });

    // 7. Discount Governance (Ceiling 15% for Hardware, Approval chain for risk > 0)
    await prisma.discountTier.create({
      data: {
        customerTier: 'GOLD',
        maxDiscountPercent: 15.0
      }
    });

    await prisma.categoryDiscountCeiling.create({
      data: {
        category: 'Hardware',
        maxDiscountPercent: 15.0
      }
    });

    await prisma.categoryDiscountCeiling.create({
      data: {
        category: 'Services',
        maxDiscountPercent: 20.0
      }
    });

    await prisma.approvalChain.create({
      data: {
        minRiskScore: 0.01,
        maxRiskScore: null,
        requiredApprovers: 'MANAGER'
      }
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // Step 1: Authentication & RBAC
  test('Step 1: User Login and Token Retrieval', async () => {
    const repRes = await request(app)
      .post('/auth/login')
      .send({ email: 'rep_flow@dealflow.com', password: 'Password123!' });
    expect(repRes.status).toBe(200);
    expect(repRes.body.token).toBeDefined();
    repToken = repRes.body.token;

    const mgrRes = await request(app)
      .post('/auth/login')
      .send({ email: 'manager_flow@dealflow.com', password: 'Password123!' });
    expect(mgrRes.status).toBe(200);
    expect(mgrRes.body.token).toBeDefined();
    managerToken = mgrRes.body.token;

    const admRes = await request(app)
      .post('/auth/login')
      .send({ email: 'admin_flow@dealflow.com', password: 'Password123!' });
    expect(admRes.status).toBe(200);
    expect(admRes.body.token).toBeDefined();
    adminToken = admRes.body.token;
  });

  // Step 2: Create Quotation via Quotations CRUD API with Server + 10 Sensors + Discount
  test('Step 2: Create Quotation and upsert lines via Quotations CRUD API', async () => {
    // Create DRAFT quotation via POST /quotations
    const createRes = await request(app)
      .post('/quotations')
      .set('Authorization', `Bearer ${repToken}`)
      .send({
        customerName: 'Apex Logistics Global',
        customerTier: 'GOLD'
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.id).toBeDefined();
    const quotationId = createRes.body.id;

    // Add line items via PATCH /quotations/:id/lines
    const linesRes = await request(app)
      .patch(`/quotations/${quotationId}/lines`)
      .set('Authorization', `Bearer ${repToken}`)
      .send({
        lines: [
          {
            productId: serverProduct.id,
            quantity: 1,
            discountPercent: 20.0 // Server base $4,000 * 0.8 = $3,200 (Exceeds 15% hardware ceiling)
          },
          {
            productId: sensorProduct.id,
            quantity: 10, // 10 units needed, available 7 across all warehouses (3 East, 4 West)
            discountPercent: 10.0 // Sensor base $100 * 10 * 0.9 = $900
          }
        ]
      });

    expect(linesRes.status).toBe(200);
    expect(linesRes.body.lines).toHaveLength(2);
    expect(linesRes.body.totalAmount).toBe(4100.0);

    createdQuotation = linesRes.body;
  });

  // Step 3: Check Upsell Recommendations
  test('Step 3: Upsell & Cross-Sell Engine provides suggestions for quotation items', async () => {
    const res = await request(app)
      .get(`/upsell/${createdQuotation.id}`)
      .set('Authorization', `Bearer ${repToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);

    const rec = res.body[0];
    expect(rec.productId).toBe(warrantyProduct.id);
    expect(rec.productName).toBe('3-Year Extended Warranty Support');
    expect(rec.isPromoted).toBe(true);
    expect(rec.marginDelta).toBeDefined();
  });

  // Step 4: Discount Risk Calculation
  test('Step 4: Calculate Discount Risk & Governance Flagging', async () => {
    const res = await request(app)
      .post('/discounts/calculate-risk')
      .set('Authorization', `Bearer ${repToken}`)
      .send({
        customerTier: 'GOLD',
        lines: [
          {
            category: 'Hardware',
            discountPercent: 20.0,
            lineTotal: 3200.0
          },
          {
            category: 'Hardware',
            discountPercent: 10.0,
            lineTotal: 900.0
          }
        ]
      });

    expect(res.status).toBe(200);
    expect(res.body.blendedRiskScore).toBeGreaterThan(0);
    expect(res.body.flaggedLines).toHaveLength(1);
    expect(res.body.requiredApprovalChain).toBe('MANAGER');
  });

  // Step 5: Approval Workflow Submission and Multi-Level Sign-off
  test('Step 5: Submit for Approval & Manager Action', async () => {
    const submitRes = await request(app)
      .post('/approvals/submit')
      .set('Authorization', `Bearer ${repToken}`)
      .send({
        quotationId: createdQuotation.id,
        customerTier: 'GOLD'
      });

    expect([200, 201]).toContain(submitRes.status);
    expect(submitRes.body.requiresApproval).toBe(true);
    expect(submitRes.body.approvalRequestId).toBeDefined();
    approvalRequestId = submitRes.body.approvalRequestId;

    // Manager approves
    const actionRes = await request(app)
      .post(`/approvals/${approvalRequestId}/action`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        action: 'APPROVED',
        reason: 'Approved by Regional Sales Manager'
      });

    expect(actionRes.status).toBe(200);
    expect(actionRes.body.status).toBe('APPROVED');
  });

  // Step 6: Multi-Warehouse Fulfillment Split
  test('Step 6: Multi-Warehouse Auto-Split and Short-Stock Allocation', async () => {
    const fulfillRes = await request(app)
      .post(`/warehouses/fulfill/${createdQuotation.id}`)
      .set('Authorization', `Bearer ${managerToken}`);

    expect(fulfillRes.status).toBe(200);
    expect(fulfillRes.body.status).toBe('PARTIALLY_ALLOCATED');
    expect(fulfillRes.body.fulfillmentSummary.fullyAllocated).toBe(false);
    expect(fulfillRes.body.fulfillmentSummary.totalItemsRequested).toBe(11); // 1 server + 10 sensors
    expect(fulfillRes.body.fulfillmentSummary.allocatedItems).toBe(8); // 1 server + 7 sensors
    expect(fulfillRes.body.fulfillmentSummary.backorderedItems).toBe(3); // 3 sensors backordered
    expect(fulfillRes.body.allocations.length).toBeGreaterThanOrEqual(3);
  });

  // Step 7: Unified Invoicing & Schedule
  test('Step 7: Unified Invoice Generation with One-Time & Recurring Breakdown', async () => {
    // Attach a subscription to this quotation to test combined billing
    const sub = await prisma.subscription.create({
      data: {
        quotationId: createdQuotation.id,
        planId: subPlan.id,
        quantity: 1,
        status: 'ACTIVE',
        startDate: new Date(),
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    });

    await prisma.billingScheduleEntry.create({
      data: {
        subscriptionId: sub.id,
        billingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        amount: 250.0,
        status: 'UPCOMING',
        description: 'Month 2 License Fee'
      }
    });

    const invoiceRes = await request(app)
      .get(`/orders/${createdQuotation.id}/invoice`)
      .set('Authorization', `Bearer ${repToken}`);

    expect(invoiceRes.status).toBe(200);
    expect(invoiceRes.body.orderId).toBe(createdQuotation.id);
    expect(invoiceRes.body.oneTimeTotal).toBe(4100.0);
    expect(invoiceRes.body.recurringTotal).toBe(250.0);
    expect(invoiceRes.body.combinedInvoiceTotal).toBe(4350.0);
    expect(invoiceRes.body.quotationLines).toHaveLength(2);
    expect(invoiceRes.body.subscriptions).toHaveLength(1);
    expect(invoiceRes.body.upcomingSchedule).toBeDefined();
    expect(invoiceRes.body.upcomingSchedule.length).toBe(1);
  });

  // Step 8: Deal Health Analytics and Reporting
  test('Step 8: Reporting & Deal Health Analytics Verification', async () => {
    const reportRes = await request(app)
      .get('/reports/deal-health')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(reportRes.status).toBe(200);
    expect(reportRes.body.stalledDeals).toBeDefined();
    expect(reportRes.body.discountAnomalies).toBeDefined();
    expect(reportRes.body.deliverySlippage).toBeDefined();

    const quotesRes = await request(app)
      .get('/reports/quotations')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(quotesRes.status).toBe(200);
    expect(quotesRes.body.quotations).toBeDefined();
    expect(quotesRes.body.quotations.length).toBeGreaterThan(0);
  });
});
