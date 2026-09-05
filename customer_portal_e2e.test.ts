// customer_portal_e2e.test.ts
import request from 'supertest';
import app from './src/index';
import { prisma } from './shared/prisma';
import { AuthService } from './auth/auth.service';
import { productsService } from './products/products.service';

describe('Customer Portal End-to-End & Security Suite', () => {
  let customerAToken: string;
  let customerAId: string;
  let customerBToken: string;
  let customerBId: string;
  let managerToken: string;
  let quotationAId: string;
  let quotationBId: string;

  beforeAll(async () => {
    // 1. Seed demo users and products
    await AuthService.ensureDemoUsers();
    await productsService.ensureProductsSeeded();

    const passwordHash = await require('bcryptjs').hash('password123', 10);

    // Upsert Customer A
    const customerA = await prisma.user.upsert({
      where: { email: 'customera@acme.com' },
      update: { passwordHash, role: 'CUSTOMER', isPortalUser: true },
      create: {
        email: 'customera@acme.com',
        name: 'Customer A Acme',
        passwordHash,
        role: 'CUSTOMER',
        isPortalUser: true
      }
    });

    // Upsert Customer B
    const customerB = await prisma.user.upsert({
      where: { email: 'customerb@globex.com' },
      update: { passwordHash, role: 'CUSTOMER', isPortalUser: true },
      create: {
        email: 'customerb@globex.com',
        name: 'Customer B Globex',
        passwordHash,
        role: 'CUSTOMER',
        isPortalUser: true
      }
    });

    // Upsert Sales Manager
    const manager = await prisma.user.upsert({
      where: { email: 'manager@dealflow360.com' },
      update: { passwordHash, role: 'MANAGER' },
      create: {
        email: 'manager@dealflow360.com',
        name: 'Sales Manager',
        passwordHash,
        role: 'MANAGER'
      }
    });

    customerAId = customerA.id;
    customerBId = customerB.id;

    // Login users to acquire tokens
    const loginA = await request(app).post('/auth/login').send({ email: customerA!.email, password: 'password123' });
    customerAToken = loginA.body.token;

    const loginB = await request(app).post('/auth/login').send({ email: customerB!.email, password: 'password123' });
    customerBToken = loginB.body.token;

    const loginMgr = await request(app).post('/auth/login').send({ email: manager!.email, password: 'password123' });
    managerToken = loginMgr.body.token;

    // 3. Create Quotation A for Customer A
    const quoteA = await prisma.quotation.create({
      data: {
        quoteNumber: `QT-TEST-A-${Date.now()}`,
        userId: customerAId,
        customerId: customerAId,
        customerName: 'Customer A Acme',
        customerTier: 'GOLD',
        status: 'DRAFT',
        totalAmount: 1000.0,
        lines: {
          create: [
            {
              productId: (await prisma.product.findFirst())!.id,
              quantity: 10,
              unitPrice: 100.0,
              discount: 10.0,
              totalPrice: 900.0
            }
          ]
        }
      }
    });
    quotationAId = quoteA.id;

    // 4. Create Quotation B for Customer B
    const quoteB = await prisma.quotation.create({
      data: {
        quoteNumber: `QT-TEST-B-${Date.now()}`,
        userId: customerBId,
        customerId: customerBId,
        customerName: 'Customer B Globex',
        customerTier: 'GOLD',
        status: 'DRAFT',
        totalAmount: 2000.0,
        lines: {
          create: [
            {
              productId: (await prisma.product.findFirst())!.id,
              quantity: 20,
              unitPrice: 100.0,
              discount: 10.0,
              totalPrice: 1800.0
            }
          ]
        }
      }
    });
    quotationBId = quoteB.id;
  });

  // ==========================================================================
  // PART 31: END-TO-END CUSTOMER BARGAINING, APPROVAL & CONFIRMATION FLOW
  // ==========================================================================
  test('PART 31: Complete Customer B End-to-End Bargaining & Confirmation Flow', async () => {
    // Step 1: Customer B gets their quotations list
    const resQuotes = await request(app)
      .get('/quotations')
      .set('Authorization', `Bearer ${customerBToken}`);
    expect(resQuotes.status).toBe(200);
    expect(Array.isArray(resQuotes.body)).toBe(true);

    // Step 2: Customer B adds a comment to Quotation B line item
    const resComment = await request(app)
      .post(`/quotations/${quotationBId}/comments`)
      .set('Authorization', `Bearer ${customerBToken}`)
      .send({ comment: 'Can you provide a better discount?' });
    expect(resComment.status).toBe(201);
    expect(resComment.body.comment).toBe('Can you provide a better discount?');

    // Step 3: Gold Customer B requests 20% discount (allowed is 15%)
    const resReopen = await request(app)
      .post(`/approvals/${quotationBId}/reopen`)
      .set('Authorization', `Bearer ${customerBToken}`)
      .send({ customerTier: 'GOLD', discountProposal: 20 });

    expect(resReopen.status).toBe(200);
    expect(resReopen.body.requiresApproval).toBe(true);
    expect(resReopen.body.currentStep).toBe('MANAGER');

    // Verify status became PENDING_APPROVAL and NOT automatically approved
    const quoteAfterReq = await prisma.quotation.findUnique({ where: { id: quotationBId } });
    expect(quoteAfterReq!.status).toBe('PENDING_APPROVAL');

    // Step 4: Sales Manager approves the quotation
    const appReq = await prisma.approvalRequest.findFirst({
      where: { quotationId: quotationBId },
      orderBy: { createdAt: 'desc' }
    });

    const resApprove = await request(app)
      .post(`/approvals/${appReq!.id}/action`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ action: 'APPROVED', reason: 'Approved 20% discount for Gold customer' });
    expect(resApprove.status).toBe(200);

    const quoteAfterApprove = await prisma.quotation.findUnique({ where: { id: quotationBId } });
    expect(['APPROVED', 'READY_FOR_FULFILLMENT']).toContain(quoteAfterApprove!.status);

    // Step 5: Customer B confirms the quotation
    const resConfirm = await request(app)
      .post(`/quotations/${quotationBId}/confirm`)
      .set('Authorization', `Bearer ${customerBToken}`);
    expect(resConfirm.status).toBe(200);
    expect(resConfirm.body.status).toBe('CONFIRMED');

    // Step 6: Customer B views order tracking
    const resOrders = await request(app)
      .get('/warehouses/orders')
      .set('Authorization', `Bearer ${customerBToken}`);
    expect(resOrders.status).toBe(200);
    const matchedOrder = resOrders.body.find((o: any) => o.id === quotationBId);
    expect(matchedOrder).toBeDefined();
    expect(matchedOrder.fulfillmentStatus).toBeDefined();
  });

  // ==========================================================================
  // PART 32: CUSTOMER DATA ISOLATION & IDOR SECURITY TEST
  // ==========================================================================
  test('PART 32: Customer A cannot access or mutate Customer B quotation', async () => {
    // 1. GET Customer B's quote as Customer A -> 403 Forbidden
    const resGet = await request(app)
      .get(`/quotations/${quotationBId}`)
      .set('Authorization', `Bearer ${customerAToken}`);
    expect(resGet.status).toBe(403);

    // 2. Post comment on Customer B's quote as Customer A -> 403 Forbidden
    const resComment = await request(app)
      .post(`/quotations/${quotationBId}/comments`)
      .set('Authorization', `Bearer ${customerAToken}`)
      .send({ comment: 'Malicious comment' });
    expect(resComment.status).toBe(403);

    // 3. Trigger reopen on Customer B's quote as Customer A -> 403 Forbidden
    const resReopen = await request(app)
      .post(`/approvals/${quotationBId}/reopen`)
      .set('Authorization', `Bearer ${customerAToken}`)
      .send({ discountProposal: 50 });
    expect(resReopen.status).toBe(403);

    // 4. Confirm Customer B's quote as Customer A -> 403 Forbidden
    const resConfirm = await request(app)
      .post(`/quotations/${quotationBId}/confirm`)
      .set('Authorization', `Bearer ${customerAToken}`);
    expect(resConfirm.status).toBe(403);
  });
});
