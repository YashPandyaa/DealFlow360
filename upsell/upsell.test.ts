// upsell/upsell.test.ts
import request from 'supertest';
import app from '../src/index';
import { prisma } from '../shared/prisma';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dealflow360-super-secret-key';

describe('Upsell & Cross-Sell Module Integration Tests', () => {
  let adminToken: string;
  let repToken: string;
  let adminUserId: string;

  // Products
  let laptopProduct: any;
  let mouseProduct: any;
  let dockProduct: any;
  let warrantyProduct: any;
  let lowMarginCableProduct: any;

  beforeAll(async () => {
    // Clean up test DB
    await prisma.upsellRule.deleteMany();
    await prisma.quotationLine.deleteMany();
    await prisma.quotation.deleteMany();
    await prisma.product.deleteMany();
    await prisma.user.deleteMany();

    // Create Admin User
    const adminUser = await prisma.user.create({
      data: {
        email: 'upsell_admin@dealflow360.com',
        name: 'Upsell Admin',
        role: 'ADMIN'
      }
    });
    adminUserId = adminUser.id;
    adminToken = jwt.sign({ userId: adminUser.id, role: 'ADMIN' }, JWT_SECRET);

    // Create Rep User
    const repUser = await prisma.user.create({
      data: {
        email: 'upsell_rep@dealflow360.com',
        name: 'Sales Rep',
        role: 'REP'
      }
    });
    repToken = jwt.sign({ userId: repUser.id, role: 'REP' }, JWT_SECRET);

    // Create Products with varied marginPercent and basePrice
    laptopProduct = await prisma.product.create({
      data: {
        sku: 'LAPTOP-PRO-15',
        name: 'Pro Laptop 15-inch',
        basePrice: 1500.0,
        marginPercent: 20.0
      }
    });

    mouseProduct = await prisma.product.create({
      data: {
        sku: 'ACC-MOUSE-WIRELESS',
        name: 'Ergonomic Wireless Mouse',
        basePrice: 50.0,
        marginPercent: 40.0 // marginDelta = $20.00
      }
    });

    dockProduct = await prisma.product.create({
      data: {
        sku: 'ACC-THUNDERBOLT-DOCK',
        name: 'Thunderbolt 4 Docking Station',
        basePrice: 250.0,
        marginPercent: 30.0 // marginDelta = $75.00
      }
    });

    warrantyProduct = await prisma.product.create({
      data: {
        sku: 'SVC-EXT-WARRANTY-3YR',
        name: '3-Year Extended Care Warranty',
        basePrice: 300.0,
        marginPercent: 70.0 // marginDelta = $210.00
      }
    });

    lowMarginCableProduct = await prisma.product.create({
      data: {
        sku: 'ACC-BASIC-HDMI',
        name: 'Basic HDMI Cable',
        basePrice: 10.0,
        marginPercent: 5.0 // marginDelta = $0.50 (low margin)
      }
    });
  });

  afterAll(async () => {
    await prisma.upsellRule.deleteMany();
    await prisma.quotationLine.deleteMany();
    await prisma.quotation.deleteMany();
    await prisma.product.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  // ==========================================================================
  // SECTION 1: Admin CRUD & RBAC on /upsell/rules
  // ==========================================================================
  describe('Admin UpsellRule CRUD (/upsell/rules)', () => {
    let createdRuleId: string;

    it('should allow ADMIN to create an UpsellRule', async () => {
      const res = await request(app)
        .post('/upsell/rules')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          triggerProductId: laptopProduct.id,
          suggestedProductId: mouseProduct.id,
          coPurchaseScore: 0.85,
          isPromoted: false
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.triggerProductId).toBe(laptopProduct.id);
      expect(res.body.suggestedProductId).toBe(mouseProduct.id);
      expect(res.body.coPurchaseScore).toBe(0.85);
      expect(res.body.isPromoted).toBe(false);
      expect(res.body.isActive).toBe(true);

      createdRuleId = res.body.id;
    });

    it('should REJECT non-admin (REP) with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/upsell/rules')
        .set('Authorization', `Bearer ${repToken}`)
        .send({
          triggerProductId: laptopProduct.id,
          suggestedProductId: dockProduct.id,
          coPurchaseScore: 0.9
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Forbidden');
    });

    it('should list all UpsellRules', async () => {
      const res = await request(app).get('/upsell/rules');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });

    it('should get UpsellRule by ID', async () => {
      const res = await request(app).get(`/upsell/rules/${createdRuleId}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(createdRuleId);
    });

    it('should allow ADMIN to update an UpsellRule', async () => {
      const res = await request(app)
        .put(`/upsell/rules/${createdRuleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          coPurchaseScore: 0.95,
          isPromoted: true
        });

      expect(res.status).toBe(200);
      expect(res.body.coPurchaseScore).toBe(0.95);
      expect(res.body.isPromoted).toBe(true);
    });

    it('should allow ADMIN to delete an UpsellRule', async () => {
      const res = await request(app)
        .delete(`/upsell/rules/${createdRuleId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('deleted successfully');
    });
  });

  // ==========================================================================
  // SECTION 2: Upsell Recommendation Engine (GET /upsell/:quotationId)
  // ==========================================================================
  describe('GET /upsell/:quotationId (Recommendation Engine)', () => {
    let activeQuotationId: string;
    let emptyQuotationId: string;

    beforeAll(async () => {
      // 1. Setup Upsell Rules for Laptop:
      // - Warranty: score 0.70, isPromoted: true (Should rank FIRST because isPromoted = true)
      // - Dock: score 0.90, isPromoted: false (Should rank SECOND because highest score among non-promoted)
      // - Mouse: score 0.60, isPromoted: false (Should rank THIRD)
      // - LowMarginCable: score 0.95, isPromoted: false (High score, but margin is only 5%)
      await prisma.upsellRule.createMany({
        data: [
          {
            triggerProductId: laptopProduct.id,
            suggestedProductId: warrantyProduct.id,
            coPurchaseScore: 0.7,
            isPromoted: true,
            isActive: true
          },
          {
            triggerProductId: laptopProduct.id,
            suggestedProductId: dockProduct.id,
            coPurchaseScore: 0.9,
            isPromoted: false,
            isActive: true
          },
          {
            triggerProductId: laptopProduct.id,
            suggestedProductId: mouseProduct.id,
            coPurchaseScore: 0.6,
            isPromoted: false,
            isActive: true
          },
          {
            triggerProductId: laptopProduct.id,
            suggestedProductId: lowMarginCableProduct.id,
            coPurchaseScore: 0.95,
            isPromoted: false,
            isActive: true
          }
        ]
      });

      // 2. Setup Quotation with Laptop in cart
      const quote = await prisma.quotation.create({
        data: {
          quoteNumber: 'QT-UPSELL-001',
          userId: adminUserId,
          status: 'DRAFT',
          totalAmount: 1500.0
        }
      });
      activeQuotationId = quote.id;

      await prisma.quotationLine.create({
        data: {
          quotationId: quote.id,
          productId: laptopProduct.id,
          quantity: 1,
          unitPrice: 1500.0,
          totalPrice: 1500.0
        }
      });

      // 3. Setup Empty Quotation (0 lines)
      const emptyQuote = await prisma.quotation.create({
        data: {
          quoteNumber: 'QT-EMPTY-001',
          userId: adminUserId,
          status: 'DRAFT',
          totalAmount: 0.0
        }
      });
      emptyQuotationId = emptyQuote.id;
    });

    it('EDGE CASE: Quotation with no lines yet should return empty array without crashing', async () => {
      const res = await request(app).get(`/upsell/${emptyQuotationId}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('Normal Ranking: Promoted items first, then coPurchaseScore descending', async () => {
      const res = await request(app).get(`/upsell/${activeQuotationId}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(4);

      // Rank 1: Warranty (isPromoted: true)
      expect(res.body[0].productId).toBe(warrantyProduct.id);
      expect(res.body[0].productName).toBe(warrantyProduct.name);
      expect(res.body[0].isPromoted).toBe(true);
      expect(res.body[0].marginDelta).toBe(210.0); // $300 * 70% = $210

      // Rank 2: Cable (coPurchaseScore: 0.95)
      expect(res.body[1].productId).toBe(lowMarginCableProduct.id);
      expect(res.body[1].coPurchaseScore).toBe(0.95);
      expect(res.body[1].isPromoted).toBe(false);

      // Rank 3: Dock (coPurchaseScore: 0.90)
      expect(res.body[2].productId).toBe(dockProduct.id);
      expect(res.body[2].coPurchaseScore).toBe(0.9);
      expect(res.body[2].marginDelta).toBe(75.0); // $250 * 30% = $75

      // Rank 4: Mouse (coPurchaseScore: 0.60)
      expect(res.body[3].productId).toBe(mouseProduct.id);
      expect(res.body[3].coPurchaseScore).toBe(0.6);
      expect(res.body[3].marginDelta).toBe(20.0); // $50 * 40% = $20
    });

    it('Margin Threshold Filtering: Excludes products below minMarginThreshold', async () => {
      // Filter with minMarginThreshold = 25% (should exclude Cable at 5% and keep Warranty 70%, Dock 30%, Mouse 40%)
      const res = await request(app).get(`/upsell/${activeQuotationId}?minMarginThreshold=25`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(3);

      const returnedProductIds = res.body.map((item: any) => item.productId);
      expect(returnedProductIds).not.toContain(lowMarginCableProduct.id);
      expect(returnedProductIds).toContain(warrantyProduct.id);
      expect(returnedProductIds).toContain(dockProduct.id);
      expect(returnedProductIds).toContain(mouseProduct.id);
    });

    it('EDGE CASE: Already-in-cart exclusion (don\'t suggest a product that is already in the quotation)', async () => {
      // Add Mouse to the quotation cart
      await prisma.quotationLine.create({
        data: {
          quotationId: activeQuotationId,
          productId: mouseProduct.id,
          quantity: 1,
          unitPrice: 50.0,
          totalPrice: 50.0
        }
      });

      const res = await request(app).get(`/upsell/${activeQuotationId}`);
      expect(res.status).toBe(200);

      const returnedProductIds = res.body.map((item: any) => item.productId);
      // Mouse is now in the cart -> MUST be excluded from recommendations
      expect(returnedProductIds).not.toContain(mouseProduct.id);
      // Laptop is also in the cart -> MUST be excluded
      expect(returnedProductIds).not.toContain(laptopProduct.id);
      // Other products should still be recommended
      expect(returnedProductIds).toContain(warrantyProduct.id);
      expect(returnedProductIds).toContain(dockProduct.id);
    });

    it('EDGE CASE: De-duplication when multiple cart items trigger the same suggested product', async () => {
      // Create a rule where Mouse also triggers Dock, but with a lower score (0.4) and isPromoted = false
      await prisma.upsellRule.create({
        data: {
          triggerProductId: mouseProduct.id,
          suggestedProductId: dockProduct.id,
          coPurchaseScore: 0.4,
          isPromoted: false,
          isActive: true
        }
      });

      // Cart now has Laptop (triggers Dock with 0.90) and Mouse (triggers Dock with 0.40)
      const res = await request(app).get(`/upsell/${activeQuotationId}`);
      expect(res.status).toBe(200);

      // Dock should appear EXACTLY ONCE
      const dockEntries = res.body.filter((item: any) => item.productId === dockProduct.id);
      expect(dockEntries).toHaveLength(1);
      // It should keep the HIGHEST-ranked rule instance (score: 0.90 from Laptop)
      expect(dockEntries[0].coPurchaseScore).toBe(0.9);
    });
  });
});
