import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import { AppError, forbidden } from '../lib/errors.js';
import type { PermissionAction } from '@diamondbill/shared';

export interface AuthUser {
  id: string;
  tenantId: string;
  role: string;
  name: string;
  email: string;
  permissions: Record<string, string[]>;
  firmIds: string[];
  branchIds: string[];
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; tenantId: string; role: string };
    user: AuthUser;
  }
}
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest) => Promise<void>;
    requirePermission: (subModule: string, action?: PermissionAction) => (req: FastifyRequest) => Promise<void>;
  }
}

export default fp(async function authPlugin(app: FastifyInstance) {
    app.decorate('authenticate', async (req: FastifyRequest) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new AppError('AUTH_003', 'No token provided', 401);
    let payload: { sub: string; sessionId?: string };
    try {
      payload = app.jwt.verify<{ sub: string; sessionId?: string }>(header.slice(7));
    } catch {
      throw new AppError('AUTH_002', 'Invalid or expired token', 401);
    }
    const [u] = await db.select().from(schema.users).where(eq(schema.users.id, payload.sub)).limit(1);
    if (!u || !u.isActive) throw new AppError('AUTH_004', 'User not found or inactive', 401);
    (req as any).user = {
      id: u.id,
      tenantId: u.tenantId,
      role: u.role,
      name: `${u.firstName} ${u.lastName}`.trim(),
      email: u.email,
      permissions: u.permissions ?? {},
      firmIds: u.firmIds ?? [],
      branchIds: u.branchIds ?? [],
    };
  });

  app.decorate('requirePermission', (subModule: string, action: PermissionAction = 'read') => async (req: FastifyRequest) => {
    await app.authenticate(req);
    if (req.user.role === 'super_admin') return;
    const actions = req.user.permissions[subModule] ?? [];
    if (!actions.includes(action)) throw forbidden(`Missing permission ${subModule}:${action}`);
  });
});
