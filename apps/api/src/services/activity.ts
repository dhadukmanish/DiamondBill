import type { FastifyRequest } from 'fastify';
import { db, schema } from '../db/client.js';

export async function logActivity(req: FastifyRequest, entityType: string, entityId: string, action: string, description: string, meta: Record<string, unknown> = {}) {
  try {
    await db.insert(schema.activityLogs).values({ tenantId: req.user.tenantId, entityType, entityId, action, description, meta, userId: req.user.id, userName: req.user.name });
  } catch (e) {
    req.log.warn({ err: e }, 'activity log failed');
  }
}
