// products/products.test.js
const request = require('supertest');
const app = require('../src/index').default || require('../src/index');
const { prisma } = require('../shared/prisma');
const jwt = require('jsonwebtoken');
const { productsService } = require('./products.service');

const JWT_SECRET = process.env.JWT_SECRET || 'dealflow360-super-secret-key';

describe('Product Catalog Module Integration Tests', () => {
  let adminToken, repToken;
  let adminUser, repUser;

  beforeAll(async () => {
    // Clear relevant database tables before starting suite
    await prisma.approvalStepRecord.deleteMany();
    await prisma.approvalRequest.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.quotationLine.deleteMany();
    await prisma.quotation.deleteMany();
    await prisma.priceList.deleteMany();
    await prisma.productVariant.deleteMany();
    await prisma.product.deleteMany();
    await prisma.user.deleteMany();

    adminUser = await prisma.user.create({
      data: { email: 'admin-prod@dealflow.com', name: 'Catalog Admin', role: 'ADMIN' }
    });
    repUser = await prisma.user.create({
      data: { email: 'rep-prod@dealflow.com', name: 'Sales Rep', role: 'REP' }
    });

    adminToken = jwt.sign({ userId: adminUser.id, role: 'ADMIN' }, JWT_SECRET);
    repToken = jwt.sign({ userId: repUser.id, role: 'REP' }, JWT_SECRET);

    // Seed realistic products catalog (9+ products across Hardware, Services, Subscriptions)
    await productsService.seedCatalog();
  });

  afterAll(async () => {
    await prisma.approvalStepRecord.deleteMany();
    await prisma.approvalRequest.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.quotationLine.deleteMany();
    await prisma.quotation.deleteMany();
    await prisma.priceList.deleteMany();
    await prisma.productVariant.deleteMany();
    await prisma.product.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  // ============================================================================
  // 1. Catalog Seeding Verification (At least 8-10 products)
  // ============================================================================
  describe('Catalog Seeding & Product Listing', () => {
    it('should have seeded at least 8-10 realistic products across Hardware, Services, Subscriptions', async () => {
      const res = await request(app).get('/products');

      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThanOrEqual(9);

      const categories = [...new Set(res.body.map(p => p.category))];
      expect(categories).toContain('Hardware');
      expect(categories).toContain('Services');
      expect(categories).toContain('Subscriptions');

      // Verify margin values exist and are positive
      res.body.forEach(product => {
        expect(product.marginPercent).toBeGreaterThan(0);
      });
    });

    it('should filter products by category (GET /products?category=Hardware)', async () => {
      const res = await request(app).get('/products?category=Hardware');

      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThanOrEqual(3);
      res.body.forEach(p => {
        expect(p.category).toBe('Hardware');
      });
    });

    it('should filter products by search query (GET /products?search=laptop)', async () => {
      const res = await request(app).get('/products?search=laptop');

      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body[0].name.toLowerCase()).toContain('laptop');
    });
  });

  // ============================================================================
  // 2. Product CRUD & Nested Variant Creation
  // ============================================================================
  describe('Product & Variant CRUD Operations', () => {
    let createdProductId;

    it('should allow admin to create product with nested variants', async () => {
      const payload = {
        sku: 'TEST-DEV-01',
        name: 'Developer Workstation PC',
        description: 'Custom desktop PC for engineers',
        category: 'Hardware',
        basePrice: 1800,
        unit: 'PCS',
        tax: 10,
        marginPercent: 35,
        currency: 'USD',
        variants: [
          { attribute: 'CPU', value: 'i9-14900K', extraPrice: 300 },
          { attribute: 'GPU', value: 'RTX 4080', extraPrice: 800 }
        ]
      };

      const res = await request(app)
        .post('/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe('Developer Workstation PC');
      expect(res.body.variants.length).toBe(2);

      createdProductId = res.body.id;
    });

    it('should allow fetching created product by ID with variants', async () => {
      const res = await request(app).get(`/products/${createdProductId}`);

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Developer Workstation PC');
      expect(res.body.variants.length).toBe(2);
    });

    it('should allow adding variant to existing product', async () => {
      const res = await request(app)
        .post(`/products/${createdProductId}/variants`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ attribute: 'RAM', value: '64GB DDR5', extraPrice: 250 });

      expect(res.status).toBe(201);
      expect(res.body.attribute).toBe('RAM');
      expect(res.body.value).toBe('64GB DDR5');
    });

    it('should reject product creation with negative basePrice or marginPercent (400 Bad Request)', async () => {
      const res = await request(app)
        .post('/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Invalid Product',
          basePrice: -100,
          marginPercent: 20
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('basePrice must be a non-negative number');
    });

    it('should reject write operations by non-admin users (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/products')
        .set('Authorization', `Bearer ${repToken}`)
        .send({ name: 'Hacker Product', basePrice: 100 });

      expect(res.status).toBe(403);
    });
  });

  // ============================================================================
  // 3. Price Resolution (GET /products/:id/price)
  // ============================================================================
  describe('Price Resolution Engine', () => {
    let testProduct;

    beforeAll(async () => {
      testProduct = await prisma.product.create({
        data: {
          sku: 'PR-PRICE-01',
          name: 'Price Test Router',
          category: 'Hardware',
          basePrice: 1000,
          currency: 'USD'
        }
      });

      // Create PriceList override for GOLD tier in USD
      await prisma.priceList.create({
        data: {
          name: 'Gold Tier Hardware Special',
          customerTier: 'GOLD',
          currency: 'USD',
          productId: testProduct.id,
          overridePrice: 850.00
        }
      });
    });

    it('should resolve price using PriceList override when one exists for tier+currency', async () => {
      const res = await request(app)
        .get(`/products/${testProduct.id}/price?customerTier=GOLD&currency=USD`);

      expect(res.status).toBe(200);
      expect(res.body.overridePrice).toBe(850.00);
      expect(res.body.resolvedPrice).toBe(850.00);
      expect(res.body.currencyConverted).toBe(false);
    });

    it('should convert currency using FX table when no PriceList override exists for target currency', async () => {
      // SILVER tier in EUR has no override -> converts basePrice 1000 USD to EUR (1000 * 0.92 = 920.00)
      const res = await request(app)
        .get(`/products/${testProduct.id}/price?customerTier=SILVER&currency=EUR`);

      expect(res.status).toBe(200);
      expect(res.body.overridePrice).toBeNull();
      expect(res.body.resolvedPrice).toBe(920.00);
      expect(res.body.currencyConverted).toBe(true);
    });
  });

  // ============================================================================
  // 4. Deletion Integrity Checks (409 Conflict)
  // ============================================================================
  describe('Product Deletion Integrity Checks', () => {
    it('should block deletion with 409 Conflict if product is referenced in active Quotation or PriceList', async () => {
      const referencedProduct = await prisma.product.create({
        data: { sku: 'REF-01', name: 'Referenced Product', basePrice: 500 }
      });

      await prisma.priceList.create({
        data: { productId: referencedProduct.id, overridePrice: 450, customerTier: 'BRONZE' }
      });

      const deleteRes = await request(app)
        .delete(`/products/${referencedProduct.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(deleteRes.status).toBe(409);
      expect(deleteRes.body.error).toContain('referenced in existing quotations or price lists');
    });
  });
});
