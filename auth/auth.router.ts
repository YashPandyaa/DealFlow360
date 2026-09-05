// auth/auth.router.ts
import { Router, Request, Response } from 'express';
import { AuthService } from './auth.service';
import { authenticate, requireRole, AuthenticatedRequest } from './auth.middleware';

export const authRouter = Router();

/**
 * POST /auth/signup
 * Internal & Customer user signup
 */
authRouter.post('/signup', async (req: Request, res: Response) => {
  try {
    const result = await AuthService.signup(req.body);
    res.status(result.status).json(result.body);
  } catch (error: any) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /auth/login
 * User login with email/password
 */
authRouter.post('/login', async (req: Request, res: Response) => {
  try {
    const result = await AuthService.login(req.body);
    res.status(result.status).json(result.body);
  } catch (error: any) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /auth/portal/request-link
 * Request magic link for customer portal access
 */
authRouter.post('/portal/request-link', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const result = await AuthService.requestPortalLink(email);
    res.status(result.status).json(result.body);
  } catch (error: any) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /auth/portal/verify
 * Verify magic link token and issue customer JWT
 */
authRouter.get('/portal/verify', async (req: Request, res: Response) => {
  try {
    const token = req.query.token as string;
    const result = await AuthService.verifyPortalLink(token);
    res.status(result.status).json(result.body);
  } catch (error: any) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /auth/internal-route
 * Protected internal route for testing authenticate and requireRole middleware
 */
authRouter.get(
  '/internal-route',
  authenticate,
  requireRole(['ADMIN', 'REP', 'MANAGER', 'FINANCE']),
  (req: AuthenticatedRequest, res: Response) => {
    res.status(200).json({
      message: 'Access granted to internal route',
      user: req.user
    });
  }
);
