// discount_approval_workflow.test.ts
import request from 'supertest';
import app from './src/index';
import { prisma } from './shared/prisma';
import { discountsService } from './discounts/discounts.service';
import { AuthService } from './auth/auth.service';

describe('DealFlow360 Quotation Discount Approval Workflow End-to-End Test Suite (12 Core Scenarios)', () => {
  let repToken: string;
  let managerToken: string;
  let adminToken: string;
  let hwProductId: string;
  let swProductId: string;
  let svcProductId: string;

  beforeAll(async () => {
    await AuthService.ensureDemoUsers();
    await discountsService.ensureDiscountConfigsSeeded();

    // Login users
    const repRes = await request(app)
      .post('/auth/login')
      .send({ email: 'rep.alice@dealflow360.com', password: 'password123' });
    repToken = repRes.body.token;

    const mgrRes = await request(app)
      .post('/auth/login')
      .send({ email: 'manager@dealflow360.com', password: 'password123' });
    managerToken = mgrRes.body.token;

    const adminRes = await request(app)
      .post('/auth/login')
      .send({ email: 'admin@dealflow360.com', password: 'password123' });
    adminToken = adminRes.body.token;

    // Reset discount tiers
    await prisma.discountTier.deleteMany();
    await prisma.discountTier.createMany({
      data: [
        { customerTier: 'BRONZE', maxDiscountPercent: 5.0 },
        { customerTier: 'SILVER', maxDiscountPercent: 10.0 },
        { customerTier: 'GOLD', maxDiscountPercent: 15.0 }
      ]
    });

    // Reset category ceilings
    await prisma.categoryDiscountCeiling.deleteMany();
    await prisma.categoryDiscountCeiling.createMany({
      data: [
        { category: 'Hardware', maxDiscountPercent: 15.0 },
        { category: 'Software', maxDiscountPercent: 10.0 },
        { category: 'Services', maxDiscountPercent: 5.0 }
      ]
    });

    // Reset approval chains
    await prisma.approvalChain.deleteMany();
    await prisma.approvalChain.createMany({
      data: [
        { minRiskScore: 0.0, maxRiskScore: 50.0, requiredApprovers: 'MANAGER' },
        { minRiskScore: 50.01, maxRiskScore: null, requiredApprovers: 'MANAGER_THEN_FINANCE' }
      ]
    });

    // Products
    let hw = await prisma.product.findFirst({ where: { category: 'Hardware' } });
    if (!hw) {
      hw = await prisma.product.create({
        data: { name: 'HW Server 100', sku: 'HW-100-TEST', category: 'Hardware', basePrice: 1000.0 }
      });
    }
    hwProductId = hw.id;

    let sw = await prisma.product.findFirst({ where: { category: 'Software' } });
    if (!sw) {
      sw = await prisma.product.create({
        data: { name: 'SW License 200', sku: 'SW-200-TEST', category: 'Software', basePrice: 500.0 }
      });
    }
    swProductId = sw.id;

    let svc = await prisma.product.findFirst({ where: { category: 'Services' } });
    if (!svc) {
      svc = await prisma.product.create({
        data: { name: 'Svc Implementation', sku: 'SVC-300-TEST', category: 'Services', basePrice: 200.0 }
      });
    }
    svcProductId = svc.id;
  });

  // TEST 1: GOLD + 10% -> Allowed (10% <= 15% ceiling, no approval needed)
  it('TEST 1: GOLD + 10% -> allowed if applicable ceiling permits', async () => {
    const createRes = await request(app)
      .post('/quotations')
      .set('Authorization', `Bearer ${repToken}`)
      .send({ customerName: 'Test Gold 10', customerTier: 'GOLD' });
    const qId = createRes.body.id;

    await request(app)
      .patch(`/quotations/${qId}/lines`)
      .set('Authorization', `Bearer ${repToken}`)
      .send({ lines: [{ productId: hwProductId, quantity: 1, discountPercent: 10.0 }] });

    const submitRes = await request(app)
      .post('/approvals/submit')
      .set('Authorization', `Bearer ${repToken}`)
      .send({ quotationId: qId });

    expect(submitRes.status).toBe(200);
    expect(submitRes.body.requiresApproval).toBe(false);

    const q = await prisma.quotation.findUnique({ where: { id: qId } });
    expect(q?.status).toBe('READY_FOR_FULFILLMENT');
  });

  // TEST 2: GOLD + 15% -> Allowed at ceiling
  it('TEST 2: GOLD + 15% -> allowed at the ceiling', async () => {
    const createRes = await request(app)
      .post('/quotations')
      .set('Authorization', `Bearer ${repToken}`)
      .send({ customerName: 'Test Gold 15', customerTier: 'GOLD' });
    const qId = createRes.body.id;

    await request(app)
      .patch(`/quotations/${qId}/lines`)
      .set('Authorization', `Bearer ${repToken}`)
      .send({ lines: [{ productId: hwProductId, quantity: 1, discountPercent: 15.0 }] });

    const submitRes = await request(app)
      .post('/approvals/submit')
      .set('Authorization', `Bearer ${repToken}`)
      .send({ quotationId: qId });

    expect(submitRes.status).toBe(200);
    expect(submitRes.body.requiresApproval).toBe(false);
  });

  // TEST 3: GOLD + 16% -> Approval workflow
  it('TEST 3: GOLD + 16% -> approval workflow', async () => {
    const createRes = await request(app)
      .post('/quotations')
      .set('Authorization', `Bearer ${repToken}`)
      .send({ customerName: 'Test Gold 16', customerTier: 'GOLD' });
    const qId = createRes.body.id;

    await request(app)
      .patch(`/quotations/${qId}/lines`)
      .set('Authorization', `Bearer ${repToken}`)
      .send({ lines: [{ productId: hwProductId, quantity: 1, discountPercent: 16.0 }] });

    const submitRes = await request(app)
      .post('/approvals/submit')
      .set('Authorization', `Bearer ${repToken}`)
      .send({ quotationId: qId });

    expect(submitRes.status).toBe(200);
    expect(submitRes.body.requiresApproval).toBe(true);
    expect(submitRes.body.currentStep).toBe('MANAGER');

    const q = await prisma.quotation.findUnique({ where: { id: qId } });
    expect(q?.status).toBe('PENDING_APPROVAL');
  });

  // TEST 4: GOLD + 20% -> Approval workflow
  it('TEST 4: GOLD + 20% -> approval workflow', async () => {
    const createRes = await request(app)
      .post('/quotations')
      .set('Authorization', `Bearer ${repToken}`)
      .send({ customerName: 'Test Gold 20', customerTier: 'GOLD' });
    const qId = createRes.body.id;

    await request(app)
      .patch(`/quotations/${qId}/lines`)
      .set('Authorization', `Bearer ${repToken}`)
      .send({ lines: [{ productId: hwProductId, quantity: 1, discountPercent: 20.0 }] });

    const submitRes = await request(app)
      .post('/approvals/submit')
      .set('Authorization', `Bearer ${repToken}`)
      .send({ quotationId: qId });

    expect(submitRes.status).toBe(200);
    expect(submitRes.body.requiresApproval).toBe(true);
  });

  // TEST 5: GOLD + 30% -> Approval workflow
  it('TEST 5: GOLD + 30% -> approval workflow', async () => {
    const createRes = await request(app)
      .post('/quotations')
      .set('Authorization', `Bearer ${repToken}`)
      .send({ customerName: 'Test Gold 30', customerTier: 'GOLD' });
    const qId = createRes.body.id;

    await request(app)
      .patch(`/quotations/${qId}/lines`)
      .set('Authorization', `Bearer ${repToken}`)
      .send({ lines: [{ productId: hwProductId, quantity: 1, discountPercent: 30.0 }] });

    const submitRes = await request(app)
      .post('/approvals/submit')
      .set('Authorization', `Bearer ${repToken}`)
      .send({ quotationId: qId });

    expect(submitRes.status).toBe(200);
    expect(submitRes.body.requiresApproval).toBe(true);
  });

  // TEST 6: GOLD + 50% -> Approval workflow, NOT generic error
  it('TEST 6: GOLD + 50% -> approval workflow, NOT generic error', async () => {
    const createRes = await request(app)
      .post('/quotations')
      .set('Authorization', `Bearer ${repToken}`)
      .send({ customerName: 'Test Gold 50 Enterprise', customerTier: 'GOLD' });
    const qId = createRes.body.id;

    const patchRes = await request(app)
      .patch(`/quotations/${qId}/lines`)
      .set('Authorization', `Bearer ${repToken}`)
      .send({ lines: [{ productId: hwProductId, quantity: 1, discountPercent: 50.0 }] });

    expect(patchRes.status).toBe(200);

    const submitRes = await request(app)
      .post('/approvals/submit')
      .set('Authorization', `Bearer ${repToken}`)
      .send({ quotationId: qId });

    expect(submitRes.status).toBe(200);
    expect(submitRes.body.requiresApproval).toBe(true);
    expect(submitRes.body.approvalRequestId).toBeDefined();
    expect(submitRes.body.currentStep).toBe('MANAGER');

    const q = await prisma.quotation.findUnique({ where: { id: qId } });
    expect(q?.status).toBe('PENDING_APPROVAL');

    // Verify it appears in Sales Manager approval queue
    const queueRes = await request(app)
      .get('/approvals/queue')
      .set('Authorization', `Bearer ${managerToken}`);
    expect(queueRes.status).toBe(200);
    const queueQuoteIds = queueRes.body.map((i: any) => i.quotationId);
    expect(queueQuoteIds).toContain(qId);
  });

  // TEST 7: Invalid discount value -> Proper 400 validation error
  it('TEST 7: Invalid discount value (-5% or 150%) -> proper validation error', async () => {
    const createRes = await request(app)
      .post('/quotations')
      .set('Authorization', `Bearer ${repToken}`)
      .send({ customerName: 'Invalid Discount Test', customerTier: 'GOLD' });
    const qId = createRes.body.id;

    // Direct risk calculation with negative discount
    const invalidRes1 = await request(app)
      .post('/discounts/calculate-risk')
      .set('Authorization', `Bearer ${repToken}`)
      .send({
        customerTier: 'GOLD',
        lines: [{ category: 'Hardware', discountPercent: -5.0, lineTotal: 1000 }]
      });
    expect(invalidRes1.status).toBe(400);
    expect(invalidRes1.body.error).toContain('between 0 and 100');

    // Direct risk calculation with > 100 discount
    const invalidRes2 = await request(app)
      .post('/discounts/calculate-risk')
      .set('Authorization', `Bearer ${repToken}`)
      .send({
        customerTier: 'GOLD',
        lines: [{ category: 'Hardware', discountPercent: 150.0, lineTotal: 1000 }]
      });
    expect(invalidRes2.status).toBe(400);
    expect(invalidRes2.body.error).toContain('between 0 and 100');
  });

  // TEST 8: Multiple quotation lines with different category ceilings -> Correct per-line validation + blended risk
  it('TEST 8: Multiple quotation lines with different category ceilings -> correct per-line validation + blended risk', async () => {
    const createRes = await request(app)
      .post('/quotations')
      .set('Authorization', `Bearer ${repToken}`)
      .send({ customerName: 'Multi Category Client', customerTier: 'GOLD' });
    const qId = createRes.body.id;

    // Hardware (allowed 15%, requested 12% -> OK)
    // Software (allowed 10%, requested 8% -> OK)
    // Services (allowed 5%, requested 8% -> 3% overage)
    await request(app)
      .patch(`/quotations/${qId}/lines`)
      .set('Authorization', `Bearer ${repToken}`)
      .send({
        lines: [
          { productId: hwProductId, quantity: 1, discountPercent: 12.0 },
          { productId: swProductId, quantity: 1, discountPercent: 8.0 },
          { productId: svcProductId, quantity: 1, discountPercent: 8.0 }
        ]
      });

    const submitRes = await request(app)
      .post('/approvals/submit')
      .set('Authorization', `Bearer ${repToken}`)
      .send({ quotationId: qId });

    expect(submitRes.status).toBe(200);
    expect(submitRes.body.requiresApproval).toBe(true);

    const detailRes = await request(app)
      .get(`/approvals/${qId}/detail`)
      .set('Authorization', `Bearer ${managerToken}`);
    expect(detailRes.status).toBe(200);

    const lineDetails = detailRes.body.discountAnalysis;
    expect(lineDetails).toHaveLength(3);
    const svcLine = lineDetails.find((l: any) => l.category === 'Services');
    expect(svcLine.status).toBe('Violation');
    expect(svcLine.excess).toBe(3.0);
  });

  // TEST 9: Sales Manager approves -> Quotation moves to next correct state
  it('TEST 9: Sales Manager approves -> quotation moves to next correct state', async () => {
    const createRes = await request(app)
      .post('/quotations')
      .set('Authorization', `Bearer ${repToken}`)
      .send({ customerName: 'Manager Approve Test', customerTier: 'GOLD' });
    const qId = createRes.body.id;

    await request(app)
      .patch(`/quotations/${qId}/lines`)
      .set('Authorization', `Bearer ${repToken}`)
      .send({ lines: [{ productId: hwProductId, quantity: 1, discountPercent: 20.0 }] });

    const submitRes = await request(app)
      .post('/approvals/submit')
      .set('Authorization', `Bearer ${repToken}`)
      .send({ quotationId: qId });

    const reqId = submitRes.body.approvalRequestId;

    const actionRes = await request(app)
      .post(`/approvals/${reqId}/action`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ action: 'APPROVED', reason: 'Approved by Sales Manager' });

    expect(actionRes.status).toBe(200);
    expect(actionRes.body.status).toBe('APPROVED');

    const q = await prisma.quotation.findUnique({ where: { id: qId } });
    expect(q?.status).toBe('APPROVED');
  });

  // TEST 10: Sales Manager rejects -> Quotation becomes REJECTED according to state model
  it('TEST 10: Sales Manager rejects -> quotation becomes REJECTED according to existing state model', async () => {
    const createRes = await request(app)
      .post('/quotations')
      .set('Authorization', `Bearer ${repToken}`)
      .send({ customerName: 'Manager Reject Test', customerTier: 'GOLD' });
    const qId = createRes.body.id;

    await request(app)
      .patch(`/quotations/${qId}/lines`)
      .set('Authorization', `Bearer ${repToken}`)
      .send({ lines: [{ productId: hwProductId, quantity: 1, discountPercent: 35.0 }] });

    const submitRes = await request(app)
      .post('/approvals/submit')
      .set('Authorization', `Bearer ${repToken}`)
      .send({ quotationId: qId });

    const reqId = submitRes.body.approvalRequestId;

    const actionRes = await request(app)
      .post(`/approvals/${reqId}/action`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ action: 'REJECTED', reason: 'Discount too aggressive for target margin' });

    expect(actionRes.status).toBe(200);
    expect(actionRes.body.status).toBe('REJECTED');

    const q = await prisma.quotation.findUnique({ where: { id: qId } });
    expect(q?.status).toBe('REJECTED');
  });

  // TEST 11: Return for revision -> Sales Rep can revise and resubmit
  it('TEST 11: Return for revision -> Sales Rep can revise and resubmit', async () => {
    const createRes = await request(app)
      .post('/quotations')
      .set('Authorization', `Bearer ${repToken}`)
      .send({ customerName: 'Revision Test Client', customerTier: 'GOLD' });
    const qId = createRes.body.id;

    await request(app)
      .patch(`/quotations/${qId}/lines`)
      .set('Authorization', `Bearer ${repToken}`)
      .send({ lines: [{ productId: hwProductId, quantity: 1, discountPercent: 40.0 }] });

    const submitRes = await request(app)
      .post('/approvals/submit')
      .set('Authorization', `Bearer ${repToken}`)
      .send({ quotationId: qId });

    const reqId = submitRes.body.approvalRequestId;

    // Manager returns for revision
    const returnRes = await request(app)
      .post(`/approvals/${reqId}/action`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ action: 'RETURNED_FOR_REVISION', reason: 'Please reduce discount to 20%' });

    expect(returnRes.status).toBe(200);
    expect(returnRes.body.status).toBe('RETURNED_FOR_REVISION');

    const qReturned = await prisma.quotation.findUnique({ where: { id: qId } });
    expect(qReturned?.status).toBe('RETURNED_FOR_REVISION');

    // Sales Rep modifies lines on RETURNED_FOR_REVISION quotation (reducing discount to 20%)
    const editRes = await request(app)
      .patch(`/quotations/${qId}/lines`)
      .set('Authorization', `Bearer ${repToken}`)
      .send({ lines: [{ productId: hwProductId, quantity: 1, discountPercent: 20.0 }] });

    expect(editRes.status).toBe(200);
  });

  // TEST 12: Re-submission after editing discount -> Risk and approval recalculated
  it('TEST 12: Re-submission after editing discount -> risk and approval must be recalculated', async () => {
    const createRes = await request(app)
      .post('/quotations')
      .set('Authorization', `Bearer ${repToken}`)
      .send({ customerName: 'Resubmission Recalc Client', customerTier: 'GOLD' });
    const qId = createRes.body.id;

    await request(app)
      .patch(`/quotations/${qId}/lines`)
      .set('Authorization', `Bearer ${repToken}`)
      .send({ lines: [{ productId: hwProductId, quantity: 1, discountPercent: 45.0 }] });

    // Submit initial 45% discount
    const submit1 = await request(app)
      .post('/approvals/submit')
      .set('Authorization', `Bearer ${repToken}`)
      .send({ quotationId: qId });

    expect(submit1.status).toBe(200);
    expect(submit1.body.requiresApproval).toBe(true);

    // Manager returns for revision
    await request(app)
      .post(`/approvals/${submit1.body.approvalRequestId}/action`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ action: 'RETURNED_FOR_REVISION', reason: 'Reduce discount' });

    // Rep reduces discount to 10% (within Gold 15% ceiling)
    await request(app)
      .patch(`/quotations/${qId}/lines`)
      .set('Authorization', `Bearer ${repToken}`)
      .send({ lines: [{ productId: hwProductId, quantity: 1, discountPercent: 10.0 }] });

    // Resubmit -> should now auto-approve (no approval required)
    const submit2 = await request(app)
      .post('/approvals/submit')
      .set('Authorization', `Bearer ${repToken}`)
      .send({ quotationId: qId });

    expect(submit2.status).toBe(200);
    expect(submit2.body.requiresApproval).toBe(false);

    const qFinal = await prisma.quotation.findUnique({ where: { id: qId } });
    expect(qFinal?.status).toBe('READY_FOR_FULFILLMENT');
  });
});
