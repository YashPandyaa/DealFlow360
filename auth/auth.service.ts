// auth/auth.service.ts
import { prisma } from '../shared/prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'dealflow360-super-secret-key';
export const ALLOWED_ROLES = ['ADMIN', 'REP', 'MANAGER', 'FINANCE', 'CUSTOMER'] as const;

export interface SignupDto {
  email?: string;
  password?: string;
  name?: string;
  role?: string;
}

export interface LoginDto {
  email?: string;
  password?: string;
}

export class AuthService {
  /**
   * Internal & Customer User Signup
   */
  static async signup(dto: SignupDto) {
    const { email, password, name, role } = dto;

    if (!email || !password || !role) {
      return { status: 400, body: { error: 'Email, password, and role are required' } };
    }

    if (!ALLOWED_ROLES.includes(role as any)) {
      return { status: 400, body: { error: 'Invalid role specified' } };
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const isPortalUser = role === 'CUSTOMER';

    try {
      const user = await prisma.user.create({
        data: {
          email: email.toLowerCase().trim(),
          passwordHash,
          name: name || null,
          role,
          isPortalUser
        }
      });

      const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '8h' });

      return {
        status: 201,
        body: {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            isPortalUser: user.isPortalUser,
            createdAt: user.createdAt
          },
          token
        }
      };
    } catch (error: any) {
      if (error.code === 'P2002' || error.message?.includes('Unique constraint')) {
        return { status: 409, body: { error: 'Email already in use' } };
      }
      throw error;
    }
  }

  /**
   * Internal & Customer Login with email/password
   */
  static async login(dto: LoginDto) {
    const { email, password } = dto;

    if (!email || !password) {
      return { status: 401, body: { error: 'Invalid credentials' } };
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() }
    });

    if (!user || !user.passwordHash) {
      return { status: 401, body: { error: 'Invalid credentials' } };
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return { status: 401, body: { error: 'Invalid credentials' } };
    }

    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '8h' });

    return {
      status: 200,
      body: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          isPortalUser: user.isPortalUser
        },
        token
      }
    };
  }

  /**
   * Request magic link for customer portal
   */
  static async requestPortalLink(email?: string) {
    if (!email) {
      return { status: 400, body: { error: 'Customer email is required' } };
    }

    const user = await prisma.user.findFirst({
      where: {
        email: email.toLowerCase().trim()
      }
    });

    if (!user) {
      return { status: 404, body: { error: 'Customer user not found' } };
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    await prisma.portalMagicLink.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
        used: false
      }
    });

    const magicLink = `/auth/portal/verify?token=${token}`;

    return {
      status: 200,
      body: {
        message: 'Magic link generated successfully',
        magicLink,
        token
      }
    };
  }

  /**
   * Verify portal magic link token
   */
  static async verifyPortalLink(token?: string) {
    if (!token) {
      return { status: 401, body: { error: 'Invalid or expired magic link token' } };
    }

    const magicLink = await prisma.portalMagicLink.findUnique({
      where: { token },
      include: { user: true }
    });

    if (!magicLink || magicLink.used || new Date() > magicLink.expiresAt) {
      return { status: 401, body: { error: 'Invalid or expired magic link token' } };
    }

    await prisma.portalMagicLink.update({
      where: { id: magicLink.id },
      data: { used: true }
    });

    const jwtToken = jwt.sign({ userId: magicLink.user.id, role: 'CUSTOMER' }, JWT_SECRET, { expiresIn: '8h' });

    return {
      status: 200,
      body: {
        user: {
          id: magicLink.user.id,
          email: magicLink.user.email,
          name: magicLink.user.name,
          role: 'CUSTOMER',
          isPortalUser: true
        },
        token: jwtToken
      }
    };
  }
}
