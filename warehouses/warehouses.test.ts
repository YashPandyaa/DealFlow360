import request from 'supertest';
import app from '../src/index';
import { prisma } from '../shared/prisma';
import bcrypt from 'bcryptjs';

describe('Warehouses & Fulfillment Engine Integration Tests', () => {
  let adminToken: string;
  let whEast: any;
  let whWest: any;
  let whCentral: any;
  let sensorProduct: any;
  let serverProduct: any;
  let salesRep: any;
  let adminUser: any;

  beforeAll(async () => {
    // Clean up
    await prisma.stockAllocation.deleteMany();
    await prisma.quotationLine.deleteMany();
    await prisma.quotation.deleteMany();
    await prisma.warehouseStock.deleteMany();
    await prisma.warehouse.deleteMany();
    await prisma.product.deleteMany();
    await prisma.user.deleteMany();

    const hashedPassword = await bcrypt.hash('Password123!', 10);
    adminUser = await prisma.user.create({
      data: {
        email: 'admin_wh@dealflow.com',
        passwordHash: hashedPassword,
        name: 'Warehouse Admin',
        role: 'ADMIN'
      }
    });

    const loginRes = await request(app)
      .post('/auth/login')
      .send({ email: 'admin_wh@dealflow.com', password: 'Password123!' });
    adminToken = loginRes.body.token;

    // Create Rep
    salesRep = await prisma.user.create({
      data: {
        email: 'rep_wh@dealflow.com',
        passwordHash: hashedPassword,
        name: 'Warehouse Rep',
        role: 'REP'
      }
    });

    // Create Warehouses
    whEast = await prisma.warehouse.create({
      data: { name: 'WH East Coast', location: 'New York, NY', code: 'WH-EAST', isActive: true }
    });
    whWest = await prisma.warehouse.create({
      data: { name: 'WH West Coast', location: 'Los Angeles, CA', code: 'WH-WEST', isActive: true }
    });
    whCentral = await prisma.warehouse.create({
      data: { name: 'WH Central', location: 'Chicago, IL', code: 'WH-CENTRAL', isActive: true }
    });

    // Create Products
    sensorProduct = await prisma.product.create({
      data: {
        sku: 'HW-SENSOR-IOT',
        name: 'IoT Sensor Node',
        category: 'Hardware',
        basePrice: 150.0,
        marginPercent: 35.0
      }
    });

    serverProduct = await prisma.product.create({
      data: {
        sku: 'HW-SRV-RACK',
        name: 'Rackmount Server',
        category: 'Hardware',
        basePrice: 5000.0,
        marginPercent: 40.0
      }
    });

    // Stock levels:
    // Sensor: East = 3, West = 4, Central = 0 (Total = 7 available)
    // Server: East = 10, West = 0, Central = 0
    await prisma.warehouseStock.createMany({
      data: [
        { warehouseId: whEast.id, productId: sensorProduct.id, quantity: 3, allocatedQty: 0 },
        { warehouseId: whWest.id, productId: sensorProduct.id, quantity: 4, allocatedQty: 0 },
        { warehouseId: whCentral.id, productId: sensorProduct.id, quantity: 0, allocatedQty: 0 },
        { warehouseId: whEast.id, productId: serverProduct.id, quantity: 10, allocatedQty: 0 }
      ]
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('GET /warehouses - should return list of active warehouses with stock summary', async () => {
    const res = await request(app).get('/warehouses');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(3);
    const east = res.body.find((w: any) => w.code === 'WH-EAST');
    expect(east).toBeDefined();
    expect(east.stockItems).toBeDefined();
  });

  it('POST /warehouses/:id/stock - should update stock level for a warehouse', async () => {
    const res = await request(app)
      .post(`/warehouses/${whCentral.id}/stock`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        productId: serverProduct.id,
        quantity: 5
      });
    expect(res.status).toBe(200);
    expect(res.body.productId).toBe(serverProduct.id);
    expect(res.body.quantity).toBe(5);
  });

  it('POST /warehouses/fulfill/:quotationId - single warehouse full allocation', async () => {
    // Create quotation with 2 servers (WH East has 10 available)
    const quote = await prisma.quotation.create({
      data: {
        quoteNumber: 'Q-FULFILL-SINGLE',
        userId: salesRep.id,
        customerName: 'Single WH Corp',
        totalAmount: 10000.0,
        status: 'APPROVED',
        lines: {
          create: [
            {
              productId: serverProduct.id,
              quantity: 2,
              unitPrice: 5000.0,
              discount: 0,
              totalPrice: 10000.0
            }
          ]
        }
      }
    });

    const res = await request(app).post(`/warehouses/fulfill/${quote.id}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ALLOCATED');
    expect(res.body.fulfillmentSummary.fullyAllocated).toBe(true);
    expect(res.body.allocations).toHaveLength(1);
    expect(res.body.allocations[0].warehouseCode).toBe('WH-EAST');
    expect(res.body.allocations[0].quantity).toBe(2);
  });

  it('POST /warehouses/fulfill/:quotationId - split fulfillment across multiple warehouses and backorders', async () => {
    // Sensor product has 3 in East, 4 in West. Quote asks for 10 units.
    // Expected: East allocates 3, West allocates 4, and 3 backordered.
    const quote = await prisma.quotation.create({
      data: {
        quoteNumber: 'Q-FULFILL-SPLIT',
        userId: salesRep.id,
        customerName: 'Multi WH Corp',
        totalAmount: 1500.0,
        status: 'APPROVED',
        lines: {
          create: [
            {
              productId: sensorProduct.id,
              quantity: 10,
              unitPrice: 150.0,
              discount: 0,
              totalPrice: 1500.0
            }
          ]
        }
      }
    });

    const res = await request(app).post(`/warehouses/fulfill/${quote.id}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PARTIALLY_ALLOCATED');
    expect(res.body.fulfillmentSummary.fullyAllocated).toBe(false);
    expect(res.body.fulfillmentSummary.totalItemsRequested).toBe(10);
    expect(res.body.fulfillmentSummary.allocatedItems).toBe(7);
    expect(res.body.fulfillmentSummary.backorderedItems).toBe(3);

    // Verify quotation status updated
    const updatedQuote = await prisma.quotation.findUnique({ where: { id: quote.id } });
    expect(updatedQuote?.status).toBe('PARTIALLY_ALLOCATED');
  });

  it('POST /warehouses/fulfill/:quotationId - returns 404 for non-existent quotation', async () => {
    const res = await request(app).post('/warehouses/fulfill/non-existent-id');
    expect(res.status).toBe(404);
  });
});
