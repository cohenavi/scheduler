import { Router } from 'express';
import {
  AUTH_COOKIE_NAME,
  hashPassword,
  isRequestAdmin,
  requireAdmin,
  shouldUseSecureCookie,
  signAdminToken,
  verifyAdminPassword,
} from '../auth.js';
import { prisma } from '../db.js';

export const authRouter = Router();

authRouter.get('/me', (req, res) => {
  res.json({ isAdmin: isRequestAdmin(req) });
});

authRouter.post('/login', async (req, res) => {
  try {
    const { password } = req.body ?? {};
    if (typeof password !== 'string' || !password) {
      res.status(400).json({ error: 'Password is required' });
      return;
    }

    const valid = await verifyAdminPassword(password);
    if (!valid) {
      res.status(401).json({ error: 'Invalid admin password' });
      return;
    }

    const token = signAdminToken();
    const secure = shouldUseSecureCookie(req);

    res.cookie(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({ isAdmin: true, token });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

authRouter.post('/logout', (req, res) => {
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: shouldUseSecureCookie(req),
    path: '/',
  });
  res.json({ isAdmin: false });
});

authRouter.post('/change-password', requireAdmin, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body ?? {};
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
      res.status(400).json({ error: 'Current and new passwords are required' });
      return;
    }
    if (newPassword.length < 6) {
      res.status(400).json({ error: 'New password must be at least 6 characters' });
      return;
    }

    const valid = await verifyAdminPassword(currentPassword);
    if (!valid) {
      res.status(401).json({ error: 'Current password is incorrect' });
      return;
    }

    const hash = hashPassword(newPassword);
    await prisma.appSetting.upsert({
      where: { key: 'adminPasswordHash' },
      update: { value: hash },
      create: { key: 'adminPasswordHash', value: hash },
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Failed to update password' });
  }
});
