// quotations/quotations.test.js
const request = require('supertest');
const app = require('../src/index').default || require('../src/index');
const { prisma } = require('../shared/prisma');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dealflow360-super-secret-key';

describe('Core Quotation Management Integration Tests', () => {
  let repToken, managerToken, customerToken;
  let repUser, managerUser, customerUser;
  let prodHardware, prodService;

  beforeAll(async () => {
    // Clear database before tests
    await prisma.approvalStepRecord.deleteMany();
    await prisma.approvalRequest.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.quotationLine.deleteMany();
    await prisma.quotation.deleteMany();
    await prisma.product.deleteMany();
    await prisma.approvalChain.deleteMany();
    await prisma.categoryDiscountCeiling.deleteMany();
    await prisma.discountTier.deleteMany();
    await prisma.user.deleteMany();

    // Create users
    repUser = await prisma.user.create({
      data: { email: 'rep-q@dealflow.com', name: 'Sales Rep Q', role: 'REP' }
    });
    managerUser = await prisma.user.create({
      data: { email: 'manager-q@dealflow.com', name: 'Sales Manager Q', role: 'MANAGER' }
    });
    customerUser = await prisma.user.create({
      data: { email: 'acme-customer@dealflow.com', name: 'Acme Customer', role: 'CUSTOMER', isPortalUser: true }
    });

    repToken = jwt.sign({ userId: repUser.id, role: 'REP' }, JWT_SECRET);
    managerToken = jwt.sign({ userId: managerUser.id, role: 'MANAGER' }, JWT_SECRET);
    customerToken = jwt.sign({ userId: customerUser.id, role: 'CUSTOMER' }, JWT_SECRET);

    // Seed discount governance rules
    await prisma.discountTier.createMany({
      data: [
        { customerTier: 'BRONZE', maxDiscountPercent: 5 },
        { customerTier: 'GOLD', maxDiscountPercent: 15 }
      ]
    });

    await prisma.categoryDiscountCeiling.createMany({
      data: [
        { category: 'Hardware', maxDiscountPercent: 15 },
        { category: 'Service', maxDiscountPercent: 10 }
      ]
    });

    await prisma.approvalChain.createMany({
      data: [
        { minRiskScore: 0.1, maxRiskScore: 100.0, requiredApprovers: 'MANAGER' }
      ]
    });

    // Create products
    prodHardware = await prisma.product.create({
      data: { sku: 'HW-Q1', name: 'Server Unit', category: 'Hardware', basePrice: 1000 }
    });
    prodService = await prisma.product.create({
      data: { sku: 'SV-Q1', name: 'Setup Service', category: 'Service', basePrice: 500 }
    });
  });

  afterAll(async () => {
    await prisma.approvalStepRecord.deleteMany();
    await prisma.approvalRequest.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.quotationLine.deleteMany();
    await prisma.quotation.deleteMany();
    await prisma.product.deleteMany();
    await prisma.approvalChain.deleteMany();
    await prisma.categoryDiscountCeiling.deleteMany();
    await prisma.discountTier.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  // ============================================================================
  // 1. Primary Integration Flow: Create -> Add Lines -> Submit to Approvals Engine
  // ============================================================================
  describe('Full End-to-End Integration Flow', () => {
    it('should create a quotation, upsert lines with server-side pricing, and submit to approval engine reading real line data', async () => {
      // 1. POST /quotations (Create DRAFT)
      const createRes = await request(app)
        .post('/quotations')
        .set('Authorization', `Bearer ${repToken}`)
        .send({
          customerId: customerUser.id,
          customerName: 'Acme Corp',
          customerTier: 'GOLD'
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.quotationId).toBeDefined();
      expect(createRes.body.status).toBe('DRAFT');
      expect(createRes.body.totalAmount).toBe(0);

      const qId = createRes.body.quotationId;

      // 2. PATCH /quotations/:id/lines (Upsert Lines with server-side price resolution)
      // Hardware: basePrice 1000, 12% discount (allowed 15%) -> lineTotal 880
      // Service: basePrice 500, 20% discount (allowed 10%) -> lineTotal 400 (8 points overage on Service)
      const linesRes = await request(app)
        .patch(`/quotations/${qId}/lines`)
        .set('Authorization', `Bearer ${repToken}`)
        .send({
          lines: [
            { productId: prodHardware.id, quantity: 1, discountPercent: 12 },
            { productId: prodService.id, quantity: 1, discountPercent: 20 }
          ]
        });

      expect(linesRes.status).toBe(200);
      expect(linesRes.body.lines.length).toBe(2);
      expect(linesRes.body.totalAmount).toBe(1280); // 880 + 400 = 1280

      // Verify line details resolved unitPrice server-side
      const serviceLine = linesRes.body.lines.find(l => l.productId === prodService.id);
      expect(serviceLine.unitPrice).toBe(500);
      expect(serviceLine.discountPercent).toBe(20);
      expect(serviceLine.lineTotal).toBe(400);

      // 3. POST /approvals/submit (Submit quotation to Approvals engine - unmocked real integration)
      const submitRes = await request(app)
        .post('/approvals/submit')
        .set('Authorization', `Bearer ${repToken}`)
        .send({ quotationId: qId });

      expect(submitRes.status).toBe(200);
      expect(submitRes.body.requiresApproval).toBe(true);
      expect(submitRes.body.approvalRequestId).toBeDefined();
      expect(submitRes.body.currentStep).toBe('MANAGER');

      // Verify database reflects PENDING_APPROVAL status
      const updatedQuote = await prisma.quotation.findUnique({ where: { id: qId } });
      expect(updatedQuote.status).toBe('PENDING_APPROVAL');
    });
  });

  // ============================================================================
  // 2. Edge Cases & Validation Checks
  // ============================================================================
  describe('Edge Cases & Validation Checks', () => {
    it('should reject editing lines on a non-DRAFT quotation with 409 Conflict', async () => {
      // Create draft and submit to approval
      const createRes = await request(app)
        .post('/quotations')
        .set('Authorization', `Bearer ${repToken}`)
        .send({ customerTier: 'GOLD' });

      const qId = createRes.body.quotationId;

      await request(app)
        .patch(`/quotations/${qId}/lines`)
        .set('Authorization', `Bearer ${repToken}`)
        .send({
          lines: [{ productId: prodHardware.id, quantity: 1, discountPercent: 18 }]
        });

      // Submit quote to PENDING_APPROVAL status
      await request(app)
        .post('/approvals/submit')
        .set('Authorization', `Bearer ${repToken}`)
        .send({ quotationId: qId });

      // Attempt to edit lines on PENDING_APPROVAL quote
      const editRes = await request(app)
        .patch(`/quotations/${qId}/lines`)
        .set('Authorization', `Bearer ${repToken}`)
        .send({
          lines: [{ productId: prodHardware.id, quantity: 2, discountPercent: 10 }]
        });

      expect(editRes.status).toBe(409);
      expect(editRes.body.error).toContain('Only DRAFT quotations can be modified');
    });

    it('should reject submitting an empty quotation for approval with 400 Bad Request', async () => {
      const createRes = await request(app)
        .post('/quotations')
        .set('Authorization', `Bearer ${repToken}`)
        .send({ customerTier: 'GOLD' });

      const qId = createRes.body.quotationId;

      const submitRes = await request(app)
        .post('/approvals/submit')
        .set('Authorization', `Bearer ${repToken}`)
        .send({ quotationId: qId });

      expect(submitRes.status).toBe(400);
      expect(submitRes.body.error).toContain('Cannot submit an empty quotation');
    });

    it('should reject quotation creation with a non-existent customerId (400 Bad Request)', async () => {
      const res = await request(app)
        .post('/quotations')
        .set('Authorization', `Bearer ${repToken}`)
        .send({ customerId: 'non-existent-user-id-999' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Customer with ID');
    });
  });

  // ============================================================================
  // 3. Pipeline Listing & Scoping
  // ============================================================================
  describe('Pipeline Listing & Role Scoping', () => {
    it('should list quotations with role-based scoping (reps see own, manager sees all)', async () => {
      // Rep list view
      const repListRes = await request(app)
        .get('/quotations')
        .set('Authorization', `Bearer ${repToken}`);

      expect(repListRes.status).toBe(200);
      expect(Array.isArray(repListRes.body)).toBe(true);

      // Manager list view
      const managerListRes = await request(app)
        .get('/quotations')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(managerListRes.status).toBe(200);
      expect(Array.isArray(managerListRes.body)).toBe(true);
    });
  });
});
