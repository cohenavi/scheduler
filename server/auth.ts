import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from './db.js';

export const AUTH_COOKIE_NAME = 'scheduler_token';

function getJwtSecret(): string {
  return process.env.JWT_SECRET || 'dev-scheduler-jwt-secret-change-in-production';
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPasswordHash(password: string, storedHash: string): boolean {
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

export async function verifyAdminPassword(candidate: string): Promise<boolean> {
  const setting = await prisma.appSetting.findUnique({
    where: { key: 'adminPasswordHash' },
  });
  if (setting?.value) {
    return verifyPasswordHash(candidate, setting.value);
  }
  const envPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const a = Buffer.from(candidate);
  const b = Buffer.from(envPassword);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function signAdminToken(): string {
  return jwt.sign({ role: 'admin' }, getJwtSecret(), { expiresIn: '7d' });
}

export function verifyAdminToken(token: string): boolean {
  try {
    const payload = jwt.verify(token, getJwtSecret()) as { role?: string };
    return payload?.role === 'admin';
  } catch {
    return false;
  }
}

export function extractToken(req: Request): string | null {
  const cookieToken = req.cookies?.[AUTH_COOKIE_NAME];
  if (typeof cookieToken === 'string' && cookieToken.length > 0) {
    return cookieToken;
  }
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return null;
}

export function isRequestAdmin(req: Request): boolean {
  const token = extractToken(req);
  if (!token) return false;
  return verifyAdminToken(token);
}

export function shouldUseSecureCookie(req: Request): boolean {
  const mode = (process.env.COOKIE_SECURE || 'auto').toLowerCase();
  if (mode === 'true') return true;
  if (mode === 'false') return false;
  // auto: detect HTTPS directly or via reverse proxy X-Forwarded-Proto
  const forwardedProto = req.headers['x-forwarded-proto'];
  const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  return req.secure || proto?.toLowerCase() === 'https';
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!isRequestAdmin(req)) {
    res.status(401).json({ error: 'Admin authentication required' });
    return;
  }
  next();
}
