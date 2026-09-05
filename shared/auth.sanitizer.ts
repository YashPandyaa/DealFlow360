// shared/auth.sanitizer.ts

/**
 * Sanitizes object payloads before sending to CUSTOMER-role tokens.
 * Strips internal margin, cost, and internal approver IDs.
 */
export function sanitizeForCustomer<T = any>(data: T): T {
  if (data === null || data === undefined) {
    return data;
  }

  if (data instanceof Date) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeForCustomer(item)) as unknown as T;
  }

  if (typeof data === 'object') {
    const sanitized: any = { ...data };

    // Strip sensitive internal business fields
    delete sanitized.marginPercent;
    delete sanitized.marginDelta;
    delete sanitized.cost;
    delete sanitized.costPrice;
    delete sanitized.approverId;

    for (const key of Object.keys(sanitized)) {
      if (sanitized[key] !== null && typeof sanitized[key] === 'object') {
        sanitized[key] = sanitizeForCustomer(sanitized[key]);
      }
    }

    return sanitized as T;
  }

  return data;
}
