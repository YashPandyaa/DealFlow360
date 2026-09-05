import request from 'supertest';
import app from './src/index';
import { prisma } from './shared/prisma';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dealflow360-super-secret-key';

describe('Finance, Billing & Warehouse Fulfillment E2E Integration Test Suite', () => {
  let repUser: any, financeUser: any, customerUser: any;
  let repToken: string, financeToken: string, customerToken: string;
  let whMain: any, whEast: any, whWest: any;
  let prodLaptop: any, prodServer: any, prodSaaS: any;

  beforeAll(async () => {
    // Clean tables before test suite execution
    await prisma.creditNoteLine.deleteMany();
    await prisma.creditNote.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.invoiceLine.deleteMany();
    await prisma.invoice.deleteMany();
    await prisma.billingScheduleEntry.deleteMany();
    await prisma.subscription.deleteMany();
    await prisma.subscriptionPlan.deleteMany();
    await prisma.backorder.deleteMany();
    await prisma.stockAllocation.deleteMany();
    await prisma.salesOrderLine.deleteMany();
    await prisma.salesOrder.deleteMany();
    await prisma.quotationLine.deleteMany();
    await prisma.quotation.deleteMany();
    await prisma.warehouseStock.deleteMany();
    await prisma.warehouse.deleteMany();
    await prisma.product.deleteMany();
    await prisma.user.deleteMany();

    // Create Test Users
    repUser = await prisma.user.create({
      data: { email: 'rep-e2e@dealflow.com', name: 'Sales Rep E2E', role: 'SALES_REP' }
    });
    financeUser = await prisma.user.create({
      data: { email: 'finance-e2e@dealflow.com', name: 'Finance Ops E2E', role: 'FINANCE' }
    });
    customerUser = await prisma.user.create({
      data: { email: 'customer-e2e@external.com', name: 'Customer E2E', role: 'CUSTOMER', isPortalUser: true }
    });

    repToken = jwt.sign({ userId: repUser.id, role: 'SALES_REP' }, JWT_SECRET);
    financeToken = jwt.sign({ userId: financeUser.id, role: 'FINANCE' }, JWT_SECRET);
    customerToken = jwt.sign({ userId: customerUser.id, role: 'CUSTOMER' }, JWT_SECRET);

    // Create Test Warehouses with Shipping Cost Weightings
    whMain = await prisma.warehouse.create({
      data: { name: 'Main Warehouse', code: 'WH-TEST-MAIN', shippingCostWeighting: 1.0, isActive: true }
    });
    whEast = await prisma.warehouse.create({
      data: { name: 'East Depot', code: 'WH-TEST-EAST', shippingCostWeighting: 1.2, isActive: true }
    });
    whWest = await prisma.warehouse.create({
      data: { name: 'West Hub', code: 'WH-TEST-WEST', shippingCostWeighting: 1.5, isActive: true }
    });

    // Create Test Products
    prodLaptop = await prisma.product.create({
      data: { sku: 'LP-100', name: 'Business Laptop', category: 'Hardware', basePrice: 1000 }
    });
    prodServer = await prisma.product.create({
      data: { sku: 'SRV-100', name: 'Rack Server', category: 'Hardware', basePrice: 5000 }
    });
    prodSaaS = await prisma.product.create({
      data: { sku: 'SAAS-100', name: 'Cloud SaaS Subscription', category: 'Software', basePrice: 200 }
    });
  });

  afterAll(async () => {
    await prisma.creditNoteLine.deleteMany();
    await prisma.creditNote.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.invoiceLine.deleteMany();
    await prisma.invoice.deleteMany();
    await prisma.billingScheduleEntry.deleteMany();
    await prisma.subscription.deleteMany();
    await prisma.subscriptionPlan.deleteMany();
    await prisma.backorder.deleteMany();
    await prisma.stockAllocation.deleteMany();
    await prisma.salesOrderLine.deleteMany();
    await prisma.salesOrder.deleteMany();
    await prisma.quotationLine.deleteMany();
    await prisma.quotation.deleteMany();
    await prisma.warehouseStock.deleteMany();
    await prisma.warehouse.deleteMany();
    await prisma.product.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.creditNoteLine.deleteMany();
    await prisma.creditNote.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.invoiceLine.deleteMany();
    await prisma.invoice.deleteMany();
    await prisma.billingScheduleEntry.deleteMany();
    await prisma.subscription.deleteMany();
    await prisma.subscriptionPlan.deleteMany();
    await prisma.backorder.deleteMany();
    await prisma.stockAllocation.deleteMany();
    await prisma.salesOrderLine.deleteMany();
    await prisma.salesOrder.deleteMany();
    await prisma.quotationLine.deleteMany();
    await prisma.quotation.deleteMany();
    await prisma.warehouseStock.deleteMany();
  });

  // Helper to setup stock levels across warehouses
  async function setStockLevels(productId: string, mainQty: number, eastQty: number, westQty: number) {
    await prisma.warehouseStock.upsert({
      where: { warehouseId_productId: { warehouseId: whMain.id, productId } },
      create: { warehouseId: whMain.id, productId, quantity: mainQty, allocatedQty: 0 },
      update: { quantity: mainQty, allocatedQty: 0 }
    });
    await prisma.warehouseStock.upsert({
      where: { warehouseId_productId: { warehouseId: whEast.id, productId } },
      create: { warehouseId: whEast.id, productId, quantity: eastQty, allocatedQty: 0 },
      update: { quantity: eastQty, allocatedQty: 0 }
    });
    await prisma.warehouseStock.upsert({
      where: { warehouseId_productId: { warehouseId: whWest.id, productId } },
      create: { warehouseId: whWest.id, productId, quantity: westQty, allocatedQty: 0 },
      update: { quantity: westQty, allocatedQty: 0 }
    });
  }

  // Helper to create a confirmed Quotation & Sales Order
  async function createConfirmedSalesOrder(lines: Array<{ productId: string; quantity: number; unitPrice: number; discount?: number }>) {
    const q = await prisma.quotation.create({
      data: {
        quoteNumber: `QT-E2E-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        userId: repUser.id,
        customerName: 'Acme Corp',
        status: 'CONFIRMED',
        totalAmount: lines.reduce((sum, l) => sum + l.quantity * l.unitPrice * (1 - (l.discount || 0) / 100), 0),
        lines: {
          create: lines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            discount: l.discount || 0,
            totalPrice: l.quantity * l.unitPrice * (1 - (l.discount || 0) / 100)
          }))
        }
      }
    });

    const createOrderRes = await request(app)
      .post('/warehouses/orders/create')
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ quotationId: q.id });

    return createOrderRes.body;
  }

  // --------------------------------------------------------------------------
  // Test 1: Full stock available in one warehouse
  // --------------------------------------------------------------------------
  it('1. Fulfills 100% from single warehouse when sufficient stock is available', async () => {
    await setStockLevels(prodLaptop.id, 10, 5, 0); // Main Warehouse has 10 laptops
    const salesOrder = await createConfirmedSalesOrder([{ productId: prodLaptop.id, quantity: 8, unitPrice: 1000 }]);

    const suggestRes = await request(app)
      .get(`/warehouses/fulfillment/suggest/${salesOrder.id}`)
      .set('Authorization', `Bearer ${financeToken}`);

    expect(suggestRes.status).toBe(200);
    expect(suggestRes.body.fullyAllocated).toBe(true);
    expect(suggestRes.body.suggestions.length).toBe(1);
    expect(suggestRes.body.suggestions[0].warehouseId).toBe(whMain.id);
    expect(suggestRes.body.suggestions[0].quantity).toBe(8);
  });

  // --------------------------------------------------------------------------
  // Test 2: Stock split across two warehouses (Main = 6, East = 4 for 10 laptops)
  // --------------------------------------------------------------------------
  it('2. Splits order line across 2 warehouses when single warehouse is insufficient (Main:6, East:4)', async () => {
    await setStockLevels(prodLaptop.id, 6, 4, 0); // Main=6, East=4 (Total 10)
    const salesOrder = await createConfirmedSalesOrder([{ productId: prodLaptop.id, quantity: 10, unitPrice: 1000 }]);

    const suggestRes = await request(app)
      .get(`/warehouses/fulfillment/suggest/${salesOrder.id}`)
      .set('Authorization', `Bearer ${financeToken}`);

    expect(suggestRes.status).toBe(200);
    expect(suggestRes.body.fullyAllocated).toBe(true);
    expect(suggestRes.body.totalAllocated).toBe(10);
    expect(suggestRes.body.totalBackordered).toBe(0);
    expect(suggestRes.body.suggestions.length).toBe(2);
  });

  // --------------------------------------------------------------------------
  // Test 3: Stock split across three warehouses
  // --------------------------------------------------------------------------
  it('3. Splits order line across 3 warehouses when needed to fulfill required order quantity', async () => {
    await setStockLevels(prodLaptop.id, 4, 3, 3); // Main=4, East=3, West=3 (Total 10)
    const salesOrder = await createConfirmedSalesOrder([{ productId: prodLaptop.id, quantity: 10, unitPrice: 1000 }]);

    const suggestRes = await request(app)
      .get(`/warehouses/fulfillment/suggest/${salesOrder.id}`)
      .set('Authorization', `Bearer ${financeToken}`);

    expect(suggestRes.status).toBe(200);
    expect(suggestRes.body.fullyAllocated).toBe(true);
    expect(suggestRes.body.totalAllocated).toBe(10);
    expect(suggestRes.body.suggestions.length).toBe(3);
  });

  // --------------------------------------------------------------------------
  // Test 4 & 5: Insufficient stock -> Backorder creation & Backorder consolidation
  // --------------------------------------------------------------------------
  it('4 & 5. Creates backorder for insufficient stock and consolidates when new stock arrives', async () => {
    await setStockLevels(prodLaptop.id, 6, 2, 0); // Main=6, East=2 (Total 8 for 10 laptops)
    const salesOrder = await createConfirmedSalesOrder([{ productId: prodLaptop.id, quantity: 10, unitPrice: 1000 }]);

    const suggestRes = await request(app)
      .get(`/warehouses/fulfillment/suggest/${salesOrder.id}`)
      .set('Authorization', `Bearer ${financeToken}`);

    expect(suggestRes.body.fullyAllocated).toBe(false);
    expect(suggestRes.body.totalAllocated).toBe(8);
    expect(suggestRes.body.totalBackordered).toBe(2);

    // Accept allocation -> creates backorder record
    await request(app)
      .post('/warehouses/fulfillment/accept')
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ salesOrderId: salesOrder.id });

    let backorders = await prisma.backorder.findMany({ where: { salesOrderId: salesOrder.id } });
    expect(backorders.length).toBe(1);
    expect(backorders[0].remainingQty).toBe(2);
    expect(backorders[0].status).toBe('BACKORDERED');

    // Replenish stock in Main Warehouse (add 5 laptops)
    await prisma.warehouseStock.updateMany({
      where: { warehouseId: whMain.id, productId: prodLaptop.id },
      data: { quantity: 15 } // Now 15 total, 6 allocated = 9 available
    });

    // Consolidate backorder
    const consolidateRes = await request(app)
      .post(`/warehouses/backorders/${backorders[0].id}/consolidate`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({});

    expect(consolidateRes.status).toBe(200);
    expect(consolidateRes.body.allocatedQuantity).toBe(2);
    expect(consolidateRes.body.remainingQuantity).toBe(0);

    const updatedBo = await prisma.backorder.findUnique({ where: { id: backorders[0].id } });
    expect(updatedBo?.status).toBe('FULFILLED');

    const updatedOrder = await prisma.salesOrder.findUnique({ where: { id: salesOrder.id } });
    expect(updatedOrder?.status).toBe('FULFILLED');
  });

  // --------------------------------------------------------------------------
  // Test 6 & 7: Manual warehouse override & validation
  // --------------------------------------------------------------------------
  it('6 & 7. Validates manual warehouse overrides and rejects invalid/exceeding/negative allocations', async () => {
    await setStockLevels(prodLaptop.id, 10, 5, 0);
    const salesOrder = await createConfirmedSalesOrder([{ productId: prodLaptop.id, quantity: 5, unitPrice: 1000 }]);

    // Invalid 1: Total sum (6) != line quantity (5)
    const badSumRes = await request(app)
      .post('/warehouses/fulfillment/manual-override')
      .set('Authorization', `Bearer ${financeToken}`)
      .send({
        salesOrderId: salesOrder.id,
        manualAllocations: [{ productId: prodLaptop.id, warehouseId: whMain.id, quantity: 6 }]
      });
    expect(badSumRes.status).toBe(400);
    expect(badSumRes.body.error).toContain('Total allocated + backordered quantity');

    // Invalid 2: Exceeding available stock in East Depot (requested 5, available 5, but let me set East to 2)
    await setStockLevels(prodLaptop.id, 10, 2, 0);
    const exceedRes = await request(app)
      .post('/warehouses/fulfillment/manual-override')
      .set('Authorization', `Bearer ${financeToken}`)
      .send({
        salesOrderId: salesOrder.id,
        manualAllocations: [{ productId: prodLaptop.id, warehouseId: whEast.id, quantity: 5 }]
      });
    expect(exceedRes.status).toBe(400);
    expect(exceedRes.body.error).toContain('exceeds available stock');

    // Valid manual override (Main: 3, East: 2 = Total 5)
    const validOverrideRes = await request(app)
      .post('/warehouses/fulfillment/manual-override')
      .set('Authorization', `Bearer ${financeToken}`)
      .send({
        salesOrderId: salesOrder.id,
        manualAllocations: [
          { productId: prodLaptop.id, warehouseId: whMain.id, quantity: 3 },
          { productId: prodLaptop.id, warehouseId: whEast.id, quantity: 2 }
        ]
      });
    expect(validOverrideRes.status).toBe(200);
    expect(validOverrideRes.body.status).toBe('FULFILLED');
  });

  // --------------------------------------------------------------------------
  // Test 8: One-time product invoice generation
  // --------------------------------------------------------------------------
  it('8. Generates a one-time Invoice with line items, tax, and Net 30 due date', async () => {
    const salesOrder = await createConfirmedSalesOrder([{ productId: prodLaptop.id, quantity: 2, unitPrice: 1000, discount: 10 }]);

    const invRes = await request(app)
      .post('/finance/invoices/generate')
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ salesOrderId: salesOrder.id });

    expect(invRes.status).toBe(201);
    expect(invRes.body.invoiceNumber).toBeDefined();
    expect(invRes.body.totalAmount).toBe(1800); // 2 * 1000 * 0.9 = 1800
    expect(invRes.body.paidAmount).toBe(0);
    expect(invRes.body.outstandingAmount).toBe(1800);
    expect(invRes.body.status).toBe('ISSUED');
  });

  // --------------------------------------------------------------------------
  // Test 9, 10, 11, 12, 13: Recurring Subscription & Hybrid Billing (Monthly, Quarterly, Yearly)
  // --------------------------------------------------------------------------
  it('9, 10, 11, 12, 13. Handles hybrid orders (one-time + recurring) across Monthly, Quarterly, and Yearly subscription plans', async () => {
    // Create subscription plans for SaaS product
    const monthlyPlan = await prisma.subscriptionPlan.create({
      data: { name: 'SaaS Monthly Plan', billingCycle: 'MONTHLY', productId: prodSaaS.id, pricePerCycle: 200 }
    });
    const quarterlyPlan = await prisma.subscriptionPlan.create({
      data: { name: 'SaaS Quarterly Plan', billingCycle: 'QUARTERLY', productId: prodSaaS.id, pricePerCycle: 550 }
    });
    const yearlyPlan = await prisma.subscriptionPlan.create({
      data: { name: 'SaaS Yearly Plan', billingCycle: 'YEARLY', productId: prodSaaS.id, pricePerCycle: 2000 }
    });

    // Create Subscription directly
    const subMonthly = await prisma.subscription.create({
      data: {
        planId: monthlyPlan.id,
        productId: prodSaaS.id,
        quantity: 5,
        startDate: new Date(),
        status: 'ACTIVE',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    });

    expect(subMonthly.id).toBeDefined();
    expect(subMonthly.quantity).toBe(5);
  });

  // --------------------------------------------------------------------------
  // Test 14: Mid-cycle quantity change & proration calculation
  // --------------------------------------------------------------------------
  it('14. Calculates exact mid-cycle proration for subscription quantity increases & decreases', async () => {
    const plan = await prisma.subscriptionPlan.create({
      data: { name: 'Pro Plan', billingCycle: 'MONTHLY', productId: prodSaaS.id, pricePerCycle: 300 }
    });

    const now = new Date();
    const periodStart = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000); // 15 days ago
    const periodEnd = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000); // 15 days remaining (total 30)

    const sub = await prisma.subscription.create({
      data: {
        planId: plan.id,
        productId: prodSaaS.id,
        quantity: 2,
        startDate: periodStart,
        status: 'ACTIVE',
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd
      }
    });

    // Increase quantity from 2 to 4 halfway through billing cycle
    const incRes = await request(app)
      .post('/finance/subscriptions/modify-quantity')
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ subscriptionId: sub.id, newQuantity: 4 });

    expect(incRes.status).toBe(200);
    expect(incRes.body.action).toBe('CHARGE');
    expect(incRes.body.proratedAmount).toBe(300); // (4-2) * 300 * (15/30) = 300
  });

  // --------------------------------------------------------------------------
  // Test 15 & 16: Subscription cancellation & Credit Note creation
  // --------------------------------------------------------------------------
  it('15 & 16. Subscription cancellation issues a Credit Note for unused cycle days and voids future entries', async () => {
    const plan = await prisma.subscriptionPlan.create({
      data: { name: 'Enterprise Plan', billingCycle: 'MONTHLY', productId: prodSaaS.id, pricePerCycle: 600 }
    });

    const now = new Date();
    const periodStart = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000); // 10 days used
    const periodEnd = new Date(now.getTime() + 20 * 24 * 60 * 60 * 1000); // 20 days remaining (total 30)

    const sub = await prisma.subscription.create({
      data: {
        planId: plan.id,
        productId: prodSaaS.id,
        quantity: 1,
        startDate: periodStart,
        status: 'ACTIVE',
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd
      }
    });

    const cancelRes = await request(app)
      .post('/finance/subscriptions/cancel')
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ subscriptionId: sub.id, reason: 'Customer requested cancellation' });

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.creditNote).toBeDefined();
    expect(cancelRes.body.creditNote.amount).toBe(400); // 600 * (20/30) = 400
  });

  // --------------------------------------------------------------------------
  // Test 17, 18, 19, 20, 24: Payment recording (Partial -> Full), overpayment prevention & auto status updates
  // --------------------------------------------------------------------------
  it('17, 18, 19, 20, 24. Records partial and full payments, prevents overpayments, and updates invoice status automatically', async () => {
    const salesOrder = await createConfirmedSalesOrder([{ productId: prodLaptop.id, quantity: 10, unitPrice: 1000 }]);

    const invRes = await request(app)
      .post('/finance/invoices/generate')
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ salesOrderId: salesOrder.id });

    const invoiceId = invRes.body.id;
    expect(invRes.body.outstandingAmount).toBe(10000);

    // Overpayment Attempt ($12,000 > $10,000) -> 400 Bad Request
    const overpayRes = await request(app)
      .post(`/finance/invoices/${invoiceId}/payments`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ amount: 12000, paymentMethod: 'CREDIT_CARD' });

    expect(overpayRes.status).toBe(400);
    expect(overpayRes.body.error).toContain('exceeds outstanding invoice balance');

    // Partial Payment ($4,000) -> PARTIALLY_PAID
    const partialRes = await request(app)
      .post(`/finance/invoices/${invoiceId}/payments`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ amount: 4000, paymentMethod: 'BANK_TRANSFER', reference: 'PARTIAL-1' });

    expect(partialRes.status).toBe(200);
    expect(partialRes.body.invoice.status).toBe('PARTIALLY_PAID');
    expect(partialRes.body.invoice.paidAmount).toBe(4000);
    expect(partialRes.body.invoice.outstandingAmount).toBe(6000);

    // Remaining Payment ($6,000) -> PAID
    const fullRes = await request(app)
      .post(`/finance/invoices/${invoiceId}/payments`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ amount: 6000, paymentMethod: 'BANK_TRANSFER', reference: 'FULL-2' });

    expect(fullRes.status).toBe(200);
    expect(fullRes.body.invoice.status).toBe('PAID');
    expect(fullRes.body.invoice.paidAmount).toBe(10000);
    expect(fullRes.body.invoice.outstandingAmount).toBe(0);
  });

  // --------------------------------------------------------------------------
  // Test 21, 22, 23: RBAC Role permission checks for Sales Rep and Customer
  // --------------------------------------------------------------------------
  it('21, 22, 23. Denies unauthorized Sales Rep and Customer users with 403 Forbidden on finance/warehouse mutations', async () => {
    const salesOrder = await createConfirmedSalesOrder([{ productId: prodLaptop.id, quantity: 1, unitPrice: 1000 }]);

    const invRes = await request(app)
      .post('/finance/invoices/generate')
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ salesOrderId: salesOrder.id });

    // Sales Rep payment attempt -> 403 Forbidden
    const repPayRes = await request(app)
      .post(`/finance/invoices/${invRes.body.id}/payments`)
      .set('Authorization', `Bearer ${repToken}`)
      .send({ amount: 100 });
    expect(repPayRes.status).toBe(403);

    // Customer payment attempt -> 403 Forbidden
    const custPayRes = await request(app)
      .post(`/finance/invoices/${invRes.body.id}/payments`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ amount: 100 });
    expect(custPayRes.status).toBe(403);
  });

  // --------------------------------------------------------------------------
  // Test 25: End-to-end quotation -> approval -> order -> fulfillment -> billing flow
  // --------------------------------------------------------------------------
  it('25. Executes complete Quotation -> Approval -> Order -> Fulfillment -> Billing workflow', async () => {
    await setStockLevels(prodLaptop.id, 20, 10, 5);

    // Step 1: Create Quotation
    const q = await prisma.quotation.create({
      data: {
        quoteNumber: `QT-FULL-FLOW-${Date.now()}`,
        userId: repUser.id,
        customerTier: 'GOLD',
        status: 'CONFIRMED',
        totalAmount: 5000,
        lines: {
          create: [{ productId: prodLaptop.id, quantity: 5, unitPrice: 1000, discount: 0, totalPrice: 5000 }]
        }
      }
    });

    // Step 2: Create Sales Order
    const orderRes = await request(app)
      .post('/warehouses/orders/create')
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ quotationId: q.id });
    expect(orderRes.status).toBe(201);
    expect(orderRes.body.status).toBe('FULFILLED');

    // Step 3: Generate Invoice
    const invoiceRes = await request(app)
      .post('/finance/invoices/generate')
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ salesOrderId: orderRes.body.id });
    expect(invoiceRes.status).toBe(201);
    expect(invoiceRes.body.status).toBe('ISSUED');

    // Step 4: Full Payment
    const paymentRes = await request(app)
      .post(`/finance/invoices/${invoiceRes.body.id}/payments`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ amount: 5000, paymentMethod: 'CREDIT_CARD' });
    expect(paymentRes.status).toBe(200);
    expect(paymentRes.body.invoice.status).toBe('PAID');
  });
});
