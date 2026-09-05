// sales_rep_discount_governance.test.ts
import request from 'supertest';
import app from './src/index';
import { prisma } from './shared/prisma';
import { discountsService } from './discounts/discounts.service';
import { AuthService } from './auth/auth.service';

describe('Sales Representative Dynamic Customer & Category Discount Governance Audit', () => {
  let repToken: string;
  let managerToken: string;
  let adminToken: string;
  let sampleProductId: string;
  let secondProductId: string;

  beforeAll(async () => {
    await AuthService.ensureDemoUsers();
    await discountsService.ensureDiscountConfigsSeeded();

    // Login users to acquire tokens
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

    // Ensure sample product exists
    let sampleProd = await prisma.product.findFirst({ where: { category: 'Hardware' } });
    if (!sampleProd) {
      sampleProd = await prisma.product.create({
        data: {
          name: 'Enterprise Server X1',
          sku: 'HW-SRV-X1',
          category: 'Hardware',
          basePrice: 1000.0
        }
      });
    }
    sampleProductId = sampleProd.id;

    // Seed test customer users in User table
    for (const [id, name, email] of [
      ['CUST-A', 'Customer A', 'cust-a@test.com'],
      ['CUST-B', 'Customer B', 'cust-b@test.com'],
      ['CUST-C', 'Customer C', 'cust-c@test.com']
    ]) {
      await prisma.user.upsert({
        where: { id },
        update: { name, role: 'CUSTOMER' },
        create: { id, email, passwordHash: 'test-hash', name, role: 'CUSTOMER' }
      });
    }

    // Seed test customer limits
    await discountsService.setCustomerDiscountLimit({
      customerId: 'CUST-A',
      customerName: 'Customer A',
      maxDiscountPercent: 10.0
    });

    await discountsService.setCustomerDiscountLimit({
      customerId: 'CUST-B',
      customerName: 'Customer B',
      maxDiscountPercent: 15.0
    });

    await discountsService.setCustomerDiscountLimit({
      customerId: 'CUST-C',
      customerName: 'Customer C',
      maxDiscountPercent: 20.0
    });
  });

  // TEST 1: Customer limit = 10%, Requested = 5% -> Expected: No approval
  it('TEST 1: Customer limit = 10%, Requested = 5% -> No approval required', async () => {
    const res = await discountsService.calculateRisk({
      customerId: 'CUST-A',
      lines: [{ category: 'Hardware', discountPercent: 5.0, lineTotal: 1000 }]
    });

    expect(res.requiresApproval).toBe(false);
    expect(res.blendedRiskScore).toBe(0);
  });

  // TEST 2: Customer limit = 10%, Requested = 10% -> Expected: No approval
  it('TEST 2: Customer limit = 10%, Requested = 10% -> No approval required', async () => {
    const res = await discountsService.calculateRisk({
      customerId: 'CUST-A',
      lines: [{ category: 'Hardware', discountPercent: 10.0, lineTotal: 1000 }]
    });

    expect(res.requiresApproval).toBe(false);
    expect(res.blendedRiskScore).toBe(0);
  });

  // TEST 3: Customer limit = 10%, Requested = 11% -> Expected: Approval required
  it('TEST 3: Customer limit = 10%, Requested = 11% -> Approval required', async () => {
    const res = await discountsService.calculateRisk({
      customerId: 'CUST-A',
      lines: [{ category: 'Hardware', discountPercent: 11.0, lineTotal: 1000 }]
    });

    expect(res.requiresApproval).toBe(true);
    expect(res.blendedRiskScore).toBeGreaterThan(0);
    expect(res.requiredApprovalChain).toBe('MANAGER');
  });

  // TEST 4: Customer limit = 15%, Requested = 15% -> Expected: No approval
  it('TEST 4: Customer limit = 15%, Requested = 15% -> No approval required', async () => {
    const res = await discountsService.calculateRisk({
      customerId: 'CUST-B',
      lines: [{ category: 'Hardware', discountPercent: 15.0, lineTotal: 1000 }]
    });

    expect(res.requiresApproval).toBe(false);
    expect(res.blendedRiskScore).toBe(0);
  });

  // TEST 5: Customer limit = 15%, Requested = 20% -> Expected: Approval required
  it('TEST 5: Customer limit = 15%, Requested = 20% -> Approval required', async () => {
    const res = await discountsService.calculateRisk({
      customerId: 'CUST-B',
      lines: [{ category: 'Hardware', discountPercent: 20.0, lineTotal: 1000 }]
    });

    expect(res.requiresApproval).toBe(true);
    expect(res.blendedRiskScore).toBeGreaterThan(0);
  });

  // TEST 6: Customer limit = 20%, Requested = 18% -> Expected: No approval
  it('TEST 6: Customer limit = 20%, Requested = 18% -> No approval required', async () => {
    const res = await discountsService.calculateRisk({
      customerId: 'CUST-C',
      lines: [{ category: 'Subscriptions', discountPercent: 18.0, lineTotal: 1000 }]
    });

    expect(res.requiresApproval).toBe(false);
    expect(res.blendedRiskScore).toBe(0);
  });

  // TEST 7: Customer limit = 20%, Requested = 25% -> Expected: Approval required
  it('TEST 7: Customer limit = 20%, Requested = 25% -> Approval required', async () => {
    const res = await discountsService.calculateRisk({
      customerId: 'CUST-C',
      lines: [{ category: 'Hardware', discountPercent: 25.0, lineTotal: 1000 }]
    });

    expect(res.requiresApproval).toBe(true);
    expect(res.blendedRiskScore).toBeGreaterThan(0);
  });

  // TEST 8: Multiple quotation lines with only one violating discount
  it('TEST 8: Multiple quotation lines with only one violating discount -> Approval required', async () => {
    const res = await discountsService.calculateRisk({
      customerId: 'CUST-B', // Limit = 15%
      lines: [
        { category: 'Hardware', discountPercent: 10.0, lineTotal: 1000 },
        { category: 'Services', discountPercent: 18.0, lineTotal: 500 } // Exceeds 15%
      ]
    });

    expect(res.requiresApproval).toBe(true);
    expect(res.flaggedLines.length).toBe(1);
    expect(res.flaggedLines[0].discountPercent).toBe(18.0);
  });

  // TEST 9: Customer negotiation increases discount beyond limit -> Re-approval required
  it('TEST 9: Customer negotiation increases discount beyond limit -> Re-approval required', async () => {
    // Create quotation
    const createRes = await request(app)
      .post('/quotations')
      .set('Authorization', `Bearer ${repToken}`)
      .send({ customerId: 'CUST-A', customerName: 'Customer A' });
    const qId = createRes.body.id;

    // Add line with 10% discount (Within CUST-A 10% limit)
    await request(app)
      .patch(`/quotations/${qId}/lines`)
      .set('Authorization', `Bearer ${repToken}`)
      .send({ lines: [{ productId: sampleProductId, quantity: 1, discountPercent: 10 }] });

    // Submit -> Auto-approved
    const submitRes = await request(app)
      .post('/approvals/submit')
      .set('Authorization', `Bearer ${repToken}`)
      .send({ quotationId: qId, customerId: 'CUST-A' });

    expect(submitRes.body.requiresApproval).toBe(false);

    // Reopen for negotiation with 15% counter-offer (exceeds 10% limit)
    const reopenRes = await request(app)
      .post(`/approvals/${qId}/reopen`)
      .set('Authorization', `Bearer ${repToken}`)
      .send({ discountProposal: 15 });

    expect(reopenRes.body.requiresApproval).toBe(true);
    expect(reopenRes.body.currentStep).toBe('MANAGER');
  });

  // TEST 10: Sales Rep attempts to manually bypass approval through API
  it('TEST 10: Sales Rep attempts to manually bypass approval through API -> Backend forces recalculation', async () => {

    const createRes = await request(app)
      .post('/quotations')
      .set('Authorization', `Bearer ${repToken}`)
      .send({ customerId: 'CUST-A', customerName: 'Customer A' });
    const qId = createRes.body.id;

    // Add line with 25% discount (exceeds CUST-A 10% limit)
    await request(app)
      .patch(`/quotations/${qId}/lines`)
      .set('Authorization', `Bearer ${repToken}`)
      .send({ lines: [{ productId: sampleProductId, quantity: 1, discountPercent: 25 }] });

    // Attempt to pass malicious client flags (e.g. approved=true, requires_approval=false)
    const submitRes = await request(app)
      .post('/approvals/submit')
      .set('Authorization', `Bearer ${repToken}`)
      .send({
        quotationId: qId,
        approved: true,
        requires_approval: false,
        risk_score: 0
      });

    // Backend MUST calculate risk itself and require approval
    expect(submitRes.body.requiresApproval).toBe(true);
    expect(submitRes.body.currentStep).toBe('MANAGER');
  });

  // TEST 11: Sales Rep submits same quotation twice -> No duplicate active approval requests
  it('TEST 11: Sales Rep submits same quotation twice -> No duplicate active approval requests', async () => {
    const createRes = await request(app)
      .post('/quotations')
      .set('Authorization', `Bearer ${repToken}`)
      .send({ customerId: 'CUST-A', customerName: 'Customer A' });
    const qId = createRes.body.id;

    await request(app)
      .patch(`/quotations/${qId}/lines`)
      .set('Authorization', `Bearer ${repToken}`)
      .send({ lines: [{ productId: sampleProductId, quantity: 1, discountPercent: 20 }] });

    // First submission
    await request(app)
      .post('/approvals/submit')
      .set('Authorization', `Bearer ${repToken}`)
      .send({ quotationId: qId, customerId: 'CUST-A' });

    // Second submission of same quotation
    await request(app)
      .post('/approvals/submit')
      .set('Authorization', `Bearer ${repToken}`)
      .send({ quotationId: qId, customerId: 'CUST-A' });

    // Verify only ONE active pending approval request exists in DB for this quotation
    const pendingCount = await prisma.approvalRequest.count({
      where: { quotationId: qId, status: 'PENDING' }
    });

    expect(pendingCount).toBe(1);
  });

  // TEST 12: Admin changes customer limit -> New quotations use updated limit
  it('TEST 12: Admin changes customer limit -> New quotations use updated limit immediately', async () => {
    // Admin changes Customer A limit from 10% to 20%
    await request(app)
      .post('/discounts/customer-limits')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ customerId: 'CUST-A', customerName: 'Customer A', maxDiscountPercent: 20.0 });

    // 15% discount for Customer A was previously a violation, now allowed under 20%
    const res = await discountsService.calculateRisk({
      customerId: 'CUST-A',
      lines: [{ category: 'Hardware', discountPercent: 15.0, lineTotal: 1000 }]
    });

    expect(res.requiresApproval).toBe(false);
    expect(res.blendedRiskScore).toBe(0);
  });
});
