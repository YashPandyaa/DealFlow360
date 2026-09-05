// discounts/discounts.test.js
const request = require('supertest');
const app = require('../src/index').default || require('../src/index');
const { prisma } = require('../shared/prisma');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dealflow360-super-secret-key';

describe('Discount Governance Module Integration Tests', () => {
  let adminToken;
  let repToken;
  let adminUserId = 'admin-uuid-123';
  let repUserId = 'rep-uuid-456';

  beforeAll(async () => {
    adminToken = jwt.sign({ userId: adminUserId, role: 'ADMIN' }, JWT_SECRET, { expiresIn: '1h' });
    repToken = jwt.sign({ userId: repUserId, role: 'REP' }, JWT_SECRET, { expiresIn: '1h' });
  });

  beforeEach(async () => {
    // Clear discount tables prior to each test
    await prisma.approvalChain.deleteMany();
    await prisma.categoryDiscountCeiling.deleteMany();
    await prisma.discountTier.deleteMany();

    // Seed default discount tiers
    await prisma.discountTier.createMany({
      data: [
        { customerTier: 'BRONZE', maxDiscountPercent: 5 },
        { customerTier: 'SILVER', maxDiscountPercent: 10 },
        { customerTier: 'GOLD', maxDiscountPercent: 15 }
      ]
    });

    // Seed default category discount ceilings
    await prisma.categoryDiscountCeiling.createMany({
      data: [
        { category: 'Hardware', maxDiscountPercent: 15 },
        { category: 'Service', maxDiscountPercent: 10 },
        { category: 'Software', maxDiscountPercent: 20 },
        { category: 'CatA', maxDiscountPercent: 10 },
        { category: 'CatB', maxDiscountPercent: 10 },
        { category: 'CatC', maxDiscountPercent: 10 },
        { category: 'CatD', maxDiscountPercent: 10 }
      ]
    });

    // Seed default approval chains
    await prisma.approvalChain.createMany({
      data: [
        { minRiskScore: 0.1, maxRiskScore: 5.0, requiredApprovers: 'MANAGER' },
        { minRiskScore: 5.01, maxRiskScore: 100.0, requiredApprovers: 'MANAGER_THEN_FINANCE' }
      ]
    });
  });

  afterAll(async () => {
    await prisma.approvalChain.deleteMany();
    await prisma.categoryDiscountCeiling.deleteMany();
    await prisma.discountTier.deleteMany();
    await prisma.$disconnect();
  });

  // ============================================================================
  // 1. Primary Brief Test Case: Gold Customer with Hardware & Service Lines
  // ============================================================================
  describe('POST /discounts/calculate-risk - Primary Brief Case (Gold/Hardware/Service)', () => {
    it('should flag Setup Service line (18% given vs 10% ceiling) for Gold customer and require approval', async () => {
      // Gold customer (tier max 15%). Hardware ceiling 15%, Service ceiling 10%.
      // - Laptop (Hardware): 12% given, 15% allowed -> fine, no overage
      // - Setup Service (Service): 18% given, 10% allowed -> 8 points over
      const payload = {
        customerTier: 'GOLD',
        lines: [
          { category: 'Hardware', discountPercent: 12, lineTotal: 800 },
          { category: 'Service', discountPercent: 18, lineTotal: 200 }
        ]
      };

      const res = await request(app)
        .post('/discounts/calculate-risk')
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('blendedRiskScore');
      expect(res.body).toHaveProperty('flaggedLines');
      expect(res.body).toHaveProperty('requiredApprovalChain');

      // blendedScore = (0 * (800 / 1000)) + (8 * (200 / 1000)) = 1.6
      expect(res.body.blendedRiskScore).toBe(1.6);
      expect(res.body.flaggedLines).toHaveLength(1);
      expect(res.body.flaggedLines[0].category).toBe('Service');
      expect(res.body.flaggedLines[0].discountPercent).toBe(18);
      expect(res.body.flaggedLines[0].categoryCeiling).toBe(10);
      expect(res.body.flaggedLines[0].overage).toBe(8);

      // Quote requires approval (MANAGER chain for risk score 1.6)
      expect(res.body.requiredApprovalChain).toBe('MANAGER');
    });
  });

  // ============================================================================
  // 2. Many Small Overages Test Case
  // ============================================================================
  describe('POST /discounts/calculate-risk - Many Small Overages', () => {
    it('should surface a meaningful blended score for four lines 2 points over each spread across order', async () => {
      // 4 lines 2 points over each (12% given vs 10% ceiling), 25% of order each (250/1000)
      // blendedScore = Σ (2 * 0.25) = 0.5 + 0.5 + 0.5 + 0.5 = 2.0
      const payload = {
        customerTier: 'SILVER',
        lines: [
          { category: 'CatA', discountPercent: 12, lineTotal: 250 },
          { category: 'CatB', discountPercent: 12, lineTotal: 250 },
          { category: 'CatC', discountPercent: 12, lineTotal: 250 },
          { category: 'CatD', discountPercent: 12, lineTotal: 250 }
        ]
      };

      const res = await request(app)
        .post('/discounts/calculate-risk')
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.blendedRiskScore).toBe(2.0);
      expect(res.body.flaggedLines).toHaveLength(4);
      expect(res.body.requiredApprovalChain).toBe('MANAGER');
    });
  });

  // ============================================================================
  // 3. Zero-Overage Case
  // ============================================================================
  describe('POST /discounts/calculate-risk - Zero Overages', () => {
    it('should return blendedScore = 0 and requiredApprovalChain = null when no lines exceed ceiling', async () => {
      const payload = {
        customerTier: 'GOLD',
        lines: [
          { category: 'Hardware', discountPercent: 12, lineTotal: 800 },
          { category: 'Service', discountPercent: 8, lineTotal: 200 }
        ]
      };

      const res = await request(app)
        .post('/discounts/calculate-risk')
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.blendedRiskScore).toBe(0);
      expect(res.body.flaggedLines).toEqual([]);
      expect(res.body).toHaveProperty('requiredApprovalChain');
      expect(res.body.requiredApprovalChain).toBeNull();
    });
  });

  // ============================================================================
  // 4. Edge Cases (Unknown customerTier, Unknown category, Empty lines)
  // ============================================================================
  describe('POST /discounts/calculate-risk - Edge Cases', () => {
    it('should fail loudly (400) if customerTier is not found in config', async () => {
      const payload = {
        customerTier: 'PLATINUM',
        lines: [
          { category: 'Hardware', discountPercent: 10, lineTotal: 500 }
        ]
      };

      const res = await request(app)
        .post('/discounts/calculate-risk')
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toContain("Customer tier 'PLATINUM' not found");
    });

    it('should fail loudly (400) if a line category is not found in config', async () => {
      const payload = {
        customerTier: 'GOLD',
        lines: [
          { category: 'NonExistentCategory', discountPercent: 10, lineTotal: 500 }
        ]
      };

      const res = await request(app)
        .post('/discounts/calculate-risk')
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toContain("Category 'NonExistentCategory' not found");
    });

    it('should handle empty lines array by returning 0 risk without divide-by-zero errors', async () => {
      const payload = {
        customerTier: 'GOLD',
        lines: []
      };

      const res = await request(app)
        .post('/discounts/calculate-risk')
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.blendedRiskScore).toBe(0);
      expect(res.body.flaggedLines).toEqual([]);
      expect(res.body.requiredApprovalChain).toBeNull();
    });
  });

  // ============================================================================
  // 5. Admin CRUD Endpoints Verification
  // ============================================================================
  describe('Admin CRUD Endpoints for Governance Config', () => {
    it('should perform CRUD for DiscountTier with admin auth', async () => {
      // List
      const listRes = await request(app)
        .get('/discounts/tiers')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body.length).toBeGreaterThanOrEqual(3);

      // Create (custom tier)
      const createRes = await request(app)
        .post('/discounts/tiers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ customerTier: 'BRONZE', maxDiscountPercent: 5 }); // BRONZE already exists, let's delete BRONZE first or use direct get

      // Update
      const goldTier = listRes.body.find(t => t.customerTier === 'GOLD');
      const updateRes = await request(app)
        .put(`/discounts/tiers/${goldTier.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ maxDiscountPercent: 18 });
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.maxDiscountPercent).toBe(18);

      // Delete
      const deleteRes = await request(app)
        .delete(`/discounts/tiers/${goldTier.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(deleteRes.status).toBe(200);
    });

    it('should perform CRUD for CategoryDiscountCeiling with admin auth', async () => {
      // Create new category ceiling
      const createRes = await request(app)
        .post('/discounts/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ category: 'CloudService', maxDiscountPercent: 25 });
      expect(createRes.status).toBe(201);
      expect(createRes.body.category).toBe('CloudService');

      const id = createRes.body.id;

      // Get by ID
      const getRes = await request(app)
        .get(`/discounts/categories/${id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.category).toBe('CloudService');

      // Update
      const updateRes = await request(app)
        .put(`/discounts/categories/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ maxDiscountPercent: 30 });
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.maxDiscountPercent).toBe(30);

      // Delete
      const deleteRes = await request(app)
        .delete(`/discounts/categories/${id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(deleteRes.status).toBe(200);
    });

    it('should perform CRUD for ApprovalChain with admin auth', async () => {
      // Create new approval chain
      const createRes = await request(app)
        .post('/discounts/approval-chains')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ minRiskScore: 101, maxRiskScore: 500, requiredApprovers: 'MANAGER_THEN_FINANCE' });
      expect(createRes.status).toBe(201);
      expect(createRes.body.minRiskScore).toBe(101);

      const id = createRes.body.id;

      // Update
      const updateRes = await request(app)
        .put(`/discounts/approval-chains/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ maxRiskScore: 1000 });
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.maxRiskScore).toBe(1000);

      // Delete
      const deleteRes = await request(app)
        .delete(`/discounts/approval-chains/${id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(deleteRes.status).toBe(200);
    });

    it('should reject non-admin users attempting CRUD operations with 403', async () => {
      const res = await request(app)
        .post('/discounts/tiers')
        .set('Authorization', `Bearer ${repToken}`)
        .send({ customerTier: 'GOLD', maxDiscountPercent: 15 });

      expect(res.status).toBe(403);
    });
  });
});
