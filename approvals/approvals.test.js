// approvals/approvals.test.js
const request = require('supertest');
const app = require('../src/index').default || require('../src/index');
const { prisma } = require('../shared/prisma');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dealflow360-super-secret-key';

describe('Approval Workflow Engine Integration Tests', () => {
  let repToken, managerToken, financeToken;
  let testUser, managerUser, financeUser;
  let productHardware, productService, quotation;

  beforeAll(async () => {
    // Clean tables before running test suite
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

    // Create users with different roles
    testUser = await prisma.user.create({
      data: { email: 'rep@dealflow.com', name: 'Sales Rep', role: 'REP' }
    });
    managerUser = await prisma.user.create({
      data: { email: 'manager@dealflow.com', name: 'Sales Manager', role: 'MANAGER' }
    });
    financeUser = await prisma.user.create({
      data: { email: 'finance@dealflow.com', name: 'Finance Admin', role: 'FINANCE' }
    });

    repToken = jwt.sign({ userId: testUser.id, role: 'REP' }, JWT_SECRET);
    managerToken = jwt.sign({ userId: managerUser.id, role: 'MANAGER' }, JWT_SECRET);
    financeToken = jwt.sign({ userId: financeUser.id, role: 'FINANCE' }, JWT_SECRET);

    // Seed discount governance rules
    await prisma.discountTier.createMany({
      data: [
        { customerTier: 'BRONZE', maxDiscountPercent: 5 },
        { customerTier: 'SILVER', maxDiscountPercent: 10 },
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
        { minRiskScore: 0.1, maxRiskScore: 5.0, requiredApprovers: 'MANAGER' },
        { minRiskScore: 5.01, maxRiskScore: 100.0, requiredApprovers: 'MANAGER_THEN_FINANCE' }
      ]
    });

    // Seed test products
    productHardware = await prisma.product.create({
      data: { sku: 'HW-01', name: 'Hardware Server', category: 'Hardware', basePrice: 1000 }
    });
    productService = await prisma.product.create({
      data: { sku: 'SV-01', name: 'Setup Service', category: 'Service', basePrice: 500 }
    });
  });

  beforeEach(async () => {
    await prisma.approvalStepRecord.deleteMany();
    await prisma.approvalRequest.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.quotationLine.deleteMany();
    await prisma.quotation.deleteMany();

    // Create default test quotation requiring MANAGER_THEN_FINANCE approval
    // Setup Service: 20% discount (ceiling 10%) -> 10 overage on 50% order share -> score 5.0
    // To trigger MANAGER_THEN_FINANCE (score > 5.0), set Service discount to 25% (overage 15 on 50% order share -> score 7.5)
    quotation = await prisma.quotation.create({
      data: {
        quoteNumber: `QT-${Date.now()}-${Math.floor(Math.random()*1000)}`,
        userId: testUser.id,
        customerTier: 'GOLD',
        status: 'DRAFT',
        totalAmount: 1000,
        lines: {
          create: [
            { productId: productHardware.id, quantity: 1, unitPrice: 500, discount: 10, totalPrice: 500 },
            { productId: productService.id, quantity: 1, unitPrice: 500, discount: 25, totalPrice: 500 }
          ]
        }
      }
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
  // 1. Full Happy Path (Submit -> Manager Approves -> Finance Approves -> Completed)
  // ============================================================================
  describe('Full Happy Path (Submit -> Manager -> Finance -> Completed)', () => {
    it('should complete multi-step approval workflow and update quotation status', async () => {
      // 1. Submit quotation for approval
      const submitRes = await request(app)
        .post('/approvals/submit')
        .set('Authorization', `Bearer ${repToken}`)
        .send({ quotationId: quotation.id });

      expect(submitRes.status).toBe(200);
      expect(submitRes.body.requiresApproval).toBe(true);
      expect(submitRes.body.approvalRequestId).toBeDefined();
      expect(submitRes.body.currentStep).toBe('MANAGER');

      const requestId = submitRes.body.approvalRequestId;

      // Check quotation status updated to PENDING_APPROVAL
      let updatedQuote = await prisma.quotation.findUnique({ where: { id: quotation.id } });
      expect(updatedQuote.status).toBe('PENDING_APPROVAL');

      // 2. Manager approves -> advances currentStep to FINANCE, status stays PENDING
      const managerApproveRes = await request(app)
        .post(`/approvals/${requestId}/action`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ action: 'APPROVED', reason: 'Manager approved discount overage' });

      expect(managerApproveRes.status).toBe(200);
      expect(managerApproveRes.body.currentStep).toBe('FINANCE');
      expect(managerApproveRes.body.status).toBe('PENDING');

      // 3. Finance approves -> currentStep becomes COMPLETED, status becomes APPROVED
      const financeApproveRes = await request(app)
        .post(`/approvals/${requestId}/action`)
        .set('Authorization', `Bearer ${financeToken}`)
        .send({ action: 'APPROVED', reason: 'Finance verified margin thresholds' });

      expect(financeApproveRes.status).toBe(200);
      expect(financeApproveRes.body.currentStep).toBe('COMPLETED');
      expect(financeApproveRes.body.status).toBe('APPROVED');

      // Final quotation status check
      updatedQuote = await prisma.quotation.findUnique({ where: { id: quotation.id } });
      expect(updatedQuote.status).toBe('APPROVED');

      // Check history endpoint
      const historyRes = await request(app)
        .get(`/approvals/${quotation.id}/history`)
        .set('Authorization', `Bearer ${repToken}`);

      expect(historyRes.status).toBe(200);
      expect(historyRes.body.stepRecords.length).toBe(2);
      expect(historyRes.body.auditLogs.length).toBeGreaterThanOrEqual(3);
    });
  });

  // ============================================================================
  // 2. Rejection Path & Missing Reason Validation
  // ============================================================================
  describe('Rejection Path & Reason Validation', () => {
    it('should reject approval request with reason and update quotation status to REJECTED', async () => {
      // Submit
      const submitRes = await request(app)
        .post('/approvals/submit')
        .set('Authorization', `Bearer ${repToken}`)
        .send({ quotationId: quotation.id });

      const requestId = submitRes.body.approvalRequestId;

      // Reject
      const rejectRes = await request(app)
        .post(`/approvals/${requestId}/action`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ action: 'REJECTED', reason: 'Discount is far too steep for service line' });

      expect(rejectRes.status).toBe(200);
      expect(rejectRes.body.status).toBe('REJECTED');
      expect(rejectRes.body.currentStep).toBe('MANAGER'); // Current step does not advance

      const updatedQuote = await prisma.quotation.findUnique({ where: { id: quotation.id } });
      expect(updatedQuote.status).toBe('REJECTED');
    });

    it('should require a reason when rejecting or returning for revision (400 Bad Request)', async () => {
      const submitRes = await request(app)
        .post('/approvals/submit')
        .set('Authorization', `Bearer ${repToken}`)
        .send({ quotationId: quotation.id });

      const requestId = submitRes.body.approvalRequestId;

      const rejectRes = await request(app)
        .post(`/approvals/${requestId}/action`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ action: 'REJECTED' }); // No reason provided

      expect(rejectRes.status).toBe(400);
      expect(rejectRes.body.error).toContain('Reason is required');
    });

    it('should reject action if acting user role does not match currentStep (403 Forbidden)', async () => {
      const submitRes = await request(app)
        .post('/approvals/submit')
        .set('Authorization', `Bearer ${repToken}`)
        .send({ quotationId: quotation.id });

      const requestId = submitRes.body.approvalRequestId;

      // Finance trying to approve while step is MANAGER
      const actionRes = await request(app)
        .post(`/approvals/${requestId}/action`)
        .set('Authorization', `Bearer ${financeToken}`)
        .send({ action: 'APPROVED' });

      expect(actionRes.status).toBe(403);
      expect(actionRes.body.error).toContain("Only users with role 'MANAGER'");
    });
  });

  // ============================================================================
  // 3. Reopen After Negotiation Path
  // ============================================================================
  describe('Reopen After Negotiation Path', () => {
    it('should create a fresh ApprovalRequest when a negotiated counter-offer requires re-approval', async () => {
      // 1. Submit & approve quote initially
      const submitRes = await request(app)
        .post('/approvals/submit')
        .set('Authorization', `Bearer ${repToken}`)
        .send({ quotationId: quotation.id });

      const firstRequestId = submitRes.body.approvalRequestId;

      await request(app)
        .post(`/approvals/${firstRequestId}/action`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ action: 'APPROVED' });

      await request(app)
        .post(`/approvals/${firstRequestId}/action`)
        .set('Authorization', `Bearer ${financeToken}`)
        .send({ action: 'APPROVED' });

      // First request is APPROVED
      let firstRequest = await prisma.approvalRequest.findUnique({ where: { id: firstRequestId } });
      expect(firstRequest.status).toBe('APPROVED');

      // 2. Re-negotiate: customer counter-offer changes discount. Call reopen.
      const reopenRes = await request(app)
        .post(`/approvals/${quotation.id}/reopen`)
        .set('Authorization', `Bearer ${repToken}`)
        .send({});

      expect(reopenRes.status).toBe(200);
      expect(reopenRes.body.requiresApproval).toBe(true);
      expect(reopenRes.body.approvalRequestId).toBeDefined();
      expect(reopenRes.body.approvalRequestId).not.toBe(firstRequestId);

      // Verify AuditLog logged re-negotiation trigger
      const auditLog = await prisma.auditLog.findFirst({
        where: { entityId: quotation.id, action: 'REOPENED_FOR_NEGOTIATION' }
      });
      expect(auditLog).toBeDefined();
      expect(auditLog.reason).toContain('customer negotiation');
    });
  });

  // ============================================================================
  // 4. Double-Action Race Condition
  // ============================================================================
  describe('Double-Action Race Condition', () => {
    it('should fail second action cleanly with 409 Conflict when two requests arrive simultaneously', async () => {
      const submitRes = await request(app)
        .post('/approvals/submit')
        .set('Authorization', `Bearer ${repToken}`)
        .send({ quotationId: quotation.id });

      const requestId = submitRes.body.approvalRequestId;

      // Simulate simultaneous action requests
      const [res1, res2] = await Promise.all([
        request(app)
          .post(`/approvals/${requestId}/action`)
          .set('Authorization', `Bearer ${managerToken}`)
          .send({ action: 'APPROVED', reason: 'Race condition test 1' }),
        request(app)
          .post(`/approvals/${requestId}/action`)
          .set('Authorization', `Bearer ${managerToken}`)
          .send({ action: 'APPROVED', reason: 'Race condition test 2' })
      ]);

      const statusCodes = [res1.status, res2.status].sort();
      expect(statusCodes[0]).toBe(200);
      expect([403, 409]).toContain(statusCodes[1]);
    });

    it('should return 409 Conflict when attempting to act on an already completed request', async () => {
      const submitRes = await request(app)
        .post('/approvals/submit')
        .set('Authorization', `Bearer ${repToken}`)
        .send({ quotationId: quotation.id });

      const requestId = submitRes.body.approvalRequestId;

      // Manager approves
      await request(app)
        .post(`/approvals/${requestId}/action`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ action: 'APPROVED' });

      // Finance approves -> request completed
      await request(app)
        .post(`/approvals/${requestId}/action`)
        .set('Authorization', `Bearer ${financeToken}`)
        .send({ action: 'APPROVED' });

      // Attempt another action on completed request
      const extraActionRes = await request(app)
        .post(`/approvals/${requestId}/action`)
        .set('Authorization', `Bearer ${financeToken}`)
        .send({ action: 'APPROVED' });

      expect(extraActionRes.status).toBe(409);
      expect(extraActionRes.body.error).toContain('Cannot process action');
    });
  });

  // ============================================================================
  // 5. Manager Approval Queue, Detail View & Admin Statistics RBAC
  // ============================================================================
  describe('Manager Approval Detail View & Admin Statistics API', () => {
    let adminToken, adminUser;

    beforeAll(async () => {
      adminUser = await prisma.user.create({
        data: { email: 'admin-stats@dealflow.com', name: 'Admin User', role: 'ADMIN' }
      });
      adminToken = jwt.sign({ userId: adminUser.id, role: 'ADMIN' }, JWT_SECRET);
    });

    it('should return 360-degree approval detail context via GET /approvals/:quotationId/detail', async () => {
      const submitRes = await request(app)
        .post('/approvals/submit')
        .set('Authorization', `Bearer ${repToken}`)
        .send({ quotationId: quotation.id });

      expect(submitRes.status).toBe(200);

      const detailRes = await request(app)
        .get(`/approvals/${quotation.id}/detail`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(detailRes.status).toBe(200);
      expect(detailRes.body.quotation.quoteNumber).toBe(quotation.quoteNumber);
      expect(detailRes.body.customer).toBeDefined();
      expect(detailRes.body.lineItems.length).toBe(2);
      expect(detailRes.body.discountAnalysis).toBeDefined();
      expect(detailRes.body.riskAnalysis).toBeDefined();
      expect(detailRes.body.totals).toBeDefined();
    });

    it('should return Manager approval queue via GET /approvals/queue', async () => {
      const queueRes = await request(app)
        .get('/approvals/queue')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(queueRes.status).toBe(200);
      expect(Array.isArray(queueRes.body)).toBe(true);
      expect(queueRes.body.length).toBeGreaterThan(0);
    });

    it('should allow ADMIN to fetch live statistics via GET /api/admin/statistics/overview', async () => {
      const statsRes = await request(app)
        .get('/api/admin/statistics/overview')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(statsRes.status).toBe(200);
      expect(statsRes.body.quotations).toBeDefined();
      expect(statsRes.body.sales).toBeDefined();
      expect(statsRes.body.risk).toBeDefined();
      expect(statsRes.body.discounts).toBeDefined();
    });

    it('should deny non-ADMIN users with 403 Forbidden on GET /api/admin/statistics/overview', async () => {
      const repRes = await request(app)
        .get('/api/admin/statistics/overview')
        .set('Authorization', `Bearer ${repToken}`);

      expect(repRes.status).toBe(403);
      expect(repRes.body.error).toContain('Forbidden');
    });
  });
});

