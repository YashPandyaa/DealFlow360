// warehouses/warehouse_stock.test.ts
import request from 'supertest';
import app from '../src/index';
import { prisma } from '../shared/prisma';
import jwt from 'jsonwebtoken';
import { inventoryService } from './inventory.service';
import { fulfillmentService } from './fulfillment.service';

const JWT_SECRET = process.env.JWT_SECRET || 'dealflow360-super-secret-key';

describe('Warehouse Stock Module Comprehensive E2E & Business Logic Test Suite', () => {
  let adminToken: string;
  let repToken: string;
  let financeToken: string;
  let customerToken: string;

  let adminUser: any;
  let repUser: any;
  let financeUser: any;
  let customerUser: any;

  let warehouseA: any;
  let warehouseB: any;
  let laptopProduct: any;
  let monitorProduct: any;

  beforeAll(async () => {
    // Clear database for clean test run
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

    // 1. Create Test Users
    adminUser = await prisma.user.create({
      data: { email: 'admin-stock-e2e@dealflow.com', name: 'Stock Admin', role: 'ADMIN' }
    });
    repUser = await prisma.user.create({
      data: { email: 'rep-stock-e2e@dealflow.com', name: 'Sales Rep Bob', role: 'REP' }
    });
    financeUser = await prisma.user.create({
      data: { email: 'finance-stock-e2e@dealflow.com', name: 'Frank Operations', role: 'FINANCE_OPERATIONS' }
    });
    customerUser = await prisma.user.create({
      data: { email: 'customer-stock-e2e@client.com', name: 'Acme Corp', role: 'CUSTOMER', isPortalUser: true }
    });

    adminToken = jwt.sign({ userId: adminUser.id, role: 'ADMIN' }, JWT_SECRET);
    repToken = jwt.sign({ userId: repUser.id, role: 'REP' }, JWT_SECRET);
    financeToken = jwt.sign({ userId: financeUser.id, role: 'FINANCE_OPERATIONS' }, JWT_SECRET);
    customerToken = jwt.sign({ userId: customerUser.id, role: 'CUSTOMER' }, JWT_SECRET);

    // 2. Create Warehouses
    warehouseA = await prisma.warehouse.create({
      data: { name: 'Warehouse Alpha', code: 'WH-ALPHA', location: 'Seattle, WA', capacity: 1000, isActive: true }
    });
    warehouseB = await prisma.warehouse.create({
      data: { name: 'Warehouse Beta', code: 'WH-BETA', location: 'Boston, MA', capacity: 500, isActive: true }
    });

    // 3. Create Products
    laptopProduct = await prisma.product.create({
      data: { sku: 'SKU-LAPTOP-X1', name: 'Enterprise Laptop X1', basePrice: 1200, status: 'ACTIVE' }
    });
    monitorProduct = await prisma.product.create({
      data: { sku: 'SKU-MONITOR-4K', name: '4K Ultra HD Monitor', basePrice: 400, status: 'ACTIVE' }
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ============================================================================
  // TEST 1: Warehouse A + Laptop -> On Hand = 20. Update to 30 -> DB = 30, Available correct
  // ============================================================================
  it('TEST 1: Update Warehouse A stock to 30 and verify persistence across re-fetches', async () => {
    // Initial Stock Creation
    const createRes = await request(app)
      .post('/warehouse-stock')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ warehouseId: warehouseA.id, productId: laptopProduct.id, quantity: 20, reorderLevel: 5 });

    expect(createRes.status).toBe(201);
    const stockId = createRes.body.id;
    expect(createRes.body.quantityOnHand).toBe(20);

    // Update Stock to 30 using stockId
    const updateRes = await request(app)
      .patch(`/warehouse-stock/${stockId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ quantity: 30 });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.quantityOnHand).toBe(30);
    expect(updateRes.body.availableQty).toBe(30);

    // Verify DB state
    const dbStock = await prisma.warehouseStock.findUnique({ where: { id: stockId } });
    expect(dbStock?.quantity).toBe(30);

    // Re-fetch via GET endpoint to ensure persistence after refresh
    const getRes = await request(app)
      .get(`/warehouse-stock/${stockId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.quantityOnHand).toBe(30);
  });

  // ============================================================================
  // TEST 2: Warehouse A + Monitor -> Delete stock record -> Verified removal
  // ============================================================================
  it('TEST 2: Delete unreferenced stock record and verify removal from database and summary', async () => {
    // Create temporary stock record for monitor
    const stock = await inventoryService.createStock({
      warehouseId: warehouseA.id,
      productId: monitorProduct.id,
      quantity: 15
    });

    // Delete stock using stock.id
    const deleteRes = await request(app)
      .delete(`/warehouse-stock/${stock.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.message).toContain('deleted successfully');

    // Verify DB deletion
    const dbStock = await prisma.warehouseStock.findUnique({ where: { id: stock.id } });
    expect(dbStock).toBeNull();

    // Verify GET returns 404
    const getRes = await request(app)
      .get(`/warehouse-stock/${stock.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(getRes.status).toBe(404);
  });

  // ============================================================================
  // TEST 3: Multi-Warehouse Stock Scoping (Warehouse A = 20, Warehouse B = 15)
  // ============================================================================
  it('TEST 3: Updating Warehouse A stock must NOT affect Warehouse B stock for the same product', async () => {
    // Set Warehouse A = 20 and Warehouse B = 15
    const stockA = await inventoryService.createStock({ warehouseId: warehouseA.id, productId: laptopProduct.id, quantity: 20 });
    const stockB = await inventoryService.createStock({ warehouseId: warehouseB.id, productId: laptopProduct.id, quantity: 15 });

    // Update Warehouse A to 25
    const updateRes = await request(app)
      .patch(`/warehouse-stock/${stockA.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ quantity: 25 });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.quantityOnHand).toBe(25);

    // Fetch Warehouse B stock and verify it remains strictly 15
    const freshStockB = await inventoryService.getStockById(stockB.id);
    expect(freshStockB.quantityOnHand).toBe(15);
  });

  // ============================================================================
  // TEST 4: Modal Form Record Isolation by Unique stockId
  // ============================================================================
  it('TEST 4: Editing Stock A then Stock B targets exact IDs without cross-contamination', async () => {
    const stockA = await inventoryService.getStockById(
      (await prisma.warehouseStock.findFirst({ where: { warehouseId: warehouseA.id, productId: laptopProduct.id } }))!.id
    );
    const stockB = await inventoryService.getStockById(
      (await prisma.warehouseStock.findFirst({ where: { warehouseId: warehouseB.id, productId: laptopProduct.id } }))!.id
    );

    // Update Stock A to 40
    await request(app)
      .put(`/warehouse-stock/${stockA.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ quantity: 40 });

    // Update Stock B to 18
    await request(app)
      .put(`/warehouse-stock/${stockB.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ quantity: 18 });

    const freshA = await inventoryService.getStockById(stockA.id);
    const freshB = await inventoryService.getStockById(stockB.id);

    expect(freshA.quantityOnHand).toBe(40);
    expect(freshB.quantityOnHand).toBe(18);
  });

  // ============================================================================
  // TEST 5: Stock Available Calculation (Stock = 10, Reserved = 4 -> Available = 6)
  // ============================================================================
  it('TEST 5: Available stock is derived consistently as (On Hand - Reserved - Allocated)', async () => {
    // Create stock item
    const stock = await inventoryService.createStock({
      warehouseId: warehouseA.id,
      productId: monitorProduct.id,
      quantity: 10,
      reservedQty: 4
    });

    expect(stock.availableQty).toBe(6);

    // Update on hand to 20 -> Available should become 16
    const updated = await inventoryService.updateStock(stock.id, { quantity: 20 });
    expect(updated.quantityOnHand).toBe(20);
    expect(updated.reservedQty).toBe(4);
    expect(updated.availableQty).toBe(16);
  });

  // ============================================================================
  // TEST 6: Invalid Reserved > On-Hand Validation Rejection
  // ============================================================================
  it('TEST 6: Setting on-hand quantity below reserved quantity is rejected with 400 validation error', async () => {
    // Find stock with reservedQty = 4
    const stockList = await inventoryService.getAllStock({ productId: monitorProduct.id });
    const stock = stockList[0];

    // Attempt to set on-hand quantity to 2 (below current reservedQty of 4)
    const updateRes = await request(app)
      .patch(`/warehouse-stock/${stock.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ quantity: 2 });

    expect(updateRes.status).toBe(400);
    expect(updateRes.body.error).toContain('are currently reserved/allocated');

    // Attempt to set reservedQty to 50 (above current on-hand of 20)
    const reservedRes = await request(app)
      .patch(`/warehouse-stock/${stock.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reservedQty: 50 });

    expect(reservedRes.status).toBe(400);
    expect(reservedRes.body.error).toContain('cannot exceed on-hand quantity');
  });

  // ============================================================================
  // TEST 7: Multi-Warehouse Split & Backorder (Stock = 5, Order = 8 -> Allocated = 5, Backorder = 3)
  // ============================================================================
  it('TEST 7: Fulfillment split creates partial allocation and backorder without negative available stock', async () => {
    // Set Warehouse A Laptop stock to 5 and clear Warehouse B stock
    const stockA = (await prisma.warehouseStock.findFirst({ where: { warehouseId: warehouseA.id, productId: laptopProduct.id } }))!;
    await inventoryService.updateStock(stockA.id, { quantity: 5, reservedQty: 0 });

    const stockB = (await prisma.warehouseStock.findFirst({ where: { warehouseId: warehouseB.id, productId: laptopProduct.id } }))!;
    await inventoryService.updateStock(stockB.id, { quantity: 0, reservedQty: 0 });

    // Create a confirmed Quotation for 8 laptops
    const quote = await prisma.quotation.create({
      data: {
        quoteNumber: `QT-E2E-${Date.now()}`,
        userId: repUser.id,
        customerName: 'Test Corp',
        status: 'CONFIRMED',
        totalAmount: 9600,
        lines: {
          create: [
            {
              productId: laptopProduct.id,
              quantity: 8,
              unitPrice: 1200,
              totalPrice: 9600
            }
          ]
        }
      }
    });

    // Create Sales Order and execute fulfillment allocation
    const salesOrder = await fulfillmentService.createSalesOrderFromQuotation(quote.id);
    expect(salesOrder?.status).toBe('PARTIALLY_FULFILLED');

    // Verify allocations: 5 units allocated from Warehouse A, 3 units backordered
    const allocations = await prisma.stockAllocation.findMany({ where: { salesOrderId: salesOrder!.id } });
    const backorders = await prisma.backorder.findMany({ where: { salesOrderId: salesOrder!.id } });

    const allocatedSum = allocations.reduce((acc, a) => acc + a.quantity, 0);
    const backorderedSum = backorders.reduce((acc, b) => acc + b.remainingQty, 0);

    expect(allocatedSum).toBe(5);
    expect(backorderedSum).toBe(3);

    // Verify available stock in Warehouse A is 0, NOT negative -3
    const freshStockA = await inventoryService.getStockById(stockA.id);
    expect(freshStockA.availableQty).toBe(0);
  });

  // ============================================================================
  // TEST 8: Concurrent Stock Allocations & Transactional Safety
  // ============================================================================
  it('TEST 8: Concurrent inventory reservations do not cause over-allocation or race conditions', async () => {
    // Set Monitor stock in Warehouse A to 10
    const stock = (await prisma.warehouseStock.findFirst({ where: { warehouseId: warehouseA.id, productId: monitorProduct.id } }))!;
    await inventoryService.updateStock(stock.id, { quantity: 10, reservedQty: 0 });

    // Attempt 2 parallel reservations of 6 units each (total 12 requested, only 10 available)
    const p1 = inventoryService.reserveStock(warehouseA.id, monitorProduct.id, 6);
    const p2 = inventoryService.reserveStock(warehouseA.id, monitorProduct.id, 6);

    const results = await Promise.allSettled([p1, p2]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exactly one reservation must succeed, and one must be rejected
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    // Check final stock: reservedQty = 6, availableQty = 4
    const finalStock = await inventoryService.getStockById(stock.id);
    expect(finalStock.reservedQty).toBe(6);
    expect(finalStock.availableQty).toBe(4);
  });

  // ============================================================================
  // TEST 9: Role-Based Access Control Enforcement (403 Forbidden for unauthorized roles)
  // ============================================================================
  it('TEST 9: Unauthorized roles (SALES_REP, CUSTOMER) cannot modify or delete stock via API', async () => {
    const stockList = await inventoryService.getAllStock();
    const stockId = stockList[0].id;

    // Sales Rep attempt DELETE -> 403
    const repDelete = await request(app)
      .delete(`/warehouse-stock/${stockId}`)
      .set('Authorization', `Bearer ${repToken}`);
    expect(repDelete.status).toBe(403);

    // Customer attempt POST -> 403
    const custPost = await request(app)
      .post('/warehouse-stock')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ warehouseId: warehouseA.id, productId: laptopProduct.id, quantity: 100 });
    expect(custPost.status).toBe(403);

    // Authorized Finance Operations attempt -> 200 OK
    const finUpdate = await request(app)
      .patch(`/warehouse-stock/${stockId}`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ reorderLevel: 15 });
    expect(finUpdate.status).toBe(200);
  });

  // ============================================================================
  // TEST 10: Referential Integrity Check on Stock Deletion (409 Conflict)
  // ============================================================================
  it('TEST 10: Deleting stock referenced by an active stock allocation is rejected with 409 Conflict', async () => {
    // Find stock record in Warehouse A for laptopProduct (which has active allocations from TEST 7)
    const stockA = (await prisma.warehouseStock.findFirst({ where: { warehouseId: warehouseA.id, productId: laptopProduct.id } }))!;

    // Attempt to delete referenced stock
    const deleteRes = await request(app)
      .delete(`/warehouse-stock/${stockA.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(deleteRes.status).toBe(409);
    expect(deleteRes.body.error).toContain('cannot be deleted because it is referenced by an active fulfillment or allocation');

    // Database record must remain intact
    const dbStock = await prisma.warehouseStock.findUnique({ where: { id: stockA.id } });
    expect(dbStock).not.toBeNull();
  });
});
