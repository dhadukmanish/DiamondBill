import { eq } from 'drizzle-orm';
import { db, schema } from '../db/client';
import { DEFAULT_FIRM_SETTINGS } from '../db/seed-data/coa';

export type FirmSettings = typeof DEFAULT_FIRM_SETTINGS & Record<string, any>;

export async function getSettings(tenantId: string): Promise<FirmSettings> {
  const [row] = await db.select().from(schema.firmSettings).where(eq(schema.firmSettings.tenantId, tenantId));
  return { ...DEFAULT_FIRM_SETTINGS, ...((row?.settings as any) ?? {}) };
}

export async function updateSettings(tenantId: string, patch: Record<string, any>) {
  const current = await getSettings(tenantId);
  const next = { ...current, ...patch };
  await db
    .insert(schema.firmSettings)
    .values({ tenantId, settings: next })
    .onConflictDoUpdate({ target: schema.firmSettings.tenantId, set: { settings: next, updatedAt: new Date() } });
  return next;
}
