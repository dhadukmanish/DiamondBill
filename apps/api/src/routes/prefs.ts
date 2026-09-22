import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '../db/client';
import { ok } from '../lib/respond';

export async function prefRoutes(app: FastifyInstance) {
  app.get('/api/column-preferences', { preHandler: app.authenticate }, async (req) => {
    const { moduleName } = req.query as { moduleName: string };
    const [row] = await db.select().from(schema.listPreferences).where(and(eq(schema.listPreferences.userId, req.user.id), eq(schema.listPreferences.moduleName, moduleName)));
    return ok(row?.columns ?? []);
  });
  app.put('/api/column-preferences', { preHandler: app.authenticate }, async (req) => {
    const body = z.object({ moduleName: z.string(), columns: z.array(z.object({ key: z.string(), visible: z.boolean() })) }).parse(req.body);
    await db
      .insert(schema.listPreferences)
      .values({ tenantId: req.user.tenantId, userId: req.user.id, moduleName: body.moduleName, columns: body.columns })
      .onConflictDoUpdate({ target: [schema.listPreferences.userId, schema.listPreferences.moduleName], set: { columns: body.columns, updatedAt: new Date() } });
    return ok(body.columns, 'Column preferences saved');
  });
  app.get('/api/filter-groups', { preHandler: app.authenticate }, async (req) => {
    const { moduleName } = req.query as { moduleName: string };
    const [row] = await db.select().from(schema.listPreferences).where(and(eq(schema.listPreferences.userId, req.user.id), eq(schema.listPreferences.moduleName, moduleName)));
    return ok(row?.filterGroups ?? []);
  });
  app.put('/api/filter-groups', { preHandler: app.authenticate }, async (req) => {
    const body = z.object({ moduleName: z.string(), filterGroups: z.array(z.any()) }).parse(req.body);
    await db
      .insert(schema.listPreferences)
      .values({ tenantId: req.user.tenantId, userId: req.user.id, moduleName: body.moduleName, filterGroups: body.filterGroups })
      .onConflictDoUpdate({ target: [schema.listPreferences.userId, schema.listPreferences.moduleName], set: { filterGroups: body.filterGroups, updatedAt: new Date() } });
    return ok(body.filterGroups, 'Filters saved');
  });
  app.get('/api/activity-logs', { preHandler: app.authenticate }, async (req) => {
    const { entityType, entityId } = req.query as { entityType: string; entityId: string };
    const rows = await db.select().from(schema.activityLogs).where(and(eq(schema.activityLogs.tenantId, req.user.tenantId), eq(schema.activityLogs.entityType, entityType), eq(schema.activityLogs.entityId, entityId)));
    return ok(rows.sort((a, b) => +b.createdAt - +a.createdAt));
  });
}
