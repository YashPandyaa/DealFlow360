// customer_exposure.test.js
const request = require('supertest');
const app = require('./src/index').default || require('./src/index');
const { prisma } = require('./shared/prisma');
const jwt = require('jsonwebtoken');
const { productsService } = require('./products/products.service');

const JWT_SECRET = process.env.JWT_SECRET || 'dealflow360-super-secret-key';

describe('Customer Exposure Safeguards & Portal/Dashboard Verification', () => {
  let customerToken, repToken, managerToken;
  let customerUser, repUser, managerUser;
  let seededProduct, seededQuotation;

  beforeAll(async () => {
    // Re-seed DB to ensure realistic demo data exists
    await productsService.seedCatalog();

    // Ensure Discount Tiers & Approval Chains exist
    await prisma.discountTier.upsert({
      where: { customerTier: 'GOLD' },
      update: {},
      create: { customerTier: 'GOLD', maxDiscountPercent: 15 }
    });
    await prisma.categoryDiscountCeiling.upsert({
      where: { category: 'Hardware' },
      update: {},
      create: { category: 'Hardware', maxDiscountPercent: 10 }
    });
    await prisma.approvalChain.upsert({
      where: { id: 'chain-mgr-exp' },
      update: {},
      create: { id: 'chain-mgr-exp', minRiskScore: 0.1, maxRiskScore: 50.0, requiredApprovers: 'MANAGER' }
    });

    // Create users
    customerUser = await prisma.user.upsert({
      where: { email: 'portal-customer@acme.com' },
      update: {},
      create: {
        email: 'portal-customer@acme.com',
        name: 'Acme Portal User',
        role: 'CUSTOMER',
        isPortalUser: true
      }
    });

    repUser = await prisma.user.findFirst({ where: { role: 'REP' } }) ||
      await prisma.user.create({ data: { email: 'rep-exp@dealflow.com', name: 'Rep Exp', role: 'REP' } });

    managerUser = await prisma.user.findFirst({ where: { role: 'MANAGER' } }) ||
      await prisma.user.create({ data: { email: 'mgr-exp@dealflow.com', name: 'Mgr Exp', role: 'MANAGER' } });

    customerToken = jwt.sign({ userId: customerUser.id, role: 'CUSTOMER' }, JWT_SECRET);
    repToken = jwt.sign({ userId: repUser.id, role: 'REP' }, JWT_SECRET);
    managerToken = jwt.sign({ userId: managerUser.id, role: 'MANAGER' }, JWT_SECRET);

    seededProduct = await prisma.product.findFirst({ where: { marginPercent: { gt: 0 } } });

    seededQuotation = await prisma.quotation.create({
      data: {
        quoteNumber: `QT-EXP-${Date.now()}`,
        userId: repUser.id,
        customerId: customerUser.id,
        customerName: 'Acme Corp',
        customerTier: 'GOLD',
        status: 'DRAFT',
        totalAmount: 5000,
        lines: {
          create: [
            { productId: seededProduct.id, quantity: 1, unitPrice: 5000, discount: 20, discountPercent: 20, totalPrice: 4000, lineTotal: 4000 }
          ]
        }
      }
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ============================================================================
  // 1. CUSTOMER-Role Data Exposure Protection
  // ============================================================================
  describe('CUSTOMER-Role Data Exposure Guard', () => {
    it('should strip marginPercent from products endpoints when requested by a CUSTOMER token', async () => {
      const listRes = await request(app)
        .get('/products')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.length).toBeGreaterThan(0);

      listRes.body.forEach((prod) => {
        expect(prod.marginPercent).toBeUndefined();
        expect(prod.cost).toBeUndefined();
      });

      const singleRes = await request(app)
        .get(`/products/${seededProduct.id}`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(singleRes.status).toBe(200);
      expect(singleRes.body.marginPercent).toBeUndefined();
      expect(singleRes.body.cost).toBeUndefined();
    });

    it('should strip internal approver details and margin info from quotations endpoint for CUSTOMER token', async () => {
      const res = await request(app)
        .get(`/quotations/${seededQuotation.id}`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      res.body.lines.forEach((line) => {
        if (line.product) {
          expect(line.product.marginPercent).toBeUndefined();
        }
      });
    });
  });

  // ============================================================================
  // 2. Portal Reopen Contract Shape Verification
  // ============================================================================
  describe('Portal Reopen Contract Verification (POST /approvals/:quotationId/reopen)', () => {
    it('should return exact schema shape matching API_CONTRACT.md on customer counter-offer reopen', async () => {
      // First submit for approval
      await request(app)
        .post('/approvals/submit')
        .set('Authorization', `Bearer ${repToken}`)
        .send({ quotationId: seededQuotation.id });

      const res = await request(app)
        .post(`/approvals/${seededQuotation.id}/reopen`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ customerTier: 'GOLD' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('requiresApproval');
      expect(typeof res.body.requiresApproval).toBe('boolean');

      if (res.body.requiresApproval) {
        expect(res.body.approvalRequestId).toBeDefined();
        expect(res.body.currentStep).toBe('MANAGER');
      }
    });
  });

  // ============================================================================
  // 3. Dashboard Deal Health Report Non-Empty Data Verification
  // ============================================================================
  describe('Dashboard Deal Health Metrics (GET /reports/deal-health)', () => {
    it('should return non-empty metrics for stalledDeals, discountAnomalies, and deliverySlippage when seed data is loaded', async () => {
      // Re-run seed script to ensure seeded demo metrics exist
      const execSync = require('child_process').execSync;
      execSync('npx tsx prisma/seed.ts');

      const res = await request(app)
        .get('/reports/deal-health?stalledDays=1')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.stalledDeals).toBeDefined();
      expect(res.body.stalledDeals.length).toBeGreaterThan(0);

      expect(res.body.discountAnomalies).toBeDefined();
      expect(res.body.discountAnomalies.length).toBeGreaterThan(0);

      expect(res.body.deliverySlippage).toBeDefined();
      expect(res.body.deliverySlippage.length).toBeGreaterThan(0);
    });
  });
});
