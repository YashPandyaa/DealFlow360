// frontend_live_pairing.test.ts
import request from 'supertest';
import app from './src/index';
import { prisma } from './shared/prisma';
import bcrypt from 'bcryptjs';

describe('Frontend Dev A Live Integration Pairing Suite', () => {
  let repAliceToken: string;
  let repBobToken: string;
  let managerToken: string;
  let financeToken: string;

  let repAliceUser: any;
  let repBobUser: any;
  let managerUser: any;
  let financeUser: any;

  let hwServer: any;
  let svcDeploy: any;

  beforeAll(async () => {
    // 1. Clean Database
    await prisma.stockAllocation.deleteMany();
    await prisma.billingScheduleEntry.deleteMany();
    await prisma.creditNote.deleteMany();
    await prisma.subscription.deleteMany();
    await prisma.subscriptionPlan.deleteMany();
    await prisma.approvalStepRecord.deleteMany();
    await prisma.approvalRequest.deleteMany();
    await prisma.quotationLine.deleteMany();
    await prisma.quotation.deleteMany();
    await prisma.approvalChain.deleteMany();
    await prisma.categoryDiscountCeiling.deleteMany();
    await prisma.discountTier.deleteMany();
    await prisma.warehouseStock.deleteMany();
    await prisma.warehouse.deleteMany();
    await prisma.product.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.portalMagicLink.deleteMany();
    await prisma.user.deleteMany();

    // 2. Create Users
    const passwordHash = await bcrypt.hash('password123', 10);

    repAliceUser = await prisma.user.create({
      data: { email: 'alice.rep@dealflow.com', passwordHash, name: 'Alice Rep', role: 'REP', teamId: 'TEAM-EAST' }
    });

    repBobUser = await prisma.user.create({
      data: { email: 'bob.rep@dealflow.com', passwordHash, name: 'Bob Rep', role: 'REP', teamId: 'TEAM-WEST' }
    });

    managerUser = await prisma.user.create({
      data: { email: 'sarah.manager@dealflow.com', passwordHash, name: 'Sarah Manager', role: 'MANAGER', teamId: 'TEAM-EAST' }
    });

    financeUser = await prisma.user.create({
      data: { email: 'frank.finance@dealflow.com', passwordHash, name: 'Frank Finance', role: 'FINANCE', teamId: 'FINANCE' }
    });

    // Login tokens
    const loginAlice = await request(app).post('/auth/login').send({ email: 'alice.rep@dealflow.com', password: 'password123' });
    repAliceToken = loginAlice.body.token;

    const loginBob = await request(app).post('/auth/login').send({ email: 'bob.rep@dealflow.com', password: 'password123' });
    repBobToken = loginBob.body.token;

    const loginMgr = await request(app).post('/auth/login').send({ email: 'sarah.manager@dealflow.com', password: 'password123' });
    managerToken = loginMgr.body.token;

    const loginFin = await request(app).post('/auth/login').send({ email: 'frank.finance@dealflow.com', password: 'password123' });
    financeToken = loginFin.body.token;

    // 3. Create Products
    hwServer = await prisma.product.create({
      data: { sku: 'PAIR-HW-SRV', name: 'Enterprise Server Node', category: 'Hardware', basePrice: 5000.0, marginPercent: 30.0 }
    });

    svcDeploy = await prisma.product.create({
      data: { sku: 'PAIR-SVC-DEP', name: 'Cloud Deployment Service', category: 'Service', basePrice: 1000.0, marginPercent: 70.0 }
    });

    // 4. Create Discount Governance (15% hardware ceiling, 10% service ceiling)
    await prisma.discountTier.createMany({
      data: [
        { customerTier: 'GOLD', maxDiscountPercent: 15.0 },
        { customerTier: 'SILVER', maxDiscountPercent: 10.0 }
      ]
    });

    await prisma.categoryDiscountCeiling.createMany({
      data: [
        { category: 'Hardware', maxDiscountPercent: 15.0 },
        { category: 'Service', maxDiscountPercent: 10.0 }
      ]
    });

    await prisma.approvalChain.createMany({
      data: [
        { minRiskScore: 0.01, maxRiskScore: 5.0, requiredApprovers: 'MANAGER' },
        { minRiskScore: 5.01, maxRiskScore: null, requiredApprovers: 'MANAGER_THEN_FINANCE' }
      ]
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // Checkpoint 1: Pipeline Scoping
  test('Checkpoint 1: POST /quotations scopes to req.user.id and enforces rep-level pipeline isolation in GET /quotations', async () => {
    // Alice creates quote
    const aliceQuoteRes = await request(app)
      .post('/quotations')
      .set('Authorization', `Bearer ${repAliceToken}`)
      .send({ customerName: 'Alice Global Client', customerTier: 'GOLD' });
    expect(aliceQuoteRes.status).toBe(201);
    const aliceQuoteId = aliceQuoteRes.body.id;

    // Bob creates quote
    const bobQuoteRes = await request(app)
      .post('/quotations')
      .set('Authorization', `Bearer ${repBobToken}`)
      .send({ customerName: 'Bob Western Client', customerTier: 'SILVER' });
    expect(bobQuoteRes.status).toBe(201);
    const bobQuoteId = bobQuoteRes.body.id;

    // Rep Alice calls GET /quotations -> sees only Alice's quote
    const aliceListRes = await request(app)
      .get('/quotations')
      .set('Authorization', `Bearer ${repAliceToken}`);
    expect(aliceListRes.status).toBe(200);
    const aliceQuoteIds = aliceListRes.body.map((q: any) => q.id);
    expect(aliceQuoteIds).toContain(aliceQuoteId);
    expect(aliceQuoteIds).not.toContain(bobQuoteId);

    // Rep Bob calls GET /quotations -> sees only Bob's quote
    const bobListRes = await request(app)
      .get('/quotations')
      .set('Authorization', `Bearer ${repBobToken}`);
    expect(bobListRes.status).toBe(200);
    const bobQuoteIds = bobListRes.body.map((q: any) => q.id);
    expect(bobQuoteIds).toContain(bobQuoteId);
    expect(bobQuoteIds).not.toContain(aliceQuoteId);

    // Manager Sarah calls GET /quotations -> sees both Alice and Bob quotes
    const mgrListRes = await request(app)
      .get('/quotations')
      .set('Authorization', `Bearer ${managerToken}`);
    expect(mgrListRes.status).toBe(200);
    const mgrQuoteIds = mgrListRes.body.map((q: any) => q.id);
    expect(mgrQuoteIds).toContain(aliceQuoteId);
    expect(mgrQuoteIds).toContain(bobQuoteId);
  });

  // Checkpoint 2: State Machine Guard on Line Edits (Reload the page bug protection)
  test('Checkpoint 2: PATCH /quotations/:id/lines strictly rejects edits once quotation leaves DRAFT status', async () => {
    // Create quote and add lines
    const createRes = await request(app)
      .post('/quotations')
      .set('Authorization', `Bearer ${repAliceToken}`)
      .send({ customerName: 'State Machine Test Corp', customerTier: 'GOLD' });

    const quoteId = createRes.body.id;

    // Add lines while in DRAFT -> Success (200)
    const draftEditRes = await request(app)
      .patch(`/quotations/${quoteId}/lines`)
      .set('Authorization', `Bearer ${repAliceToken}`)
      .send({
        lines: [
          { productId: hwServer.id, quantity: 1, discountPercent: 10.0 }
        ]
      });
    expect(draftEditRes.status).toBe(200);

    // Submit for approval -> status moves to PENDING_APPROVAL / READY_FOR_FULFILLMENT
    await prisma.quotation.update({
      where: { id: quoteId },
      data: { status: 'PENDING_APPROVAL' }
    });

    // Attempting to edit lines after status has left DRAFT (e.g. reload the page in UI) -> Must 409 Conflict
    const submittedEditRes = await request(app)
      .patch(`/quotations/${quoteId}/lines`)
      .set('Authorization', `Bearer ${repAliceToken}`)
      .send({
        lines: [
          { productId: hwServer.id, quantity: 2, discountPercent: 0.0 }
        ]
      });
    expect(submittedEditRes.status).toBe(409);
    expect(submittedEditRes.body.error).toContain('Only DRAFT quotations can be modified');
  });

  // Checkpoint 3: Step 3 Critical Risk-Score Case Live
  test('Checkpoint 3: Real Quote with 12% Hardware (allowed 15%) and 18% Service (allowed 10%) routes correctly to Approvals', async () => {
    // 1. Create quote
    const quoteRes = await request(app)
      .post('/quotations')
      .set('Authorization', `Bearer ${repAliceToken}`)
      .send({ customerName: 'Enterprise Cloud Systems', customerTier: 'GOLD' });
    const quoteId = quoteRes.body.id;

    // 2. Add line items:
    // - Hardware: $5,000 base, 12% discount (allowed 15% -> 0 overage) -> $4,400 line total
    // - Service: $1,000 base, 18% discount (allowed 10% -> 8% overage) -> $820 line total
    const linesRes = await request(app)
      .patch(`/quotations/${quoteId}/lines`)
      .set('Authorization', `Bearer ${repAliceToken}`)
      .send({
        lines: [
          { productId: hwServer.id, quantity: 1, discountPercent: 12.0 },
          { productId: svcDeploy.id, quantity: 1, discountPercent: 18.0 }
        ]
      });
    expect(linesRes.status).toBe(200);
    expect(linesRes.body.totalAmount).toBe(5220.0);

    // 3. Submit for approval -> triggers Quotations -> Discounts -> Approvals seam
    const submitRes = await request(app)
      .post('/approvals/submit')
      .set('Authorization', `Bearer ${repAliceToken}`)
      .send({ quotationId: quoteId });

    expect(submitRes.status).toBe(200);
    expect(submitRes.body.requiresApproval).toBe(true);
    expect(submitRes.body.approvalRequestId).toBeDefined();
    expect(submitRes.body.currentStep).toBe('MANAGER');

    // Verify approval request created in DB with correct blended risk score
    const appReq = await prisma.approvalRequest.findUnique({
      where: { id: submitRes.body.approvalRequestId }
    });
    expect(appReq).toBeDefined();
    expect(appReq?.blendedRiskScore).toBeGreaterThan(0);
    expect(appReq?.status).toBe('PENDING');

    // Verify quotation status transitioned to PENDING_APPROVAL
    const updatedQuote = await prisma.quotation.findUnique({ where: { id: quoteId } });
    expect(updatedQuote?.status).toBe('PENDING_APPROVAL');
  });

  // Checkpoint 4: Role Enforcement & Approval Action Guards Live
  test('Checkpoint 4: Role enforcement blocks unauthorized approvers and prevents skipping approval chain tiers', async () => {
    // Setup a quotation requiring multi-tier approval (MANAGER_THEN_FINANCE)
    const quote = await prisma.quotation.create({
      data: {
        quoteNumber: 'Q-ROLE-TEST-001',
        userId: repAliceUser.id,
        customerTier: 'GOLD',
        status: 'PENDING_APPROVAL',
        totalAmount: 10000.0,
        lines: {
          create: [
            { productId: hwServer.id, quantity: 2, unitPrice: 5000.0, discount: 30.0, totalPrice: 7000.0 }
          ]
        }
      }
    });

    const appReq = await prisma.approvalRequest.create({
      data: {
        quotationId: quote.id,
        blendedRiskScore: 15.0,
        requiredApprovers: 'MANAGER_THEN_FINANCE',
        currentStep: 'MANAGER',
        status: 'PENDING'
      }
    });

    // Guard 1: Rep cannot act on approval request -> 403 Forbidden
    const repActionRes = await request(app)
      .post(`/approvals/${appReq.id}/action`)
      .set('Authorization', `Bearer ${repAliceToken}`)
      .send({ action: 'APPROVED', reason: 'Rep trying to self-approve' });
    expect(repActionRes.status).toBe(403);

    // Guard 2: Finance cannot act prematurely while currentStep is still MANAGER -> 403 Forbidden
    const financePrematureRes = await request(app)
      .post(`/approvals/${appReq.id}/action`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ action: 'APPROVED', reason: 'Finance acting too early' });
    expect(financePrematureRes.status).toBe(403);

    // Step 1: Manager approves -> advances currentStep to FINANCE
    const managerStepRes = await request(app)
      .post(`/approvals/${appReq.id}/action`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ action: 'APPROVED', reason: 'Manager sign-off' });
    expect(managerStepRes.status).toBe(200);
    expect(managerStepRes.body.currentStep).toBe('FINANCE');
    expect(managerStepRes.body.status).toBe('PENDING');

    // Guard 3: Manager cannot act on Step 2 (FINANCE) -> 403 Forbidden
    const managerDuplicateRes = await request(app)
      .post(`/approvals/${appReq.id}/action`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ action: 'APPROVED', reason: 'Manager trying to approve finance step' });
    expect(managerDuplicateRes.status).toBe(403);

    // Step 2: Finance signs off -> finalizes workflow to APPROVED
    const financeFinalRes = await request(app)
      .post(`/approvals/${appReq.id}/action`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ action: 'APPROVED', reason: 'Finance final sign-off' });
    expect(financeFinalRes.status).toBe(200);
    expect(financeFinalRes.body.status).toBe('APPROVED');

    // Check quotation status updated to APPROVED
    const finalQuote = await prisma.quotation.findUnique({ where: { id: quote.id } });
    expect(finalQuote?.status).toBe('APPROVED');
  });

  // Checkpoint 5: Complete Audit Trail History with User Attribution
  test('Checkpoint 5: GET /approvals/:quotationId/history returns complete chronological trail with user details and reasons', async () => {
    // Query history for the approved quotation
    const quote = await prisma.quotation.findFirst({
      where: { quoteNumber: 'Q-ROLE-TEST-001' }
    });

    const historyRes = await request(app)
      .get(`/approvals/${quote!.id}/history`)
      .set('Authorization', `Bearer ${managerToken}`);

    expect(historyRes.status).toBe(200);
    expect(historyRes.body.quotationId).toBe(quote!.id);
    expect(historyRes.body.stepRecords).toHaveLength(2); // Manager step + Finance step

    const managerStep = historyRes.body.stepRecords[0];
    expect(managerStep.approverRole).toBe('MANAGER');
    expect(managerStep.approverName).toBe('Sarah Manager');
    expect(managerStep.reason).toBe('Manager sign-off');
    expect(managerStep.createdAt).toBeDefined();

    const financeStep = historyRes.body.stepRecords[1];
    expect(financeStep.approverRole).toBe('FINANCE');
    expect(financeStep.approverName).toBe('Frank Finance');
    expect(financeStep.reason).toBe('Finance final sign-off');
    expect(financeStep.createdAt).toBeDefined();

    expect(historyRes.body.auditLogs.length).toBeGreaterThanOrEqual(2);
    expect(historyRes.body.auditLogs[0].userName).toBeDefined();
    expect(historyRes.body.auditLogs[0].action).toBeDefined();
  });
});
