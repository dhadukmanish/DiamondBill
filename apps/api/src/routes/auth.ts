import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { and, eq, or, gt } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { db, schema } from '../db/client.js';
import { loginSchema, PERMISSIONS, allPermissions } from '@diamondbill/shared';
import { parse } from '../lib/validate.js';
import { AppError } from '../lib/errors.js';
import { ok } from '../lib/respond.js';

const REFRESH_DAYS = 30;

export async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/login', async (req) => {
    const body = parse(loginSchema, req.body);
    const ident = body.email.trim().toLowerCase();
    const [u] = await db
      .select()
      .from(schema.users)
      .where(or(eq(schema.users.email, ident), eq(schema.users.username, ident)))
      .limit(1);
    if (!u || !(await bcrypt.compare(body.password, u.passwordHash))) throw new AppError('AUTH_001', 'Invalid email or password', 401);
    if (!u.isActive) throw new AppError('AUTH_004', 'This account is inactive', 403);
    const accessToken = app.jwt.sign({ sub: u.id, tenantId: u.tenantId, role: u.role }, { expiresIn: '12h' });
    const refreshToken = randomBytes(48).toString('hex');
    await db.insert(schema.refreshTokens).values({ userId: u.id, token: refreshToken, expiresAt: new Date(Date.now() + REFRESH_DAYS * 86400000) });
    await db.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, u.id));
    return ok({ accessToken, refreshToken, user: publicUser(u) }, 'Login successful');
  });

  app.post('/api/auth/refresh', async (req) => {
    const token = (req.body as any)?.refreshToken as string | undefined;
    if (!token) throw new AppError('AUTH_003', 'No token provided', 401);
    const [rt] = await db
      .select()
      .from(schema.refreshTokens)
      .where(and(eq(schema.refreshTokens.token, token), gt(schema.refreshTokens.expiresAt, new Date())))
      .limit(1);
    if (!rt) throw new AppError('AUTH_002', 'Invalid or expired token', 401);
    const [u] = await db.select().from(schema.users).where(eq(schema.users.id, rt.userId)).limit(1);
    if (!u || !u.isActive) throw new AppError('AUTH_004', 'User not found or inactive', 401);
    const accessToken = app.jwt.sign({ sub: u.id, tenantId: u.tenantId, role: u.role }, { expiresIn: '12h' });
    return ok({ accessToken, user: publicUser(u) });
  });

  app.post('/api/auth/logout', { preHandler: app.authenticate }, async (req) => {
    const token = (req.body as any)?.refreshToken as string | undefined;
    if (token) await db.delete(schema.refreshTokens).where(eq(schema.refreshTokens.token, token));
    return ok(null, 'Logged out');
  });

  app.get('/api/auth/me', { preHandler: app.authenticate }, async (req) => {
    const [u] = await db.select().from(schema.users).where(eq(schema.users.id, req.user.id)).limit(1);
    const [tenant] = await db.select().from(schema.tenants).where(eq(schema.tenants.id, req.user.tenantId)).limit(1);
    return ok({ user: publicUser(u), tenant });
  });

  app.get('/api/permissions/me', { preHandler: app.authenticate }, async (req) => {
    const grants = req.user.role === 'super_admin' ? allPermissions() : req.user.permissions;
    const permissions = PERMISSIONS.filter((p) => grants[p.name]?.length).map((p) => ({
      name: p.name,
      displayName: p.displayName,
      module: p.module,
      actions: grants[p.name],
      source: req.user.role === 'super_admin' ? 'role' : 'grant',
      productModuleName: 'Diamond Finance',
    }));
    return ok({ userId: req.user.id, role: req.user.role, permissions });
  });
}

export function publicUser(u: typeof schema.users.$inferSelect) {
  return {
    id: u.id,
    tenantId: u.tenantId,
    firstName: u.firstName,
    lastName: u.lastName,
    name: `${u.firstName} ${u.lastName}`.trim(),
    email: u.email,
    username: u.username,
    mobile: u.mobile,
    role: u.role,
    userKind: u.userKind,
    avatarUrl: u.avatarUrl,
    firmIds: u.firmIds,
    branchIds: u.branchIds,
    statementFirmIds: u.statementFirmIds,
    statementBranchIds: u.statementBranchIds,
    contactVisibility: u.contactVisibility,
    permissions: u.permissions,
    isActive: u.isActive,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
  };
}
