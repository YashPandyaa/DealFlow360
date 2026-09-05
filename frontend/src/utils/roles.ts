// frontend/src/utils/roles.ts

/**
 * Normalizes any role string variant across the application.
 * Supported roles: 'ADMIN', 'REP', 'MANAGER', 'FINANCE', 'CUSTOMER'.
 */
export const normalizeRole = (role?: string | null): string => {
  if (!role || typeof role !== 'string') return 'REP';
  const upper = role.toUpperCase().trim();
  if (upper === 'CUSTOMER' || upper === 'PORTAL' || upper === 'CUSTOMER_PORTAL') return 'CUSTOMER';
  if (upper === 'ADMIN' || upper === 'SYSTEM_ADMIN') return 'ADMIN';
  if (upper === 'MANAGER' || upper === 'SALES_MANAGER') return 'MANAGER';
  if (upper === 'FINANCE' || upper === 'FINANCE_OPERATIONS') return 'FINANCE';
  if (upper === 'REP' || upper === 'SALES_REP') return 'REP';
  return 'REP';
};

/**
 * Determines the explicit default dashboard route for each authenticated role.
 * - CUSTOMER          -> /portal
 * - SALES_MANAGER     -> /workspace/approval
 * - FINANCE_OPERATIONS-> /workspace/billing
 * - ADMIN             -> /workspace/dashboard
 * - SALES_REP         -> /workspace/pipeline
 */
export const getRoleDefaultRoute = (role?: string | null): string => {
  const norm = normalizeRole(role);
  switch (norm) {
    case 'ADMIN':
      return '/admin/dashboard';
    case 'MANAGER':
      return '/manager/dashboard';
    case 'FINANCE':
      return '/finance/dashboard';
    case 'CUSTOMER':
      return '/portal/dashboard';
    case 'REP':
    default:
      return '/sales/dashboard';
  }
};
