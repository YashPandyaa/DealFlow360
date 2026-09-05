// auth/auth.test.ts
import request from 'supertest';
import app from '../src/index';
import { prisma } from '../shared/prisma';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dealflow360-super-secret-key';

describe('Auth Module Integration Tests', () => {
  const testEmails = ['manager@dealflow.com', 'customer@acme.com', 'hacker@dealflow.com', 'testuser@dealflow.com'];

  beforeAll(async () => {
    // Clean up test database before running tests
    await prisma.portalMagicLink.deleteMany();
    await prisma.user.deleteMany({ where: { email: { in: testEmails } } });
  });

  afterAll(async () => {
    await prisma.portalMagicLink.deleteMany();
    await prisma.user.deleteMany({ where: { email: { in: testEmails } } });
    await prisma.$disconnect();
  });

  describe('POST /auth/signup', () => {
    it('should successfully sign up a valid internal user and return 201 without password', async () => {
      const res = await request(app).post('/auth/signup').send({
        email: 'manager@dealflow.com',
        password: 'securePassword123',
        name: 'Manager User',
        role: 'MANAGER'
      });

      expect(res.status).toBe(201);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe('manager@dealflow.com');
      expect(res.body.user.role).toBe('MANAGER');
      expect(res.body.token).toBeDefined();

      // Password fields must NEVER be returned
      expect(res.body.user.password).toBeUndefined();
      expect(res.body.user.passwordHash).toBeUndefined();
    });

    it('should reject invalid role values with 400', async () => {
      const res = await request(app).post('/auth/signup').send({
        email: 'hacker@dealflow.com',
        password: 'securePassword123',
        role: 'SUPERADMIN_HACKER'
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid role specified');
    });

    it('should reject duplicate signup attempts with clean 409', async () => {
      const res = await request(app).post('/auth/signup').send({
        email: 'manager@dealflow.com',
        password: 'anotherPassword123',
        role: 'MANAGER'
      });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('Email already in use');
    });
  });

  describe('POST /auth/login', () => {
    it('should authenticate valid user and return 200 with JWT', async () => {
      const res = await request(app).post('/auth/login').send({
        email: 'manager@dealflow.com',
        password: 'securePassword123'
      });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.email).toBe('manager@dealflow.com');
      expect(res.body.user.password).toBeUndefined();
      expect(res.body.user.passwordHash).toBeUndefined();
    });

    it('should return 401 with generic message for wrong password', async () => {
      const res = await request(app).post('/auth/login').send({
        email: 'manager@dealflow.com',
        password: 'wrongPassword'
      });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid credentials');
    });

    it('should return 401 with the SAME generic message for non-existent email', async () => {
      const res = await request(app).post('/auth/login').send({
        email: 'nonexistent@dealflow.com',
        password: 'securePassword123'
      });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid credentials');
    });
  });

  describe('Middleware & Role Protection', () => {
    let customerToken: string;
    let managerToken: string;

    beforeAll(async () => {
      // Create a CUSTOMER user
      const customerRes = await request(app).post('/auth/signup').send({
        email: 'customer@acme.com',
        password: 'customerPass123',
        role: 'CUSTOMER'
      });
      customerToken = customerRes.body.token;

      // Login manager to get manager token
      const managerRes = await request(app).post('/auth/login').send({
        email: 'manager@dealflow.com',
        password: 'securePassword123'
      });
      managerToken = managerRes.body.token;
    });

    it('should ALLOW access to internal route for valid internal role token (MANAGER)', async () => {
      const res = await request(app)
        .get('/auth/internal-route')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe('MANAGER');
    });

    it('CRITICAL: should REJECT CUSTOMER-role token on internal route with 403 Forbidden', async () => {
      const res = await request(app)
        .get('/auth/internal-route')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Forbidden: insufficient permissions');
    });

    it('should return 401 for expired JWT without crashing', async () => {
      // Generate an expired token
      const expiredToken = jwt.sign({ userId: 'some-user-id', role: 'MANAGER' }, JWT_SECRET, { expiresIn: '-1s' });

      const res = await request(app)
        .get('/auth/internal-route')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid or expired token');
    });

    it('should return 401 for missing Authorization header', async () => {
      const res = await request(app).get('/auth/internal-route');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Missing or invalid authorization header');
    });
  });

  describe('Customer Portal Magic Link Flow', () => {
    let portalToken: string;

    it('should generate magic link for customer user', async () => {
      const res = await request(app)
        .post('/auth/portal/request-link')
        .send({ email: 'customer@acme.com' });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.magicLink).toContain('/auth/portal/verify?token=');
      portalToken = res.body.token;
    });

    it('should verify magic link token and return CUSTOMER JWT', async () => {
      const res = await request(app).get(`/auth/portal/verify?token=${portalToken}`);

      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe('CUSTOMER');
      expect(res.body.token).toBeDefined();
      expect(res.body.user.password).toBeUndefined();
      expect(res.body.user.passwordHash).toBeUndefined();
    });

    it('should reject already used magic link token with 401', async () => {
      const res = await request(app).get(`/auth/portal/verify?token=${portalToken}`);

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid or expired magic link token');
    });
  });
});
