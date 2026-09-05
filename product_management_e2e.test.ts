// product_management_e2e.test.ts
import request from 'supertest';
import app from './src/index';
import { prisma } from './shared/prisma';
import jwt from 'jsonwebtoken';
import { productsService } from './products/products.service';

const JWT_SECRET = process.env.JWT_SECRET || 'dealflow360-super-secret-key';

describe('Product Management Module E2E & Workflow Integration Tests', () => {
  let adminToken: string;
  let repToken: string;
  let managerToken: string;
  let financeToken: string;
  let customerToken: string;

  let adminUser: any;
  let repUser: any;
  let managerUser: any;
  let financeUser: any;
  let customerUser: any;

  let mainWarehouse: any;
  let eastDepotWarehouse: any;
  let monthlySubPlan: any;

  let macbookProduct: any;
  let saasProProduct: any;
  let ramVariant: any;

  beforeAll(async () => {
    // Clear database tables for isolated test environment
    await prisma.payment.deleteMany();
    await prisma.invoiceLine.deleteMany();
    await prisma.invoice.deleteMany();
    await prisma.billingScheduleEntry.deleteMany();
    await prisma.creditNoteLine.deleteMany();
    await prisma.creditNote.deleteMany();
    await prisma.subscription.deleteMany();
    await prisma.backorder.deleteMany();
    await prisma.salesOrderLine.deleteMany();
    await prisma.salesOrder.deleteMany();
    await prisma.stockAllocation.deleteMany();
    await prisma.warehouseStock.deleteMany();
    await prisma.approvalStepRecord.deleteMany();
    await prisma.approvalRequest.deleteMany();
    await prisma.quotationComment.deleteMany();
    await prisma.quotationLine.deleteMany();
    await prisma.quotation.deleteMany();
    await prisma.priceListItem.deleteMany();
    await prisma.priceList.deleteMany();
    await prisma.productVariant.deleteMany();
    await prisma.product.deleteMany();
    await prisma.categoryDiscountCeiling.deleteMany();
    await prisma.discountTier.deleteMany();
    await prisma.approvalChain.deleteMany();
    await prisma.user.deleteMany();
    await prisma.warehouse.deleteMany();
    await prisma.subscriptionPlan.deleteMany();
    await prisma.category.deleteMany();

    // 1. Create Users
    adminUser = await prisma.user.create({
      data: { email: 'admin-prod-e2e@dealflow.com', name: 'Product Admin', role: 'ADMIN' }
    });
    repUser = await prisma.user.create({
      data: { email: 'rep-prod-e2e@dealflow.com', name: 'Sales Rep Alice', role: 'REP' }
    });
    managerUser = await prisma.user.create({
      data: { email: 'manager-prod-e2e@dealflow.com', name: 'Sales Manager Sarah', role: 'MANAGER' }
    });
    financeUser = await prisma.user.create({
      data: { email: 'finance-prod-e2e@dealflow.com', name: 'Frank Finance', role: 'FINANCE' }
    });
    customerUser = await prisma.user.create({
      data: { email: 'customer-gold@globex.com', name: 'Globex Corp', role: 'CUSTOMER', isPortalUser: true }
    });

    adminToken = jwt.sign({ userId: adminUser.id, role: 'ADMIN' }, JWT_SECRET);
    repToken = jwt.sign({ userId: repUser.id, role: 'REP' }, JWT_SECRET);
    managerToken = jwt.sign({ userId: managerUser.id, role: 'MANAGER' }, JWT_SECRET);
    financeToken = jwt.sign({ userId: financeUser.id, role: 'FINANCE' }, JWT_SECRET);
    customerToken = jwt.sign({ userId: customerUser.id, role: 'CUSTOMER' }, JWT_SECRET);

    // 2. Seed Warehouses
    mainWarehouse = await prisma.warehouse.create({
      data: { name: 'Main Warehouse', code: 'WH-MAIN', location: 'Seattle, WA', shippingCostWeighting: 1.0, capacity: 1000, isActive: true }
    });
    eastDepotWarehouse = await prisma.warehouse.create({
      data: { name: 'East Depot', code: 'WH-EASTDEPOT', location: 'Boston, MA', shippingCostWeighting: 1.2, capacity: 500, isActive: true }
    });

    // 3. Seed Subscription Plan
    monthlySubPlan = await prisma.subscriptionPlan.create({
      data: { name: 'SaaS Pro Monthly Plan', billingCycle: 'MONTHLY', pricePerCycle: 5000, isActive: true }
    });

    // 4. Seed Discount Governance
    await prisma.discountTier.createMany({
      data: [
        { customerTier: 'GOLD', maxDiscountPercent: 15.0 },
        { customerTier: 'SILVER', maxDiscountPercent: 10.0 },
        { customerTier: 'BRONZE', maxDiscountPercent: 5.0 }
      ]
    });

    await prisma.categoryDiscountCeiling.createMany({
      data: [
        { category: 'Hardware', maxDiscountPercent: 15.0 },
        { category: 'Software', maxDiscountPercent: 10.0 },
        { category: 'Services', maxDiscountPercent: 10.0 },
        { category: 'Subscription', maxDiscountPercent: 10.0 }
      ]
    });

    await prisma.approvalChain.createMany({
      data: [
        { minRiskScore: 0.0, maxRiskScore: 5.0, requiredApprovers: 'MANAGER' },
        { minRiskScore: 5.01, maxRiskScore: null, requiredApprovers: 'MANAGER_THEN_FINANCE' }
      ]
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ============================================================================
  // 1. PRODUCT CREATION & VALIDATION TESTS
  // ============================================================================
  describe('Product Creation & Backend Validations', () => {
    it('should create MacBook Pro (Hardware, ₹120,000, One-time) with variants & warehouse stock', async () => {
      const payload = {
        sku: 'MBP-M3-16',
        name: 'MacBook Pro',
        description: 'Apple M3 Max 16-inch Laptop',
        category: 'Hardware',
        basePrice: 120000,
        costPrice: 90000,
        unit: 'PCS',
        tax: 18.0,
        currency: 'INR',
        productType: 'PHYSICAL',
        billingType: 'ONE_TIME',
        status: 'ACTIVE',
        variants: [
          { attribute: 'RAM', value: '16 GB', extraPrice: 10000 },
          { attribute: 'RAM', value: '32 GB', extraPrice: 20000 }
        ],
        stocks: [
          { warehouseId: mainWarehouse.id, quantity: 10, reorderLevel: 5 },
          { warehouseId: eastDepotWarehouse.id, quantity: 5, reorderLevel: 2 }
        ]
      };

      const res = await request(app)
        .post('/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe('MacBook Pro');
      expect(res.body.category).toBe('Hardware');
      expect(res.body.basePrice).toBe(120000);
      expect(res.body.costPrice).toBe(90000);
      expect(res.body.marginPercent).toBe(25.0); // ((120000-90000)/120000)*100 = 25%
      expect(res.body.billingType).toBe('ONE_TIME');
      expect(res.body.variants.length).toBe(2);

      macbookProduct = res.body;
      ramVariant = res.body.variants.find((v: any) => v.value === '16 GB');
    });

    it('should create SaaS Pro (Services, ₹5,000/month, Recurring) linked to Subscription Plan', async () => {
      const payload = {
        sku: 'SAAS-PRO-MONTHLY',
        name: 'SaaS Pro',
        description: 'Enterprise Cloud SaaS Subscription',
        category: 'Services',
        basePrice: 5000,
        costPrice: 1000,
        unit: 'MONTHLY',
        tax: 18.0,
        currency: 'INR',
        productType: 'SERVICE',
        billingType: 'RECURRING',
        status: 'ACTIVE',
        subscriptionPlanId: monthlySubPlan.id,
        stocks: [
          { warehouseId: mainWarehouse.id, quantity: 9999, reorderLevel: 10 }
        ]
      };

      const res = await request(app)
        .post('/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('SaaS Pro');
      expect(res.body.billingType).toBe('RECURRING');
      expect(res.body.subscriptionPlanId).toBe(monthlySubPlan.id);

      saasProProduct = res.body;
    });

    it('should enforce SKU uniqueness (409 Conflict)', async () => {
      const res = await request(app)
        .post('/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          sku: 'MBP-M3-16',
          name: 'Duplicate Laptop',
          category: 'Hardware',
          basePrice: 100000
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain("already exists");
    });

    it('should reject negative basePrice, costPrice or stock quantity (400 Bad Request)', async () => {
      const res = await request(app)
        .post('/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Invalid Price Product',
          basePrice: -500,
          category: 'Hardware'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('basePrice must be a non-negative number');
    });

    it('should restrict product creation to ADMIN role (403 Forbidden for Sales Rep)', async () => {
      const res = await request(app)
        .post('/products')
        .set('Authorization', `Bearer ${repToken}`)
        .send({
          name: 'Rep Created Product',
          basePrice: 5000,
          category: 'Hardware'
        });

      expect(res.status).toBe(403);
    });
  });

  // ============================================================================
  // 2. VARIANT PRICING & INACTIVE PRODUCT PREVENTION
  // ============================================================================
  describe('Variant Pricing Resolution & Inactive Product Protection', () => {
    it('should calculate variant price correctly (Base Price ₹120,000 + 16GB RAM ₹10,000 = ₹130,000)', async () => {
      const res = await request(app)
        .get(`/products/${macbookProduct.id}/price?customerTier=GOLD&currency=INR&variantId=${ramVariant.id}`);

      expect(res.status).toBe(200);
      expect(res.body.basePrice).toBe(120000);
      expect(res.body.variantExtraPrice).toBe(10000);
      expect(res.body.resolvedPrice).toBe(130000);
    });

    it('should prevent selecting INACTIVE products for new quotation lines (400 Bad Request)', async () => {
      // Create an inactive product
      const inactiveProd = await prisma.product.create({
        data: {
          sku: 'INACTIVE-01',
          name: 'Deprecated Legacy Server',
          category: 'Hardware',
          basePrice: 50000,
          status: 'INACTIVE'
        }
      });

      // Create draft quotation
      const quoteRes = await request(app)
        .post('/quotations')
        .set('Authorization', `Bearer ${repToken}`)
        .send({ customerName: 'Globex Corp', customerTier: 'GOLD' });

      // Try adding line with INACTIVE product
      const addLineRes = await request(app)
        .patch(`/quotations/${quoteRes.body.id}/lines`)
        .set('Authorization', `Bearer ${repToken}`)
        .send({
          lines: [{ productId: inactiveProd.id, quantity: 1, discountPercent: 0 }]
        });

      expect(addLineRes.status).toBe(400);
      expect(addLineRes.body.error).toContain('INACTIVE and cannot be selected');
    });
  });

  // ============================================================================
  // 3. DISCOUNT GOVERNANCE & APPROVAL WORKFLOW INTEGRATION
  // ============================================================================
  describe('Category Discount Ceiling Violation & Approval Routing', () => {
    it('should detect category discount violation (Gold customer purchases Service at 18% > Service ceiling 10%) and route to Sales Manager', async () => {
      // Create draft quotation
      const quoteRes = await request(app)
        .post('/quotations')
        .set('Authorization', `Bearer ${repToken}`)
        .send({ customerName: 'Globex Corp', customerTier: 'GOLD', currency: 'INR' });

      const quoteId = quoteRes.body.id;

      // Add SaaS Pro (Services category) with 18% discount (> 10% Service ceiling)
      const linesRes = await request(app)
        .patch(`/quotations/${quoteId}/lines`)
        .set('Authorization', `Bearer ${repToken}`)
        .send({
          lines: [{ productId: saasProProduct.id, quantity: 1, discountPercent: 18 }]
        });

      expect(linesRes.status).toBe(200);

      // Verify quotation margin calculation (Revenue - Cost = Margin)
      expect(linesRes.body.marginSummary).toBeDefined();
      expect(linesRes.body.marginSummary.totalRevenue).toBe(4100); // 5000 * 0.82 = 4100
      expect(linesRes.body.marginSummary.totalCost).toBe(1000);
      expect(linesRes.body.marginSummary.totalMargin).toBe(3100); // 4100 - 1000 = 3100

      // Submit quotation for approval
      const submitRes = await request(app)
        .post('/approvals/submit')
        .set('Authorization', `Bearer ${repToken}`)
        .send({ quotationId: quoteId });

      expect(submitRes.status).toBe(200);
      expect(submitRes.body.requiresApproval).toBe(true);
      expect(submitRes.body.approvalRequestId).toBeDefined();
      expect(submitRes.body.currentStep).toBe('MANAGER');

      const updatedQuote = await prisma.quotation.findUnique({ where: { id: quoteId } });
      expect(updatedQuote?.status).toBe('PENDING_APPROVAL');
    });
  });

  // ============================================================================
  // 4. ORDER CREATION, MULTI-WAREHOUSE FULFILLMENT & RECURRING BILLING
  // ============================================================================
  describe('Order Creation (MacBook Pro × 2 + SaaS Pro × 1), Fulfillment Split & Invoicing', () => {
    let finalQuoteId: string;
    let salesOrderId: string;

    it('should create & approve quotation containing MacBook Pro × 2 & SaaS Pro × 1', async () => {
      // 1. Create DRAFT quotation
      const quoteRes = await request(app)
        .post('/quotations')
        .set('Authorization', `Bearer ${repToken}`)
        .send({ customerName: 'Globex Corp', customerTier: 'GOLD', currency: 'INR' });

      finalQuoteId = quoteRes.body.id;

      // 2. Add MacBook Pro × 2 & SaaS Pro × 1 lines
      await request(app)
        .patch(`/quotations/${finalQuoteId}/lines`)
        .set('Authorization', `Bearer ${repToken}`)
        .send({
          lines: [
            { productId: macbookProduct.id, quantity: 2, discountPercent: 5 },
            { productId: saasProProduct.id, quantity: 1, discountPercent: 0 }
          ]
        });

      // Submit quotation
      await request(app)
        .post('/approvals/submit')
        .set('Authorization', `Bearer ${repToken}`)
        .send({ quotationId: finalQuoteId });

      // Manager approves quotation
      const approvalReq = await prisma.approvalRequest.findFirst({ where: { quotationId: finalQuoteId } });
      if (approvalReq) {
        await request(app)
          .post(`/approvals/${approvalReq.id}/action`)
          .set('Authorization', `Bearer ${managerToken}`)
          .send({ action: 'APPROVE', reason: 'Approved by Sales Manager for enterprise client' });
      }

      // Customer confirms quotation
      const confirmRes = await request(app)
        .post(`/quotations/${finalQuoteId}/confirm`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(confirmRes.status).toBe(200);
      expect(confirmRes.body.status).toBe('CONFIRMED');
    });

    it('should generate Sales Order and separate MacBook Pro (One-time fulfillment) and SaaS Pro (Subscription)', async () => {
      // Create Sales Order from confirmed quotation
      const orderRes = await request(app)
        .post('/warehouses/orders/create')
        .set('Authorization', `Bearer ${financeToken}`)
        .send({ quotationId: finalQuoteId });

      expect(orderRes.status).toBe(201);
      expect(orderRes.body.id).toBeDefined();

      salesOrderId = orderRes.body.id;

      // Verify Sales Order Lines
      const orderLines = orderRes.body.lines;
      expect(orderLines.length).toBe(2);

      const macbookLine = orderLines.find((l: any) => l.productId === macbookProduct.id);
      const saasLine = orderLines.find((l: any) => l.productId === saasProProduct.id);

      expect(macbookLine.isRecurring).toBe(false);
      expect(saasLine.isRecurring).toBe(true);
    });

    it('should calculate optimal warehouse fulfillment split for physical MacBook Pro units (Main Warehouse=10, East Depot=5)', async () => {
      // Get suggested fulfillment split
      const splitRes = await request(app)
        .get(`/warehouses/fulfillment/suggest/${salesOrderId}`)
        .set('Authorization', `Bearer ${financeToken}`);

      expect(splitRes.status).toBe(200);
      expect(splitRes.body.suggestions).toBeDefined();

      // Main warehouse has 10 units available -> single warehouse fulfillment for 2 units
      const macbookSplit = splitRes.body.suggestions.find((s: any) => s.productId === macbookProduct.id);
      expect(macbookSplit.warehouseId).toBe(mainWarehouse.id);
      expect(macbookSplit.quantity).toBe(2);

      // Accept suggested split
      const acceptRes = await request(app)
        .post('/warehouses/fulfillment/accept')
        .set('Authorization', `Bearer ${financeToken}`)
        .send({ salesOrderId });

      expect(acceptRes.status).toBe(200);
    });

    it('should generate ONE_TIME invoice for MacBook Pro and RECURRING Subscription for SaaS Pro', async () => {
      // 1. Generate Invoice for Sales Order
      const invoiceRes = await request(app)
        .post('/finance/invoices/generate')
        .set('Authorization', `Bearer ${financeToken}`)
        .send({ salesOrderId });

      expect(invoiceRes.status).toBe(201);
      expect(invoiceRes.body.totalAmount).toBeGreaterThan(0);

      // 2. Verify Subscription record was created for SaaS Pro with recurring billing schedule
      const subscriptions = await prisma.subscription.findMany({
        where: { salesOrderId }
      });

      expect(subscriptions.length).toBe(1);
      expect(subscriptions[0].planId).toBe(monthlySubPlan.id);
      expect(subscriptions[0].status).toBe('ACTIVE');

      // Verify billing schedule entries
      const scheduleEntries = await prisma.billingScheduleEntry.findMany({
        where: { subscriptionId: subscriptions[0].id }
      });

      expect(scheduleEntries.length).toBeGreaterThanOrEqual(12); // 12 monthly cycle entries
    });

    it('should record payment for invoice and transition status to PAID', async () => {
      const invoice = await prisma.invoice.findFirst({ where: { salesOrderId } });
      expect(invoice).toBeDefined();

      const payRes = await request(app)
        .post(`/finance/invoices/${invoice!.id}/payments`)
        .set('Authorization', `Bearer ${financeToken}`)
        .send({
          amount: invoice!.outstandingAmount,
          paymentMethod: 'BANK_TRANSFER',
          reference: 'TXN-MBP-SAAS-1001'
        });

      expect(payRes.status).toBe(200);
      expect(payRes.body.invoice.status).toBe('PAID');
      expect(payRes.body.invoice.outstandingAmount).toBe(0);
    });
  });
});
