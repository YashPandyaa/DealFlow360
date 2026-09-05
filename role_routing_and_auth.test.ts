// role_routing_and_auth.test.ts
import { normalizeRole, getRoleDefaultRoute } from './frontend/src/utils/roles';
import request from 'supertest';
import app from './src/index';
import { AuthService } from './auth/auth.service';

describe('Centralized Role Normalization & Routing Resolution Audit', () => {
  beforeAll(async () => {
    await AuthService.ensureDemoUsers();
  });
  it('should correctly normalize role variants', () => {
    expect(normalizeRole('CUSTOMER')).toBe('CUSTOMER');
    expect(normalizeRole('customer')).toBe('CUSTOMER');
    expect(normalizeRole('PORTAL')).toBe('CUSTOMER');
    expect(normalizeRole('CUSTOMER_PORTAL')).toBe('CUSTOMER');

    expect(normalizeRole('ADMIN')).toBe('ADMIN');
    expect(normalizeRole('admin')).toBe('ADMIN');
    expect(normalizeRole('SYSTEM_ADMIN')).toBe('ADMIN');

    expect(normalizeRole('MANAGER')).toBe('MANAGER');
    expect(normalizeRole('SALES_MANAGER')).toBe('MANAGER');

    expect(normalizeRole('FINANCE')).toBe('FINANCE');
    expect(normalizeRole('FINANCE_OPERATIONS')).toBe('FINANCE');

    expect(normalizeRole('REP')).toBe('REP');
    expect(normalizeRole('SALES_REP')).toBe('REP');
    expect(normalizeRole('unknown')).toBe('REP');
  });

  it('should map explicit default dashboard route for each role', () => {
    expect(getRoleDefaultRoute('CUSTOMER')).toBe('/portal/dashboard');
    expect(getRoleDefaultRoute('SALES_MANAGER')).toBe('/manager/dashboard');
    expect(getRoleDefaultRoute('FINANCE_OPERATIONS')).toBe('/finance/dashboard');
    expect(getRoleDefaultRoute('ADMIN')).toBe('/admin/dashboard');
    expect(getRoleDefaultRoute('SALES_REP')).toBe('/sales/dashboard');
  });

  it('should return trusted role in auth login API for all accounts', async () => {
    const customerLogin = await request(app)
      .post('/auth/login')
      .send({ email: 'portal-customer@acme.com', password: 'password123' });

    expect(customerLogin.status).toBe(200);
    expect(customerLogin.body.user.role).toBe('CUSTOMER');
    expect(getRoleDefaultRoute(customerLogin.body.user.role)).toBe('/portal/dashboard');

    const repLogin = await request(app)
      .post('/auth/login')
      .send({ email: 'rep.alice@dealflow360.com', password: 'password123' });

    expect(repLogin.status).toBe(200);
    expect(repLogin.body.user.role).toBe('REP');
    expect(getRoleDefaultRoute(repLogin.body.user.role)).toBe('/sales/dashboard');

    const mgrLogin = await request(app)
      .post('/auth/login')
      .send({ email: 'manager@dealflow360.com', password: 'password123' });

    expect(mgrLogin.status).toBe(200);
    expect(mgrLogin.body.user.role).toBe('MANAGER');
    expect(getRoleDefaultRoute(mgrLogin.body.user.role)).toBe('/manager/dashboard');

    const finLogin = await request(app)
      .post('/auth/login')
      .send({ email: 'finance@dealflow360.com', password: 'password123' });

    expect(finLogin.status).toBe(200);
    expect(finLogin.body.user.role).toBe('FINANCE');
    expect(getRoleDefaultRoute(finLogin.body.user.role)).toBe('/finance/dashboard');

    const adminLogin = await request(app)
      .post('/auth/login')
      .send({ email: 'admin@dealflow360.com', password: 'password123' });

    expect(adminLogin.status).toBe(200);
    expect(adminLogin.body.user.role).toBe('ADMIN');
    expect(getRoleDefaultRoute(adminLogin.body.user.role)).toBe('/admin/dashboard');
  });
});
