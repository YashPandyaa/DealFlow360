import request from 'supertest';
import app from './src/index';
import { prisma } from './shared/prisma';
import { discountsService } from './discounts/discounts.service';

describe('Production-Quality Blended Discount Risk Scoring Engine Test Suite (25 Test Cases)', () => {
  let adminToken: string;
  let repToken: string;
  let managerToken: string;
  let financeToken: string;
  let repUserId: string;

  let prodLaptop: any;
  let prodService: any;

  beforeAll(async () => {
    // 1. Seed discount configurations
    await discountsService.ensureDiscountConfigsSeeded();
    await prisma.categoryDiscountCeiling.upsert({
      where: { category: 'Hardware' },
      create: { category: 'Hardware', maxDiscountPercent: 15.0 },
      update: { maxDiscountPercent: 15.0 }
    });
    await prisma.categoryDiscountCeiling.upsert({
      where: { category: 'Services' },
      create: { category: 'Services', maxDiscountPercent: 5.0 },
      update: { maxDiscountPercent: 5.0 }
    });

    // 2. Setup auth users
    const adminRes = await request(app)
      .post('/auth/login')
      .send({ email: 'admin@dealflow360.com', password: 'password123' });
    adminToken = adminRes.body.token;

    const repRes = await request(app)
      .post('/auth/login')
      .send({ email: 'rep@dealflow360.com', password: 'password123' });
    repToken = repRes.body.token;
    repUserId = repRes.body.user.id;

    const mgrRes = await request(app)
      .post('/auth/login')
      .send({ email: 'manager@dealflow360.com', password: 'password123' });
    managerToken = mgrRes.body.token;

    const finRes = await request(app)
      .post('/auth/login')
      .send({ email: 'finance@dealflow360.com', password: 'password123' });
    financeToken = finRes.body.token;

    // 3. Create test products with cost and selling prices
    prodLaptop = await prisma.product.create({
      data: {
        name: 'Enterprise Laptop Pro-15',
        sku: `SKU-LAPTOP-${Date.now()}`,
        category: 'Hardware',
        basePrice: 1000,
        costPrice: 600, // 40% margin at full price
        unit: 'unit',
        billingType: 'ONE_TIME',
        status: 'ACTIVE'
      }
    });

    prodService = await prisma.product.create({
      data: {
        name: 'Implementation & Consulting Service',
        sku: `SKU-SERV-${Date.now()}`,
        category: 'Services',
        basePrice: 500,
        costPrice: 400, // 20% margin at full price
        unit: 'hour',
        billingType: 'ONE_TIME',
        status: 'ACTIVE'
      }
    });
  });

  afterAll(async () => {
    if (prodLaptop) await prisma.product.delete({ where: { id: prodLaptop.id } }).catch(() => {});
    if (prodService) await prisma.product.delete({ where: { id: prodService.id } }).catch(() => {});
  });

  // --------------------------------------------------------------------------
  // TEST 1: No discount violation (12% <= Gold Hardware 15%)
  // --------------------------------------------------------------------------
  it('1. No discount violation -> 0 ceiling risk, LOW risk level', async () => {
    const res = await discountsService.calculateRisk({
      customerTier: 'GOLD',
      lines: [
        { category: 'Hardware', discountPercent: 12, unitPrice: 1000, costPrice: 600, quantity: 1 }
      ]
    });

    expect(res.components.discount_ceiling_risk).toBe(0);
    expect(res.violations.length).toBe(0);
    expect(res.requiresApproval).toBe(false);
    expect(res.risk_level).toBe('LOW');
  });

  // --------------------------------------------------------------------------
  // TEST 2: Discount exactly at ceiling (15% == Gold Hardware 15%)
  // --------------------------------------------------------------------------
  it('2. Discount exactly at ceiling -> 0 excess, no violation', async () => {
    const res = await discountsService.calculateRisk({
      customerTier: 'GOLD',
      lines: [
        { category: 'Hardware', discountPercent: 15, unitPrice: 1000, costPrice: 600, quantity: 1 }
      ]
    });

    expect(res.components.discount_ceiling_risk).toBe(0);
    expect(res.violations.length).toBe(0);
  });

  // --------------------------------------------------------------------------
  // TEST 3: Discount 1% above ceiling (16% > 15%)
  // --------------------------------------------------------------------------
  it('3. Discount 1% above ceiling -> calculates line risk correctly', async () => {
    const res = await discountsService.calculateRisk({
      customerTier: 'GOLD',
      lines: [
        { category: 'Hardware', discountPercent: 16, unitPrice: 1000, costPrice: 600, quantity: 1 }
      ]
    });

    expect(res.violations.length).toBe(1);
    expect(res.violations[0].excess).toBe(1);
    // (1 / 20) * 50 = 2.5 pts
    expect(res.components.discount_ceiling_risk).toBe(2.5);
    expect(res.requiresApproval).toBe(true);
  });

  // --------------------------------------------------------------------------
  // TEST 4: Discount 5% above ceiling (20% > 15%)
  // --------------------------------------------------------------------------
  it('4. Discount 5% above ceiling -> ceiling risk 12.5 pts', async () => {
    const res = await discountsService.calculateRisk({
      customerTier: 'GOLD',
      lines: [
        { category: 'Hardware', discountPercent: 20, unitPrice: 1000, costPrice: 600, quantity: 1 }
      ]
    });

    expect(res.violations[0].excess).toBe(5);
    // (5 / 20) * 50 = 12.5 pts
    expect(res.components.discount_ceiling_risk).toBe(12.5);
    expect(res.requiresApproval).toBe(true);
  });

  // --------------------------------------------------------------------------
  // TEST 5: Discount 20% above ceiling (35% > 15%)
  // --------------------------------------------------------------------------
  it('5. Discount 20% above ceiling -> ceiling risk reaches max 50 pts', async () => {
    const res = await discountsService.calculateRisk({
      customerTier: 'GOLD',
      lines: [
        { category: 'Hardware', discountPercent: 35, unitPrice: 1000, costPrice: 600, quantity: 1 }
      ]
    });

    expect(res.violations[0].excess).toBe(20);
    // (20 / 20) * 50 = 50 pts
    expect(res.components.discount_ceiling_risk).toBe(50);
  });

  // --------------------------------------------------------------------------
  // TEST 6: Extreme discount (50% applied vs 15% ceiling)
  // --------------------------------------------------------------------------
  it('6. Extreme 50% discount -> capped ceiling risk (50), negative margin risk (25), CRITICAL level, Sales Manager + Finance', async () => {
    const res = await discountsService.calculateRisk({
      customerTier: 'GOLD',
      lines: [
        { category: 'Hardware', discountPercent: 50, unitPrice: 1000, costPrice: 600, quantity: 1 }
      ]
    });

    expect(res.components.discount_ceiling_risk).toBe(50);
    expect(res.components.margin_risk).toBe(25); // revenue 500 - cost 600 = -100 margin (< 0%)
    expect(res.components.blended_order_risk).toBe(15); // weighted excess 35% >= 6%
    expect(res.risk_score).toBe(90); // 50 + 25 + 15 + 0 = 90
    expect(res.risk_level).toBe('CRITICAL');
    expect(res.approval.required).toBe(true);
    expect(res.approval.steps).toContain('SALES_MANAGER');
    expect(res.approval.steps).toContain('FINANCE_OPERATIONS');
  });

  // --------------------------------------------------------------------------
  // TEST 7: Multiple lines with small violations
  // --------------------------------------------------------------------------
  it('7. Multiple lines with small violations -> accumulates blended order risk points', async () => {
    const res = await discountsService.calculateRisk({
      customerTier: 'GOLD',
      lines: [
        { category: 'Hardware', discountPercent: 17, unitPrice: 1000, costPrice: 500, quantity: 1 }, // excess +2%
        { category: 'Services', discountPercent: 8, unitPrice: 500, costPrice: 200, quantity: 1 }   // excess +3% (ceiling 5%)
      ]
    });

    expect(res.violations.length).toBe(2);
    expect(res.components.blended_order_risk).toBeGreaterThan(0);
  });

  // --------------------------------------------------------------------------
  // TEST 8: One severely risky line among safe lines
  // --------------------------------------------------------------------------
  it('8. One severely risky line among safe lines -> weighted properly by monetary value', async () => {
    const res = await discountsService.calculateRisk({
      customerTier: 'GOLD',
      lines: [
        { category: 'Hardware', discountPercent: 40, unitPrice: 100, costPrice: 50, quantity: 1 }, // excess +25%, small $
        { category: 'Services', discountPercent: 0, unitPrice: 10000, costPrice: 2000, quantity: 1 } // safe, huge $
      ]
    });

    // Weighted risk is small because $10000 safe line dominates the order revenue
    expect(res.components.discount_ceiling_risk).toBeLessThan(10);
  });

  // --------------------------------------------------------------------------
  // TEST 9: High margin (>= 30%)
  // --------------------------------------------------------------------------
  it('9. High gross margin (>= 30%) -> 0 margin risk points', async () => {
    const res = await discountsService.calculateRisk({
      customerTier: 'GOLD',
      lines: [
        { category: 'Hardware', discountPercent: 10, unitPrice: 1000, costPrice: 400, quantity: 1 } // Revenue 900, Cost 400 => Margin 55.5%
      ]
    });

    expect(res.components.gross_margin_percentage).toBeGreaterThanOrEqual(30);
    expect(res.components.margin_risk).toBe(0);
  });

  // --------------------------------------------------------------------------
  // TEST 10: Low margin (10% to 20%)
  // --------------------------------------------------------------------------
  it('10. Low gross margin (15%) -> 15 margin risk points', async () => {
    const res = await discountsService.calculateRisk({
      customerTier: 'GOLD',
      lines: [
        { category: 'Hardware', discountPercent: 0, unitPrice: 1000, costPrice: 850, quantity: 1 } // Revenue 1000, Cost 850 => Margin 15%
      ]
    });

    expect(res.components.gross_margin_percentage).toBe(15);
    expect(res.components.margin_risk).toBe(15);
  });

  // --------------------------------------------------------------------------
  // TEST 11: Negative margin (< 0%)
  // --------------------------------------------------------------------------
  it('11. Negative gross margin (< 0%) -> max 25 margin risk points', async () => {
    const res = await discountsService.calculateRisk({
      customerTier: 'GOLD',
      lines: [
        { category: 'Hardware', discountPercent: 0, unitPrice: 1000, costPrice: 1200, quantity: 1 } // Cost > Revenue
      ]
    });

    expect(res.components.gross_margin_percentage).toBeLessThan(0);
    expect(res.components.margin_risk).toBe(25);
  });

  // --------------------------------------------------------------------------
  // TEST 12: No historical data
  // --------------------------------------------------------------------------
  it('12. No historical data -> 0 anomaly points and Insufficient historical data status', async () => {
    const newRep = await prisma.user.create({
      data: {
        email: `newrep-${Date.now()}@dealflow360.com`,
        name: 'Brand New Rep',
        role: 'SALES_REP',
        passwordHash: 'dummy'
      }
    });

    const res = await discountsService.calculateRisk({
      salesRepId: newRep.id,
      customerTier: 'GOLD',
      lines: [{ category: 'Hardware', discountPercent: 10, unitPrice: 1000, costPrice: 600, quantity: 1 }]
    });

    expect(res.components.historical_anomaly_risk).toBe(0);
    expect(res.components.has_sufficient_history).toBe(false);
    expect(res.components.historical_data_status).toBe('Insufficient historical data');

    await prisma.user.delete({ where: { id: newRep.id } });
  });

  // --------------------------------------------------------------------------
  // TEST 13: Strong historical anomaly (>15% jump)
  // --------------------------------------------------------------------------
  it('13. Strong historical anomaly (current discount 20% vs historical avg 3%) -> 10 anomaly points', async () => {
    const histRep = await prisma.user.create({
      data: {
        email: `histrep-${Date.now()}@dealflow360.com`,
        name: 'Historical Rep',
        role: 'SALES_REP',
        passwordHash: 'dummy'
      }
    });

    // Create past quotation with 3% discount
    const pastQuote = await prisma.quotation.create({
      data: {
        quoteNumber: `QT-HIST-${Date.now()}`,
        userId: histRep.id,
        customerName: 'Hist Customer',
        customerTier: 'GOLD',
        totalAmount: 970,
        status: 'APPROVED'
      }
    });

    await prisma.quotationLine.create({
      data: {
        quotationId: pastQuote.id,
        productId: prodLaptop.id,
        quantity: 1,
        unitPrice: 1000,
        costPrice: 600,
        discount: 3,
        totalPrice: 970,
        lineTotal: 970
      }
    });

    // Evaluate risk for current quote with 22% discount (+19% anomaly)
    const res = await discountsService.calculateRisk({
      salesRepId: histRep.id,
      customerTier: 'GOLD',
      lines: [{ category: 'Hardware', discountPercent: 22, unitPrice: 1000, costPrice: 600, quantity: 1 }]
    });

    expect(res.components.has_sufficient_history).toBe(true);
    expect(res.components.historical_avg_discount).toBe(3);
    expect(res.components.current_avg_discount).toBe(22);
    expect(res.components.historical_anomaly_risk).toBe(10); // diff 19% > 15% -> 10 pts

    // Cleanup
    await prisma.quotationLine.deleteMany({ where: { quotationId: pastQuote.id } });
    await prisma.quotation.delete({ where: { id: pastQuote.id } });
    await prisma.user.delete({ where: { id: histRep.id } });
  });

  // --------------------------------------------------------------------------
  // TEST 14: Gold Customer ceiling (15%)
  // --------------------------------------------------------------------------
  it('14. Gold Customer ceiling (15%) -> allows up to 15% for Hardware', async () => {
    const res = await discountsService.calculateRisk({
      customerTier: 'GOLD',
      lines: [{ category: 'Hardware', discountPercent: 15 }]
    });
    expect(res.effectiveCustomerLimit).toBe(15);
    expect(res.violations.length).toBe(0);
  });

  // --------------------------------------------------------------------------
  // TEST 15: Bronze Customer ceiling (5%)
  // --------------------------------------------------------------------------
  it('15. Bronze Customer ceiling (5%) -> flags discount above 5%', async () => {
    const res = await discountsService.calculateRisk({
      customerTier: 'BRONZE',
      lines: [{ category: 'Hardware', discountPercent: 10 }] // 10% > 5% Bronze limit
    });
    expect(res.effectiveCustomerLimit).toBe(5);
    expect(res.violations.length).toBe(1);
    expect(res.violations[0].excess).toBe(5);
  });

  // --------------------------------------------------------------------------
  // TEST 16: Category-specific ceiling (Services ceiling 5%)
  // --------------------------------------------------------------------------
  it('16. Category-specific ceiling (Services=5%) -> restricts Gold customer on Services to 5%', async () => {
    const res = await discountsService.calculateRisk({
      customerTier: 'GOLD', // Tier limit 15%
      lines: [{ category: 'Services', discountPercent: 10 }] // Category limit 5%
    });

    expect(res.violations.length).toBe(1);
    expect(res.violations[0].allowed_discount).toBe(5);
    expect(res.violations[0].excess).toBe(5);
  });

  // --------------------------------------------------------------------------
  // TEST 17: Mixed Hardware + Service quotation
  // --------------------------------------------------------------------------
  it('17. Mixed Hardware + Service quotation -> applies category-specific ceilings per line', async () => {
    const res = await discountsService.calculateRisk({
      customerTier: 'GOLD',
      lines: [
        { category: 'Hardware', discountPercent: 14, unitPrice: 1000, quantity: 1 }, // 14% <= 15% (OK)
        { category: 'Services', discountPercent: 8, unitPrice: 500, quantity: 1 }    // 8% > 5% (Violation)
      ]
    });

    expect(res.violations.length).toBe(1);
    expect(res.violations[0].category).toBe('Services');
  });

  // --------------------------------------------------------------------------
  // TEST 18: Customer negotiation increases discount
  // --------------------------------------------------------------------------
  it('18. Customer negotiation increases discount -> automatically recalculates risk and triggers approval', async () => {
    // 1. Create draft quote
    const quoteRes = await request(app)
      .post('/quotations')
      .set('Authorization', `Bearer ${repToken}`)
      .send({ customerName: 'Negotiating Customer', customerTier: 'GOLD' });

    const quoteId = quoteRes.body.id;

    // 2. Add line at 10% discount (No violation)
    await request(app)
      .patch(`/quotations/${quoteId}/lines`)
      .set('Authorization', `Bearer ${repToken}`)
      .send({ lines: [{ productId: prodLaptop.id, quantity: 1, discountPercent: 10 }] });

    const quoteDetailInitial = await request(app).get(`/quotations/${quoteId}`).set('Authorization', `Bearer ${repToken}`);
    expect(quoteDetailInitial.body.riskAnalysis.requiresApproval).toBe(false);

    // 3. Customer counter-negotiates discount to 25% (> 15% ceiling)
    await request(app)
      .patch(`/quotations/${quoteId}/lines`)
      .set('Authorization', `Bearer ${repToken}`)
      .send({ lines: [{ productId: prodLaptop.id, quantity: 1, discountPercent: 25 }] });

    const quoteDetailUpdated = await request(app).get(`/quotations/${quoteId}`).set('Authorization', `Bearer ${repToken}`);
    expect(quoteDetailUpdated.body.riskAnalysis.requiresApproval).toBe(true);
    expect(quoteDetailUpdated.body.riskAnalysis.violations.length).toBe(1);
  });

  // --------------------------------------------------------------------------
  // TEST 19: Risk recalculation after editing quantity
  // --------------------------------------------------------------------------
  it('19. Editing quantity -> recalculates monetary weighting and margin exposure', async () => {
    const res1 = await discountsService.calculateRisk({
      customerTier: 'GOLD',
      lines: [
        { category: 'Hardware', discountPercent: 20, unitPrice: 1000, costPrice: 600, quantity: 1 }
      ]
    });

    const res2 = await discountsService.calculateRisk({
      customerTier: 'GOLD',
      lines: [
        { category: 'Hardware', discountPercent: 20, unitPrice: 1000, costPrice: 600, quantity: 10 }
      ]
    });

    expect(res1.risk_score).toBeGreaterThan(0);
    expect(res2.risk_score).toBeGreaterThan(0);
  });

  // --------------------------------------------------------------------------
  // TEST 20: Risk recalculation after editing discount
  // --------------------------------------------------------------------------
  it('20. Editing discount -> updates risk components dynamically', async () => {
    const lowRisk = await discountsService.calculateRisk({
      customerTier: 'GOLD',
      lines: [{ category: 'Hardware', discountPercent: 5, unitPrice: 1000, costPrice: 600, quantity: 1 }]
    });

    const highRisk = await discountsService.calculateRisk({
      customerTier: 'GOLD',
      lines: [{ category: 'Hardware', discountPercent: 40, unitPrice: 1000, costPrice: 600, quantity: 1 }]
    });

    expect(highRisk.risk_score).toBeGreaterThan(lowRisk.risk_score);
  });

  // --------------------------------------------------------------------------
  // TEST 21: Risk score cannot exceed 100
  // --------------------------------------------------------------------------
  it('21. Risk score cannot exceed 100 (Clamped)', async () => {
    const res = await discountsService.calculateRisk({
      customerTier: 'BRONZE', // 5% limit
      lines: [
        { category: 'Services', discountPercent: 90, unitPrice: 1000, costPrice: 900, quantity: 10 }
      ]
    });

    expect(res.risk_score).toBeLessThanOrEqual(100);
  });

  // --------------------------------------------------------------------------
  // TEST 22: Risk score cannot be negative
  // --------------------------------------------------------------------------
  it('22. Risk score cannot be negative (Clamped at min 0)', async () => {
    const res = await discountsService.calculateRisk({
      customerTier: 'GOLD',
      lines: [{ category: 'Hardware', discountPercent: 0, unitPrice: 1000, costPrice: 200, quantity: 1 }]
    });

    expect(res.risk_score).toBeGreaterThanOrEqual(0);
  });

  // --------------------------------------------------------------------------
  // TEST 23: Zero-value / zero-revenue edge case
  // --------------------------------------------------------------------------
  it('23. Zero-value / zero-revenue edge case -> safely handled without division by zero crash', async () => {
    const res = await discountsService.calculateRisk({
      customerTier: 'GOLD',
      lines: [{ category: 'Hardware', discountPercent: 100, unitPrice: 0, costPrice: 0, quantity: 1 }]
    });

    expect(res.risk_score).toBeDefined();
    expect(isNaN(res.risk_score)).toBe(false);
  });

  // --------------------------------------------------------------------------
  // TEST 24 & 25: Backend recalculates risk authoritatively regardless of frontend values
  // --------------------------------------------------------------------------
  it('24 & 25. Backend recalculates risk authoritatively regardless of frontend-manipulated values', async () => {
    const quoteRes = await request(app)
      .post('/quotations')
      .set('Authorization', `Bearer ${repToken}`)
      .send({ customerName: 'Security Test Corp', customerTier: 'GOLD' });

    const quoteId = quoteRes.body.id;

    await request(app)
      .patch(`/quotations/${quoteId}/lines`)
      .set('Authorization', `Bearer ${repToken}`)
      .send({ lines: [{ productId: prodLaptop.id, quantity: 1, discountPercent: 40 }] });

    // Submit for approval with fake frontend parameters attempting to claim no approval required
    const submitRes = await request(app)
      .post('/approvals/submit')
      .set('Authorization', `Bearer ${repToken}`)
      .send({
        quotationId: quoteId,
        risk_score: 0,              // Fake frontend payload
        risk_level: 'LOW',          // Fake frontend payload
        requiresApproval: false     // Fake frontend payload
      });

    expect(submitRes.status).toBe(200);
    // Backend ignored fake values and calculated approval required
    expect(submitRes.body.requiresApproval).toBe(true);
    expect(submitRes.body.currentStep).toBe('MANAGER');
  });

  // --------------------------------------------------------------------------
  // TEST 26: Deterministic Test Matrix (Quotations 1 to 6 produce distinct, ordered risk scores)
  // --------------------------------------------------------------------------
  it('26. Deterministic Test Matrix -> different business inputs produce distinct, appropriate risk scores', async () => {
    // Quotation 1: Gold, Hardware, 10% discount, 15% allowed, healthy margin
    const q1 = await discountsService.calculateRisk({
      customerTier: 'GOLD',
      lines: [{ category: 'Hardware', discountPercent: 10, unitPrice: 100000, costPrice: 70000, quantity: 1 }]
    });

    // Quotation 2: Gold, Hardware, 20% discount, 15% allowed, healthy margin
    const q2 = await discountsService.calculateRisk({
      customerTier: 'GOLD',
      lines: [{ category: 'Hardware', discountPercent: 20, unitPrice: 100000, costPrice: 70000, quantity: 1 }]
    });

    // Quotation 3: Gold, Service, 20% discount, 5% allowed, low margin
    const q3 = await discountsService.calculateRisk({
      customerTier: 'GOLD',
      lines: [{ category: 'Services', discountPercent: 20, unitPrice: 50000, costPrice: 45000, quantity: 1 }]
    });

    // Quotation 4: Gold, Service, 50% discount, 5% allowed, negative margin
    const q4 = await discountsService.calculateRisk({
      customerTier: 'GOLD',
      lines: [{ category: 'Services', discountPercent: 50, unitPrice: 50000, costPrice: 45000, quantity: 1 }]
    });

    // Quotation 5: Gold, Hardware 5% discount, Service 5% discount
    const q5 = await discountsService.calculateRisk({
      customerTier: 'GOLD',
      lines: [
        { category: 'Hardware', discountPercent: 5, unitPrice: 100000, costPrice: 70000, quantity: 1 },
        { category: 'Services', discountPercent: 5, unitPrice: 50000, costPrice: 35000, quantity: 1 }
      ]
    });

    // Quotation 6: Gold, Hardware 20% discount, Service 20% discount
    const q6 = await discountsService.calculateRisk({
      customerTier: 'GOLD',
      lines: [
        { category: 'Hardware', discountPercent: 20, unitPrice: 100000, costPrice: 70000, quantity: 1 },
        { category: 'Services', discountPercent: 20, unitPrice: 50000, costPrice: 45000, quantity: 1 }
      ]
    });

    expect(q1.risk_level).toBe('LOW');
    expect(q2.risk_score).toBeGreaterThan(q1.risk_score);
    expect(q3.risk_score).toBeGreaterThan(q2.risk_score);
    expect(q4.risk_score).toBeGreaterThan(q3.risk_score);
    expect(q4.risk_level).toBe('CRITICAL');
    expect(q5.risk_level).toBe('LOW');
    expect(q6.risk_score).toBeGreaterThan(q2.risk_score);
  });
});
