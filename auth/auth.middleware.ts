// auth/auth.middleware.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../shared/prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'dealflow360-super-secret-key';

export interface AuthUser {
  id: string;
  role: string;
  email?: string;
  name?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

/**
 * Middleware to authenticate requests using JWT Bearer token.
 * Attached decoded user payload { id, role } to req.user.
 */
export const authenticate = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId?: string; id?: string; role: string; email?: string };
    const userId = decoded.userId || decoded.id;

    if (!userId || !decoded.role) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, email: true, name: true }
    }).catch(() => null);

    req.user = {
      id: dbUser ? dbUser.id : userId,
      role: dbUser ? dbUser.role : decoded.role,
      email: dbUser?.email || decoded.email || undefined,
      name: dbUser?.name || undefined
    };

    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }
};

/**
 * Middleware factory to enforce role-based access control.
 * Rejects requests if user's role is not included in allowedRoles.
 */
export const requireRole = (allowedRoles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !req.user.role) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ error: 'Forbidden: insufficient permissions' });
      return;
    }

    next();
  };
};
