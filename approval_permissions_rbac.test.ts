import request from 'supertest';
import app from './src/index';
import { prisma } from './shared/prisma';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dealflow360-super-secret-key';

describe('Approval Permissions & Role-Based Access Control (RBAC) Test Suite', () => {
  let repUser: any, managerUser: any, financeUser: any, customerUser: any;
  let repToken: string, managerToken: string, financeToken: string, customerToken: string;
  let productHardware: any, productService: any;

  beforeAll(async () => {
    // Cleanup prior test artifacts
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

    // Create test users across roles
    repUser = await prisma.user.create({
      data: { email: 'salesrep@dealflow.com', name: 'Sales Rep Alice', role: 'SALES_REP' }
    });
    managerUser = await prisma.user.create({
      data: { email: 'salesmgr@dealflow.com', name: 'Manager Bob', role: 'SALES_MANAGER' }
    });
    financeUser = await prisma.user.create({
      data: { email: 'finance@dealflow.com', name: 'Finance Charlie', role: 'FINANCE' }
    });
    customerUser = await prisma.user.create({
      data: { email: 'customer@external.com', name: 'Customer Dave', role: 'CUSTOMER', isPortalUser: true }
    });

    repToken = jwt.sign({ userId: repUser.id, role: 'SALES_REP' }, JWT_SECRET);
    managerToken = jwt.sign({ userId: managerUser.id, role: 'SALES_MANAGER' }, JWT_SECRET);
    financeToken = jwt.sign({ userId: financeUser.id, role: 'FINANCE' }, JWT_SECRET);
    customerToken = jwt.sign({ userId: customerUser.id, role: 'CUSTOMER' }, JWT_SECRET);

    // Seed governance rules
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
        { category: 'Services', maxDiscountPercent: 5 }
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
      data: { sku: 'HW-100', name: 'Enterprise Server', category: 'Hardware', basePrice: 1000 }
    });
    productService = await prisma.product.create({
      data: { sku: 'SV-100', name: 'Implementation Service', category: 'Services', basePrice: 1000 }
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

  beforeEach(async () => {
    await prisma.approvalStepRecord.deleteMany();
    await prisma.approvalRequest.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.quotationLine.deleteMany();
    await prisma.quotation.deleteMany();
  });

  // Helper to create a quote with high discount
  async function createPendingQuote(repId: string, discount: number = 30) {
    const q = await prisma.quotation.create({
      data: {
        quoteNumber: `QT-RBAC-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        userId: repId,
        customerTier: 'GOLD',
        status: 'DRAFT',
        totalAmount: 1000,
        lines: {
          create: [
            { productId: productHardware.id, quantity: 1, unitPrice: 1000, discount, totalPrice: 1000 * (1 - discount / 100) }
          ]
        }
      }
    });

    const submitRes = await request(app)
      .post('/approvals/submit')
      .set('Authorization', `Bearer ${repToken}`)
      .send({ quotationId: q.id });

    return { quotation: q, approvalRequestId: submitRes.body.approvalRequestId };
  }

  // --------------------------------------------------------------------------
  // Test 1 & 2: Sales Rep creates and submits quotation
  // --------------------------------------------------------------------------
  it('1 & 2. Sales Rep creates and submits quotation successfully', async () => {
    const quoteRes = await prisma.quotation.create({
      data: {
        quoteNumber: `QT-CREATE-${Date.now()}`,
        userId: repUser.id,
        customerTier: 'GOLD',
        status: 'DRAFT',
        totalAmount: 1000,
        lines: {
          create: [{ productId: productHardware.id, quantity: 1, unitPrice: 1000, discount: 10, totalPrice: 900 }]
        }
      }
    });
    expect(quoteRes.id).toBeDefined();

    const submitRes = await request(app)
      .post('/approvals/submit')
      .set('Authorization', `Bearer ${repToken}`)
      .send({ quotationId: quoteRes.id });

    expect(submitRes.status).toBe(200);
    expect(submitRes.body.requiresApproval).toBe(false); // 10% <= 15% GOLD ceiling
  });

  // --------------------------------------------------------------------------
  // Test 3: Discount exceeds ceiling -> routed to approval
  // --------------------------------------------------------------------------
  it('3. Discount exceeding ceiling routes quotation to PENDING_APPROVAL', async () => {
    const { quotation, approvalRequestId } = await createPendingQuote(repUser.id, 50);
    expect(approvalRequestId).toBeDefined();

    const updatedQuote = await prisma.quotation.findUnique({ where: { id: quotation.id } });
    expect(updatedQuote?.status).toBe('PENDING_APPROVAL');

    const appReq = await prisma.approvalRequest.findUnique({ where: { id: approvalRequestId } });
    expect(appReq?.status).toBe('PENDING');
    expect(appReq?.currentStep).toBe('MANAGER');
  });

  // --------------------------------------------------------------------------
  // Test 4 & 5: Sales Rep manual approval attempt via API returns 403 Forbidden
  // --------------------------------------------------------------------------
  it('4 & 5. Sales Rep manually calling approval action API receives 403 Forbidden', async () => {
    const { approvalRequestId } = await createPendingQuote(repUser.id, 30);

    const approveRes = await request(app)
      .post(`/approvals/${approvalRequestId}/action`)
      .set('Authorization', `Bearer ${repToken}`)
      .send({ action: 'APPROVED', reason: 'Sales Rep trying to self approve' });

    expect(approveRes.status).toBe(403);
    expect(approveRes.body.error).toContain('Forbidden');

    const directApproveRes = await request(app)
      .post(`/approvals/${approvalRequestId}/approve`)
      .set('Authorization', `Bearer ${repToken}`)
      .send({ reason: 'Direct approve attempt' });

    expect(directApproveRes.status).toBe(403);
    expect(directApproveRes.body.error).toContain('Forbidden');
  });

  // --------------------------------------------------------------------------
  // Test 6: Self-approval prevention (Creator cannot approve even if Manager role)
  // --------------------------------------------------------------------------
  it('6. Quotation creator cannot approve their own quotation even if holding a Manager role (403 Forbidden)', async () => {
    // Manager creates a quotation requiring approval
    const mgrQuote = await prisma.quotation.create({
      data: {
        quoteNumber: `QT-MGR-SELF-${Date.now()}`,
        userId: managerUser.id, // Manager created it
        customerTier: 'GOLD',
        status: 'DRAFT',
        totalAmount: 1000,
        lines: {
          create: [{ productId: productHardware.id, quantity: 1, unitPrice: 1000, discount: 40, totalPrice: 600 }]
        }
      }
    });

    const submitRes = await request(app)
      .post('/approvals/submit')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ quotationId: mgrQuote.id });

    const reqId = submitRes.body.approvalRequestId;

    // Manager attempts to approve their own quote
    const selfApproveRes = await request(app)
      .post(`/approvals/${reqId}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ reason: 'Self approval' });

    expect(selfApproveRes.status).toBe(403);
    expect(selfApproveRes.body.error).toContain('Self-approval is prohibited');
  });

  // --------------------------------------------------------------------------
  // Test 7: Sales Manager approves quotation created by Sales Rep
  // --------------------------------------------------------------------------
  it('7. Sales Manager opens manager approval and approves quotation successfully', async () => {
    const { quotation, approvalRequestId } = await createPendingQuote(repUser.id, 18);

    const approveRes = await request(app)
      .post(`/approvals/${approvalRequestId}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ reason: 'Approved by Sales Manager' });

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.status).toBe('APPROVED');

    const updatedQuote = await prisma.quotation.findUnique({ where: { id: quotation.id } });
    expect(updatedQuote?.status).toBe('APPROVED');
  });

  // --------------------------------------------------------------------------
  // Test 8: Sales Manager rejects quotation
  // --------------------------------------------------------------------------
  it('8. Sales Manager rejects quotation and quotation status becomes REJECTED', async () => {
    const { quotation, approvalRequestId } = await createPendingQuote(repUser.id, 40);

    const rejectRes = await request(app)
      .post(`/approvals/${approvalRequestId}/reject`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ reason: 'Discount exceeds margin policy limits' });

    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.status).toBe('REJECTED');

    const updatedQuote = await prisma.quotation.findUnique({ where: { id: quotation.id } });
    expect(updatedQuote?.status).toBe('REJECTED');
  });

  // --------------------------------------------------------------------------
  // Test 9: Sales Manager returns for revision → Sales Rep edits and resubmits
  // --------------------------------------------------------------------------
  it('9. Sales Manager returns quotation for revision; Sales Rep can edit lines and resubmit', async () => {
    const { quotation, approvalRequestId } = await createPendingQuote(repUser.id, 40);

    // Manager returns for revision
    const revRes = await request(app)
      .post(`/approvals/${approvalRequestId}/return-revision`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ reason: 'Please reduce discount to 15%' });

    expect(revRes.status).toBe(200);
    expect(revRes.body.status).toBe('RETURNED_FOR_REVISION');

    let updatedQuote = await prisma.quotation.findUnique({ where: { id: quotation.id } });
    expect(updatedQuote?.status).toBe('RETURNED_FOR_REVISION');

    // Sales Rep edits lines to 15% discount
    const editRes = await request(app)
      .patch(`/quotations/${quotation.id}/lines`)
      .set('Authorization', `Bearer ${repToken}`)
      .send({
        lines: [{ productId: productHardware.id, quantity: 1, discountPercent: 15 }]
      });

    expect(editRes.status).toBe(200);

    // Sales Rep resubmits
    const resubmitRes = await request(app)
      .post('/approvals/submit')
      .set('Authorization', `Bearer ${repToken}`)
      .send({ quotationId: quotation.id });

    expect(resubmitRes.status).toBe(200);
    expect(resubmitRes.body.requiresApproval).toBe(false); // 15% discount matches GOLD ceiling!
  });

  // --------------------------------------------------------------------------
  // Test 10: Multi-step routing (MANAGER -> FINANCE -> APPROVED)
  // --------------------------------------------------------------------------
  it('10. Multi-step approval chain routes to Finance after Sales Manager approval', async () => {
    // Create quote with Services 40% discount (ceiling 5%) -> triggers MANAGER_THEN_FINANCE approval chain
    const q = await prisma.quotation.create({
      data: {
        quoteNumber: `QT-MULTI-${Date.now()}`,
        userId: repUser.id,
        customerTier: 'GOLD',
        status: 'DRAFT',
        totalAmount: 1000,
        lines: {
          create: [{ productId: productService.id, quantity: 1, unitPrice: 1000, discount: 40, totalPrice: 600 }]
        }
      }
    });

    const submitRes = await request(app)
      .post('/approvals/submit')
      .set('Authorization', `Bearer ${repToken}`)
      .send({ quotationId: q.id });

    expect(submitRes.body.requiresApproval).toBe(true);
    const reqId = submitRes.body.approvalRequestId;

    // Step 1: Manager approves -> advances step to FINANCE
    const mgrApproveRes = await request(app)
      .post(`/approvals/${reqId}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ reason: 'Manager approves high service discount' });

    expect(mgrApproveRes.status).toBe(200);
    expect(mgrApproveRes.body.currentStep).toBe('FINANCE');
    expect(mgrApproveRes.body.status).toBe('PENDING');

    // Step 2: Finance approves -> completes approval
    const finApproveRes = await request(app)
      .post(`/approvals/${reqId}/approve`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ reason: 'Finance verified gross margin' });

    expect(finApproveRes.status).toBe(200);
    expect(finApproveRes.body.status).toBe('APPROVED');
    expect(finApproveRes.body.currentStep).toBe('COMPLETED');

    const finalQuote = await prisma.quotation.findUnique({ where: { id: q.id } });
    expect(finalQuote?.status).toBe('APPROVED');
  });

  // --------------------------------------------------------------------------
  // Test 11: Customer cannot access internal approval endpoints
  // --------------------------------------------------------------------------
  it('11. Customer token calling internal approval action endpoint receives 403 Forbidden', async () => {
    const { approvalRequestId } = await createPendingQuote(repUser.id, 30);

    const custRes = await request(app)
      .post(`/approvals/${approvalRequestId}/approve`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ reason: 'Customer approve attempt' });

    expect(custRes.status).toBe(403);
    expect(custRes.body.error).toContain('Forbidden');
  });

  // --------------------------------------------------------------------------
  // Test 12: Payload manipulation by unauthorized user fails backend auth
  // --------------------------------------------------------------------------
  it('12. Client payload manipulating role/approval status is rejected by backend (403 Forbidden)', async () => {
    const { approvalRequestId } = await createPendingQuote(repUser.id, 30);

    const spoofRes = await request(app)
      .post(`/approvals/${approvalRequestId}/action`)
      .set('Authorization', `Bearer ${repToken}`)
      .send({ action: 'APPROVED', role: 'SALES_MANAGER', approved: true, allowed_discount: 100 });

    expect(spoofRes.status).toBe(403);
    expect(spoofRes.body.error).toContain('Forbidden');
  });

  // --------------------------------------------------------------------------
  // Test 13 & 14: Already-approved or already-rejected requests return 409 Conflict
  // --------------------------------------------------------------------------
  it('13 & 14. Action on already-approved or already-rejected request returns 409 Conflict', async () => {
    const { approvalRequestId } = await createPendingQuote(repUser.id, 20);

    // Manager approves
    await request(app)
      .post(`/approvals/${approvalRequestId}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ reason: 'Initial approval' });

    // Attempt second approve
    const doubleApproveRes = await request(app)
      .post(`/approvals/${approvalRequestId}/approve`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ reason: 'Second approval' });

    expect(doubleApproveRes.status).toBe(409);
    expect(doubleApproveRes.body.error).toContain('Cannot process action');
  });

  // --------------------------------------------------------------------------
  // Test 15: Wrong approval level acting out of sequence returns 403 Forbidden
  // --------------------------------------------------------------------------
  it('15. Finance user attempting action when step is MANAGER receives 403 Forbidden', async () => {
    const { approvalRequestId } = await createPendingQuote(repUser.id, 30); // currentStep is MANAGER

    const finEarlyRes = await request(app)
      .post(`/approvals/${approvalRequestId}/approve`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ reason: 'Finance acting too early' });

    expect(finEarlyRes.status).toBe(403);
    expect(finEarlyRes.body.error).toContain("Only users with role 'MANAGER'");
  });
});
