// shared/auth.sanitizer.ts

/**
 * Sanitizes user objects by stripping sensitive credential fields.
 */
export function sanitizeUser<T extends Record<string, any>>(user: T | null | undefined): T | null | undefined {
  if (!user || typeof user !== 'object') {
    return user;
  }
  const sanitized = { ...user };
  delete sanitized.password;
  delete sanitized.password_hash;
  delete sanitized.passwordHash;
  delete sanitized.refreshToken;
  delete sanitized.refresh_token;
  delete sanitized.accessToken;
  delete sanitized.access_token;
  delete sanitized.secret;
  return sanitized;
}

/**
 * Sanitizes object payloads before sending to CUSTOMER-role tokens.
 * Strips internal margin, cost, internal approver IDs, risk scores, and security credentials.
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
    const sanitized: Record<string, any> = { ...data };

    // Strip sensitive authentication credentials
    delete sanitized.password;
    delete sanitized.password_hash;
    delete sanitized.passwordHash;
    delete sanitized.refreshToken;
    delete sanitized.refresh_token;
    delete sanitized.accessToken;
    delete sanitized.access_token;
    delete sanitized.secret;

    // Strip sensitive internal business & governance fields
    delete sanitized.marginPercent;
    delete sanitized.marginDelta;
    delete sanitized.cost;
    delete sanitized.costPrice;
    delete sanitized.approverId;
    delete sanitized.blendedRiskScore;
    delete sanitized.riskScore;
    delete sanitized.requiredApprovers;
    delete sanitized.approvalRequests;

    for (const key of Object.keys(sanitized)) {
      if (sanitized[key] !== null && typeof sanitized[key] === 'object') {
        sanitized[key] = sanitizeForCustomer(sanitized[key]);
      }
    }

    return sanitized as T;
  }

  return data;
}

