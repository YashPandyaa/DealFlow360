// reports/reports.test.ts
import request from 'supertest';
import app from '../src/index';
import { prisma } from '../shared/prisma';

describe('Reporting & Deal Health Module Integration Tests', () => {
  let repA: any;
  let repB: any;
  let hardwareProduct: any;
  let softwareProduct: any;

  let quoteStalled: any;
  let quoteFresh: any;
  let quoteSlipped: any;

  beforeAll(async () => {
    // Clean up test database
    await prisma.auditLog.deleteMany();
    await prisma.quotationLine.deleteMany();
    await prisma.quotation.deleteMany();
    await prisma.product.deleteMany();
    await prisma.user.deleteMany();

    // 1. Create Users (Reps)
    // Rep A: Has only 1 deal (tests the history floor edge case)
    repA = await prisma.user.create({
      data: {
        email: 'repa_reports@dealflow.com',
        name: 'Rep Alice',
        role: 'REP',
        teamId: 'TEAM-ALPHA'
      }
    });

    // Rep B: Has 4 deals (qualifies for anomaly detection)
    repB = await prisma.user.create({
      data: {
        email: 'repb_reports@dealflow.com',
        name: 'Rep Bob',
        role: 'REP',
        teamId: 'TEAM-BETA'
      }
    });

    // 2. Create Products in different categories
    hardwareProduct = await prisma.product.create({
      data: {
        sku: 'RPT-HARDWARE-01',
        name: 'Enterprise Server Node',
        category: 'Hardware',
        basePrice: 2000.0,
        marginPercent: 25.0
      }
    });

    softwareProduct = await prisma.product.create({
      data: {
        sku: 'RPT-SOFTWARE-01',
        name: 'DealFlow Platform SaaS',
        category: 'Software',
        basePrice: 500.0,
        marginPercent: 80.0
      }
    });

    // 3. Setup Quotations for Rep A (Single Deal with High Discount = 40%)
    await prisma.quotation.create({
      data: {
        quoteNumber: 'QT-REP-A-01',
        userId: repA.id,
        customerName: 'Customer One',
        status: 'DRAFT',
        totalAmount: 1200.0,
        lines: {
          create: [
            {
              productId: hardwareProduct.id,
              quantity: 1,
              unitPrice: 2000.0,
              discount: 40.0,
              totalPrice: 1200.0
            }
          ]
        }
      }
    });

    // 4. Setup Quotations for Rep B (3 Historical baseline deals with ~10% discount + 1 Anomalous deal with 30% discount)
    // Baseline 1 (10% discount)
    await prisma.quotation.create({
      data: {
        quoteNumber: 'QT-REP-B-BASE-01',
        userId: repB.id,
        customerName: 'Beta Corp 1',
        status: 'ACCEPTED',
        totalAmount: 1800.0,
        lines: {
          create: [
            {
              productId: hardwareProduct.id,
              quantity: 1,
              unitPrice: 2000.0,
              discount: 10.0,
              totalPrice: 1800.0
            }
          ]
        }
      }
    });

    // Baseline 2 (8% discount)
    await prisma.quotation.create({
      data: {
        quoteNumber: 'QT-REP-B-BASE-02',
        userId: repB.id,
        customerName: 'Beta Corp 2',
        status: 'ACCEPTED',
        totalAmount: 1840.0,
        lines: {
          create: [
            {
              productId: hardwareProduct.id,
              quantity: 1,
              unitPrice: 2000.0,
              discount: 8.0,
              totalPrice: 1840.0
            }
          ]
        }
      }
    });

    // Baseline 3 (12% discount)
    await prisma.quotation.create({
      data: {
        quoteNumber: 'QT-REP-B-BASE-03',
        userId: repB.id,
        customerName: 'Beta Corp 3',
        status: 'ACCEPTED',
        totalAmount: 1760.0,
        lines: {
          create: [
            {
              productId: hardwareProduct.id,
              quantity: 1,
              unitPrice: 2000.0,
              discount: 12.0,
              totalPrice: 1760.0
            }
          ]
        }
      }
    });

    // Deal 4: Anomalous Deal (30% discount on $2000 hardware -> significantly above 10% avg * 1.5 = 15%)
    await prisma.quotation.create({
      data: {
        quoteNumber: 'QT-REP-B-ANOMALY-04',
        userId: repB.id,
        customerName: 'Anomaly Customer',
        status: 'SUBMITTED',
        totalAmount: 1400.0,
        lines: {
          create: [
            {
              productId: hardwareProduct.id,
              quantity: 1,
              unitPrice: 2000.0,
              discount: 30.0,
              totalPrice: 1400.0
            }
          ]
        }
      }
    });

    // 5. Setup Stalled Deal (updated 10 days ago, status DRAFT)
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

    // Rep C: for fresh and delivery-slipped test deals
    const repC = await prisma.user.create({
      data: {
        email: 'repc_reports@dealflow.com',
        name: 'Rep Charlie',
        role: 'REP',
        teamId: 'TEAM-ALPHA'
      }
    });

    quoteStalled = await prisma.quotation.create({
      data: {
        quoteNumber: 'QT-STALLED-99',
        userId: repB.id,
        customerName: 'Stalled Prospect Inc',
        status: 'DRAFT',
        totalAmount: 5000.0,
        updatedAt: tenDaysAgo,
        createdAt: tenDaysAgo
      }
    });

    // 6. Setup Fresh Deal (updated right now)
    quoteFresh = await prisma.quotation.create({
      data: {
        quoteNumber: 'QT-FRESH-01',
        userId: repC.id,
        customerName: 'Fresh Client',
        status: 'DRAFT',
        totalAmount: 1000.0
      }
    });

    // 7. Setup Delivery Slipped Deal (target delivery date was 4 days ago, not yet fulfilled)
    const fourDaysAgo = new Date();
    fourDaysAgo.setDate(fourDaysAgo.getDate() - 4);

    quoteSlipped = await prisma.quotation.create({
      data: {
        quoteNumber: 'QT-SLIPPED-01',
        userId: repC.id,
        customerName: 'Delayed Delivery Corp',
        status: 'ACCEPTED',
        totalAmount: 3500.0,
        targetDeliveryDate: fourDaysAgo
      }
    });
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany();
    await prisma.quotationLine.deleteMany();
    await prisma.quotation.deleteMany();
    await prisma.product.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
  });

  // ==========================================================================
  // SECTION 1: GET /reports/quotations (Filtered & Paginated)
  // ==========================================================================
  describe('GET /reports/quotations', () => {
    it('should return paginated list of all quotations when no filters are passed', async () => {
      const res = await request(app).get('/reports/quotations');

      expect(res.status).toBe(200);
      expect(res.body.quotations).toBeDefined();
      expect(Array.isArray(res.body.quotations)).toBe(true);
      expect(res.body.totalCount).toBeGreaterThanOrEqual(7);
      expect(res.body.page).toBe(1);
      expect(res.body.limit).toBe(20);
    });

    it('should filter quotations by salesRepId', async () => {
      const res = await request(app).get(`/reports/quotations?salesRepId=${repA.id}`);

      expect(res.status).toBe(200);
      expect(res.body.quotations.length).toBeGreaterThan(0);
      for (const q of res.body.quotations) {
        expect(q.userId).toBe(repA.id);
      }
    });

    it('should filter quotations by teamId', async () => {
      const res = await request(app).get('/reports/quotations?teamId=TEAM-ALPHA');

      expect(res.status).toBe(200);
      expect(res.body.quotations.length).toBeGreaterThan(0);
      for (const q of res.body.quotations) {
        expect(q.salesRep.teamId).toBe('TEAM-ALPHA');
      }
    });

    it('should filter quotations by approvalStatus / status', async () => {
      const res = await request(app).get('/reports/quotations?status=ACCEPTED');

      expect(res.status).toBe(200);
      expect(res.body.quotations.length).toBeGreaterThan(0);
      for (const q of res.body.quotations) {
        expect(q.status).toBe('ACCEPTED');
      }
    });

    it('should filter quotations by product category', async () => {
      const res = await request(app).get('/reports/quotations?category=Hardware');

      expect(res.status).toBe(200);
      expect(res.body.quotations.length).toBeGreaterThan(0);
      for (const q of res.body.quotations) {
        const hasHardware = q.lines.some((l: any) => l.category === 'Hardware');
        expect(hasHardware).toBe(true);
      }
    });

    it('should combine multiple filters with AND logic', async () => {
      const res = await request(app).get(`/reports/quotations?salesRepId=${repB.id}&status=ACCEPTED&category=Hardware`);

      expect(res.status).toBe(200);
      expect(res.body.quotations.length).toBe(3); // 3 baseline deals
      for (const q of res.body.quotations) {
        expect(q.userId).toBe(repB.id);
        expect(q.status).toBe('ACCEPTED');
      }
    });

    it('EDGE CASE: Non-matching filter should return empty array without error', async () => {
      const res = await request(app).get('/reports/quotations?status=NON_EXISTENT_STATUS');

      expect(res.status).toBe(200);
      expect(res.body.quotations).toEqual([]);
      expect(res.body.totalCount).toBe(0);
    });
  });

  // ==========================================================================
  // SECTION 2: GET /reports/export (PDF / XLSX / CSV)
  // ==========================================================================
  describe('GET /reports/export', () => {
    it('should export quotations as PDF format', async () => {
      const res = await request(app).get('/reports/export?format=pdf');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.headers['content-disposition']).toContain('attachment; filename="quotations-report.pdf"');
      expect(res.body).toBeDefined();
    });

    it('should export quotations as XLSX format', async () => {
      const res = await request(app).get('/reports/export?format=xlsx');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('spreadsheetml.sheet');
      expect(res.headers['content-disposition']).toContain('attachment; filename="quotations-report.xlsx"');
      expect(res.body).toBeDefined();
    });

    it('should export quotations as CSV format', async () => {
      const res = await request(app).get('/reports/export?format=csv');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('attachment; filename="quotations-report.csv"');
      expect(res.text).toContain('Quote Number,Customer Name,Sales Rep,Status');
    });

    it('EDGE CASE: Export with empty filtered result generates valid empty file without error', async () => {
      const res = await request(app).get('/reports/export?status=NON_EXISTING&format=xlsx');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('spreadsheetml.sheet');
      expect(res.body).toBeDefined();
    });
  });

  // ==========================================================================
  // SECTION 3: GET /reports/deal-health (Deal Health Analytics)
  // ==========================================================================
  describe('GET /reports/deal-health', () => {
    it('Stalled Deals: detects quotations inactive for > stalledDays (default 5 days)', async () => {
      const res = await request(app).get('/reports/deal-health?stalledDays=5');

      expect(res.status).toBe(200);
      expect(res.body.stalledDeals).toBeDefined();
      expect(Array.isArray(res.body.stalledDeals)).toBe(true);

      // QT-STALLED-99 was updated 10 days ago -> must be included
      const stalled = res.body.stalledDeals.find((d: any) => d.quoteNumber === 'QT-STALLED-99');
      expect(stalled).toBeDefined();
      expect(stalled.daysInactive).toBeGreaterThanOrEqual(9);
      expect(stalled.customerName).toBe('Stalled Prospect Inc');

      // QT-FRESH-01 is fresh -> must NOT be in stalledDeals
      const fresh = res.body.stalledDeals.find((d: any) => d.quoteNumber === 'QT-FRESH-01');
      expect(fresh).toBeUndefined();
    });

    it('Discount Anomalies & Floor Rule: Flags rep with >= 3 deals whose discount is > 1.5x avg, skips rep with < 3 deals', async () => {
      const res = await request(app).get('/reports/deal-health?discountAnomalyMultiplier=1.5&minHistoryFloor=3');

      expect(res.status).toBe(200);
      expect(res.body.discountAnomalies).toBeDefined();

      // Rep B has 4 deals with avg ~15%, Deal 4 has 30% discount (> 1.5x avg) -> MUST be flagged
      const anomalyB = res.body.discountAnomalies.find((d: any) => d.quoteNumber === 'QT-REP-B-ANOMALY-04');
      expect(anomalyB).toBeDefined();
      expect(anomalyB.salesRepName).toBe('Rep Bob');
      expect(anomalyB.discountPercent).toBe(30.0);
      expect(anomalyB.anomalyRatio).toBeGreaterThanOrEqual(1.5);

      // CRITICAL EDGE CASE: Rep A has only 1 deal with 40% discount, but rep has < 3 deals -> MUST NOT BE FLAGGED
      const anomalyA = res.body.discountAnomalies.find((d: any) => d.quoteNumber === 'QT-REP-A-01');
      expect(anomalyA).toBeUndefined();
    });

    it('Delivery Slippage: detects orders where target delivery date has passed without fulfillment', async () => {
      const res = await request(app).get('/reports/deal-health');

      expect(res.status).toBe(200);
      expect(res.body.deliverySlippage).toBeDefined();

      // QT-SLIPPED-01 target delivery date was 4 days ago -> must be in deliverySlippage
      const slipped = res.body.deliverySlippage.find((d: any) => d.quoteNumber === 'QT-SLIPPED-01');
      expect(slipped).toBeDefined();
      expect(slipped.daysSlipped).toBeGreaterThanOrEqual(3);
      expect(slipped.customerName).toBe('Delayed Delivery Corp');
    });
  });

  // ==========================================================================
  // SECTION 4: POST /reports/deal-health/:quotationId/nudge
  // ==========================================================================
  describe('POST /reports/deal-health/:quotationId/nudge', () => {
    it('should trigger nudge escalation and record an AuditLog entry', async () => {
      const res = await request(app)
        .post(`/reports/deal-health/${quoteStalled.id}/nudge`)
        .send({
          message: 'Please follow up on this stalled enterprise deal',
          escalationType: 'MANAGER_ESCALATION',
          targetRole: 'MANAGER'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.actionId).toBeDefined();
      expect(res.body.quotationId).toBe(quoteStalled.id);
      expect(res.body.message).toContain('QT-STALLED-99');

      // Verify AuditLog record in database
      const log = await prisma.auditLog.findUnique({
        where: { id: res.body.actionId }
      });
      expect(log).toBeDefined();
      expect(log!.action).toBe('NUDGE_ESCALATION');
      expect(log!.entity).toBe('Quotation');
      expect(log!.entityId).toBe(quoteStalled.id);
    });

    it('should return 404 for non-existent quotation nudge', async () => {
      const res = await request(app)
        .post('/reports/deal-health/non-existent-id/nudge')
        .send({ message: 'Nudge' });

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('not found');
    });
  });
});
