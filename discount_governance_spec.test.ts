// discount_governance_spec.test.ts
import request from 'supertest';
import app from './src/index';
import { prisma } from './shared/prisma';
import { discountsService } from './discounts/discounts.service';
import { AuthService } from './auth/auth.service';

describe('DealFlow360 Discount Governance Specification Audit Suite (14 Tests)', () => {
  let repToken: string;
  let adminToken: string;
  let sampleProductId: string;

  beforeAll(async () => {
    await AuthService.ensureDemoUsers();
    await discountsService.ensureDiscountConfigsSeeded();

    // Login rep and admin users
    const repRes = await request(app)
      .post('/auth/login')
      .send({ email: 'rep.alice@dealflow360.com', password: 'password123' });
    repToken = repRes.body.token;

    const adminRes = await request(app)
      .post('/auth/login')
      .send({ email: 'admin@dealflow360.com', password: 'password123' });
    adminToken = adminRes.body.token;

    // Reset discount configuration tables to standard specification defaults
    await prisma.discountTier.deleteMany();
    await prisma.discountTier.createMany({
      data: [
        { customerTier: 'BRONZE', maxDiscountPercent: 5.0 },
        { customerTier: 'SILVER', maxDiscountPercent: 10.0 },
        { customerTier: 'GOLD', maxDiscountPercent: 15.0 }
      ]
    });

    await prisma.categoryDiscountCeiling.deleteMany();
    await prisma.categoryDiscountCeiling.createMany({
      data: [
        { category: 'Hardware', maxDiscountPercent: 15.0 },
        { category: 'Software', maxDiscountPercent: 10.0 },
        { category: 'Services', maxDiscountPercent: 5.0 },
        { category: 'Service', maxDiscountPercent: 5.0 },
        { category: 'Subscriptions', maxDiscountPercent: 20.0 }
      ]
    });

    // Ensure sample product exists
    let prod = await prisma.product.findFirst({ where: { category: 'Hardware' } });
    if (!prod) {
      prod = await prisma.product.create({
        data: {
          name: 'Hardware Server Spec',
          sku: 'HW-SPEC-01',
          category: 'Hardware',
          basePrice: 1000.0
        }
      });
    }
    sampleProductId = prod.id;
  });

  // TEST 1: Bronze + Hardware + 5% -> No violation
  it('TEST 1: Bronze + Hardware + 5% -> No violation', async () => {
    const res = await discountsService.calculateRisk({
      customerTier: 'BRONZE',
      lines: [{ category: 'Hardware', discountPercent: 5.0, lineTotal: 1000 }]
    });

    expect(res.requiresApproval).toBe(false);
    expect(res.blendedRiskScore).toBe(0);
    expect(res.flaggedLines).toHaveLength(0);
  });

  // TEST 2: Bronze + Hardware + 6% -> Approval required
  it('TEST 2: Bronze + Hardware + 6% -> Approval required', async () => {
    const res = await discountsService.calculateRisk({
      customerTier: 'BRONZE',
      lines: [{ category: 'Hardware', discountPercent: 6.0, lineTotal: 1000 }]
    });

    expect(res.requiresApproval).toBe(true);
    expect(res.blendedRiskScore).toBeGreaterThan(0);
    expect(res.requiredApprovalChain).toBe('MANAGER');
  });

  // TEST 3: Silver + Software + 10% -> No violation
  it('TEST 3: Silver + Software + 10% -> No violation', async () => {
    const res = await discountsService.calculateRisk({
      customerTier: 'SILVER',
      lines: [{ category: 'Software', discountPercent: 10.0, lineTotal: 1000 }]
    });

    expect(res.requiresApproval).toBe(false);
    expect(res.blendedRiskScore).toBe(0);
  });

  // TEST 4: Silver + Software + 11% -> Approval required
  it('TEST 4: Silver + Software + 11% -> Approval required', async () => {
    const res = await discountsService.calculateRisk({
      customerTier: 'SILVER',
      lines: [{ category: 'Software', discountPercent: 11.0, lineTotal: 1000 }]
    });

    expect(res.requiresApproval).toBe(true);
    expect(res.blendedRiskScore).toBeGreaterThan(0);
  });

  // TEST 5: Gold + Hardware + 15% -> No violation
  it('TEST 5: Gold + Hardware + 15% -> No violation', async () => {
    const res = await discountsService.calculateRisk({
      customerTier: 'GOLD',
      lines: [{ category: 'Hardware', discountPercent: 15.0, lineTotal: 1000 }]
    });

    expect(res.requiresApproval).toBe(false);
    expect(res.blendedRiskScore).toBe(0);
  });

  // TEST 6: Gold + Hardware + 16% -> Approval required
  it('TEST 6: Gold + Hardware + 16% -> Approval required', async () => {
    const res = await discountsService.calculateRisk({
      customerTier: 'GOLD',
      lines: [{ category: 'Hardware', discountPercent: 16.0, lineTotal: 1000 }]
    });

    expect(res.requiresApproval).toBe(true);
    expect(res.blendedRiskScore).toBeGreaterThan(0);
  });

  // TEST 7: Gold + Services + 5% -> No violation
  it('TEST 7: Gold + Services + 5% -> No violation', async () => {
    const res = await discountsService.calculateRisk({
      customerTier: 'GOLD',
      lines: [{ category: 'Services', discountPercent: 5.0, lineTotal: 1000 }]
    });

    expect(res.requiresApproval).toBe(false);
    expect(res.blendedRiskScore).toBe(0);
  });

  // TEST 8: Gold + Services + 8% -> Approval required
  it('TEST 8: Gold + Services + 8% -> Approval required', async () => {
    const res = await discountsService.calculateRisk({
      customerTier: 'GOLD',
      lines: [{ category: 'Services', discountPercent: 8.0, lineTotal: 1000 }]
    });

    expect(res.requiresApproval).toBe(true);
    expect(res.flaggedLines).toHaveLength(1);
    expect(res.flaggedLines[0].category).toBe('Services');
    expect(res.flaggedLines[0].allowedLimit).toBe(5.0);
    expect(res.flaggedLines[0].overage).toBe(3.0);
  });

  // TEST 9: Mixed quotation (Hardware 12%, Software 8%, Services 8%) -> Services violation -> Blended risk -> Manager approval required
  it('TEST 9: Mixed quotation -> Services violation -> Blended risk calculation', async () => {
    const res = await discountsService.calculateRisk({
      customerTier: 'GOLD',
      lines: [
        { category: 'Hardware', discountPercent: 12.0, lineTotal: 500 },
        { category: 'Software', discountPercent: 8.0, lineTotal: 300 },
        { category: 'Services', discountPercent: 8.0, lineTotal: 200 } // Exceeds Services 5% ceiling
      ]
    });

    expect(res.requiresApproval).toBe(true);
    expect(res.flaggedLines).toHaveLength(1);
    expect(res.flaggedLines[0].category).toBe('Services');
    expect(res.flaggedLines[0].allowedLimit).toBe(5.0);
    // blendedScore = (0 * 0.5) + (0 * 0.3) + (3 * (200 / 1000)) = 0.6
    expect(res.blendedRiskScore).toBe(0.6);
    expect(res.requiredApprovalChain).toBe('MANAGER');
  });

  // TEST 10: Change customer tier -> Applicable limits update immediately
  it('TEST 10: Change customer tier -> Applicable limits update immediately', async () => {

    const bronzeRes = await discountsService.calculateRisk({
      customerTier: 'BRONZE',
      lines: [{ category: 'Hardware', discountPercent: 10.0, lineTotal: 1000 }]
    });
    expect(bronzeRes.requiresApproval).toBe(true);

    const goldRes = await discountsService.calculateRisk({
      customerTier: 'GOLD',
      lines: [{ category: 'Hardware', discountPercent: 10.0, lineTotal: 1000 }]
    });
    expect(goldRes.requiresApproval).toBe(false);
  });

  // TEST 11: Change product category -> Applicable limits update immediately
  it('TEST 11: Change product category -> Applicable limits update immediately', async () => {

    const hardwareRes = await discountsService.calculateRisk({
      customerTier: 'GOLD',
      lines: [{ category: 'Hardware', discountPercent: 12.0, lineTotal: 1000 }]
    });
    expect(hardwareRes.requiresApproval).toBe(false); // 12% <= 15%

    const servicesRes = await discountsService.calculateRisk({
      customerTier: 'GOLD',
      lines: [{ category: 'Services', discountPercent: 12.0, lineTotal: 1000 }]
    });
    expect(servicesRes.requiresApproval).toBe(true); // 12% > 5%
  });

  // TEST 12: Customer negotiation exceeds limit -> Re-approval required
  it('TEST 12: Customer negotiation exceeds limit -> Re-approval required', async () => {
    const createRes = await request(app)
      .post('/quotations')
      .set('Authorization', `Bearer ${repToken}`)
      .send({ customerName: 'ACME Corp', customerTier: 'BRONZE' });
    const qId = createRes.body.id;

    await request(app)
      .patch(`/quotations/${qId}/lines`)
      .set('Authorization', `Bearer ${repToken}`)
      .send({ lines: [{ productId: sampleProductId, quantity: 1, discountPercent: 5 }] });

    const submitRes = await request(app)
      .post('/approvals/submit')
      .set('Authorization', `Bearer ${repToken}`)
      .send({ quotationId: qId, customerTier: 'BRONZE' });

    expect(submitRes.body.requiresApproval).toBe(false);

    // Customer counter-offer for discount at 8% (Exceeds BRONZE 5% limit)
    const reopenRes = await request(app)
      .post(`/approvals/${qId}/reopen`)
      .set('Authorization', `Bearer ${repToken}`)
      .send({ discountProposal: 8 });

    expect(reopenRes.body.requiresApproval).toBe(true);
    expect(reopenRes.body.currentStep).toBe('MANAGER');
  });

  // TEST 13: Client sends fake allowed_discount -> Backend ignores and recalculates
  it('TEST 13: Client sends fake allowed_discount -> Backend ignores payload claims', async () => {
    const createRes = await request(app)
      .post('/quotations')
      .set('Authorization', `Bearer ${repToken}`)
      .send({ customerName: 'Test Corp', customerTier: 'BRONZE' });
    const qId = createRes.body.id;

    await request(app)
      .patch(`/quotations/${qId}/lines`)
      .set('Authorization', `Bearer ${repToken}`)
      .send({ lines: [{ productId: sampleProductId, quantity: 1, discountPercent: 12 }] });

    const submitRes = await request(app)
      .post('/approvals/submit')
      .set('Authorization', `Bearer ${repToken}`)
      .send({
        quotationId: qId,
        customerTier: 'BRONZE',
        allowed_discount: 20.0 // Malicious client claim
      });

    expect(submitRes.body.requiresApproval).toBe(true);
  });

  // TEST 14: Client sends requires_approval=false -> Backend recalculates and prevents bypass
  it('TEST 14: Client sends requires_approval=false -> Backend forces approval flow', async () => {
    const createRes = await request(app)
      .post('/quotations')
      .set('Authorization', `Bearer ${repToken}`)
      .send({ customerName: 'Security Corp', customerTier: 'BRONZE' });
    const qId = createRes.body.id;

    await request(app)
      .patch(`/quotations/${qId}/lines`)
      .set('Authorization', `Bearer ${repToken}`)
      .send({ lines: [{ productId: sampleProductId, quantity: 1, discountPercent: 15 }] });

    const submitRes = await request(app)
      .post('/approvals/submit')
      .set('Authorization', `Bearer ${repToken}`)
      .send({
        quotationId: qId,
        customerTier: 'BRONZE',
        requires_approval: false,
        approved: true
      });

    expect(submitRes.body.requiresApproval).toBe(true);
    expect(submitRes.body.currentStep).toBe('MANAGER');
  });
});
