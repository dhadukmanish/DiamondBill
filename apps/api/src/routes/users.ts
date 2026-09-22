import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { and, asc, desc, eq, ilike, or, count } from 'drizzle-orm';
import { db, schema } from '../db/client';
import { userSchema, PERMISSIONS, PERMISSION_ACTIONS } from '@diamondbill/shared';
import { parse } from '../lib/validate';
import { notFound, validation } from '../lib/errors';
import { ok } from '../lib/respond';
import { parseListQuery } from '../lib/list';
import { publicUser } from './auth';

export async function userRoutes(app: FastifyInstance) {
  app.get('/api/admin/users', { preHandler: app.requirePermission('admin_users') }, async (req) => {
    const q = parseListQuery(req.query as any);
    const { isActive } = req.query as { isActive?: string };
    const where = and(
      eq(schema.users.tenantId, req.user.tenantId),
      isActive === 'true' ? eq(schema.users.isActive, true) : isActive === 'false' ? eq(schema.users.isActive, false) : undefined,
      q.search ? or(ilike(schema.users.firstName, `%${q.search}%`), ilike(schema.users.lastName, `%${q.search}%`), ilike(schema.users.email, `%${q.search}%`)) : undefined,
    );
    const [{ total }] = await db.select({ total: count() }).from(schema.users).where(where);
    const rows = await db.select().from(schema.users).where(where).orderBy(desc(schema.users.createdAt)).limit(q.limit).offset((q.page - 1) * q.limit);
    return ok({ rows: rows.map(publicUser), total: Number(total), page: q.page, pageSize: q.limit }, 'Users retrieved successfully');
  });

  app.get('/api/admin/users/permission-catalog', { preHandler: app.requirePermission('admin_users') }, async () => ok({ permissions: PERMISSIONS, actions: PERMISSION_ACTIONS }));

  app.get('/api/admin/users/:id', { preHandler: app.requirePermission('admin_users') }, async (req) => {
    const { id } = req.params as { id: string };
    const [u] = await db.select().from(schema.users).where(and(eq(schema.users.id, id), eq(schema.users.tenantId, req.user.tenantId)));
    if (!u) throw notFound('User');
    return ok(publicUser(u));
  });

  app.post('/api/admin/users', { preHandler: app.requirePermission('admin_users', 'create') }, async (req) => {
    const body = parse(userSchema, req.body);
    if (!body.password) throw validation('Password is required');
    const { password, ...rest } = body;
    const [u] = await db
      .insert(schema.users)
      .values({ ...rest, email: rest.email.toLowerCase(), tenantId: req.user.tenantId, passwordHash: await bcrypt.hash(password, 10) })
      .returning();
    return ok(publicUser(u), 'User created successfully');
  });

  app.put('/api/admin/users/:id', { preHandler: app.requirePermission('admin_users', 'update') }, async (req) => {
    const { id } = req.params as { id: string };
    const body = parse(userSchema.partial(), req.body);
    const { password, ...rest } = body;
    const patch: any = { ...rest, updatedAt: new Date() };
    if (rest.email) patch.email = rest.email.toLowerCase();
    if (password) patch.passwordHash = await bcrypt.hash(password, 10);
    const [u] = await db.update(schema.users).set(patch).where(and(eq(schema.users.id, id), eq(schema.users.tenantId, req.user.tenantId))).returning();
    if (!u) throw notFound('User');
    return ok(publicUser(u), 'User updated successfully');
  });

  app.delete('/api/admin/users/:id', { preHandler: app.requirePermission('admin_users', 'delete') }, async (req) => {
    const { id } = req.params as { id: string };
    if (id === req.user.id) throw validation('You cannot delete your own account');
    const r = await db.delete(schema.users).where(and(eq(schema.users.id, id), eq(schema.users.tenantId, req.user.tenantId))).returning({ id: schema.users.id });
    if (!r.length) throw notFound('User');
    return ok(null, 'User deleted successfully');
  });

  app.get('/api/crm/lookup/users', { preHandler: app.authenticate }, async (req) => {
    const rows = await db.select({ id: schema.users.id, firstName: schema.users.firstName, lastName: schema.users.lastName, email: schema.users.email }).from(schema.users).where(and(eq(schema.users.tenantId, req.user.tenantId), eq(schema.users.isActive, true))).orderBy(asc(schema.users.firstName));
    return ok(rows.map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}`.trim(), email: u.email })));
  });
}
