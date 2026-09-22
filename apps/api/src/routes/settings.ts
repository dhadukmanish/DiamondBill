import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getSettings, updateSettings } from '../services/settings.js';
import { ok } from '../lib/respond.js';

export async function settingsRoutes(app: FastifyInstance) {
  app.get('/api/accounting/masters/firm-settings', { preHandler: app.authenticate }, async (req) => ok(await getSettings(req.user.tenantId), 'Firm settings retrieved successfully'));
  app.put('/api/accounting/masters/firm-settings', { preHandler: app.requirePermission('admin_general_settings', 'update') }, async (req) => {
    const patch = z.record(z.any()).parse(req.body ?? {});
    return ok(await updateSettings(req.user.tenantId, patch), 'Settings saved successfully');
  });
  app.get('/api/accounting/masters/nav-setting-flags', { preHandler: app.authenticate }, async (req) => {
    const s = await getSettings(req.user.tenantId);
    return ok({ serializedInventoryTracking: !!s.serializedInventoryTracking, showSkuSeries: !!s.showSkuSeries });
  });
}
