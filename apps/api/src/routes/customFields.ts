import type { FastifyInstance } from 'fastify';
import { and, asc, eq, sql } from 'drizzle-orm';
import { db, schema } from '../db/client';
import { customFieldSchema, CUSTOM_FIELD_MODULES, CUSTOM_FIELD_TYPE_GROUPS, DIAMOND_PROPERTY_TYPES } from '@diamondbill/shared';
import { parse } from '../lib/validate';
import { notFound, validation } from '../lib/errors';
import { ok } from '../lib/respond';

export const slugify = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/%/g, ' percent')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

export async function customFieldRoutes(app: FastifyInstance) {
  app.get('/api/custom-fields/field-types', { preHandler: app.authenticate }, async () => ok(CUSTOM_FIELD_TYPE_GROUPS));
  app.get('/api/custom-fields/modules', { preHandler: app.authenticate }, async () => ok({ modules: CUSTOM_FIELD_MODULES }));
  app.get('/api/custom-fields/diamond-property-types', { preHandler: app.authenticate }, async () => ok(DIAMOND_PROPERTY_TYPES.map(({ code, label, key }) => ({ code, label, key }))));

  app.get('/api/custom-fields/groups', { preHandler: app.authenticate }, async (req) => {
    const rows = await db.select().from(schema.customFields).where(eq(schema.customFields.tenantId, req.user.tenantId)).orderBy(asc(schema.customFields.displayOrder), asc(schema.customFields.fieldLabel));
    return ok({ groups: rows.map(shape) });
  });

  /** Active fields for one module (used by forms/lists) */
  app.get('/api/custom-fields/:moduleName', { preHandler: app.authenticate }, async (req) => {
    const { moduleName } = req.params as { moduleName: string };
    const { includeInactive } = req.query as { includeInactive?: string };
    const rows = await db
      .select()
      .from(schema.customFields)
      .where(and(eq(schema.customFields.tenantId, req.user.tenantId), sql`${schema.customFields.moduleNames} ? ${moduleName}`, includeInactive === 'true' ? undefined : eq(schema.customFields.isActive, true)))
      .orderBy(asc(schema.customFields.displayOrder), asc(schema.customFields.fieldLabel));
    return ok({ fields: rows.map(shape) });
  });

  app.post('/api/custom-fields', { preHandler: app.requirePermission('crm_custom_fields', 'create') }, async (req) => {
    const body = parse(customFieldSchema, req.body);
    const fieldName = body.fieldName?.trim() || slugify(body.fieldLabel);
    if (!fieldName) throw validation('Field label is required');
    const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${schema.customFields.displayOrder}),0)` }).from(schema.customFields).where(eq(schema.customFields.tenantId, req.user.tenantId));
    const [row] = await db
      .insert(schema.customFields)
      .values({ ...toRow(body), fieldName, fieldLabel: body.fieldLabel, fieldType: body.fieldType, moduleNames: body.moduleNames, tenantId: req.user.tenantId, displayOrder: Number(max) + 1 })
      .returning();
    return ok(shape(row), 'Field created successfully');
  });

  app.put('/api/custom-fields/:id', { preHandler: app.requirePermission('crm_custom_fields', 'update') }, async (req) => {
    const { id } = req.params as { id: string };
    const body = parse(customFieldSchema.partial(), req.body);
    const [existing] = await db.select().from(schema.customFields).where(and(eq(schema.customFields.id, id), eq(schema.customFields.tenantId, req.user.tenantId)));
    if (!existing) throw notFound('Field');
    const [row] = await db
      .update(schema.customFields)
      .set({ ...toRow(body as any, existing), updatedAt: new Date() })
      .where(eq(schema.customFields.id, id))
      .returning();
    return ok(shape(row), 'Field updated successfully');
  });

  app.delete('/api/custom-fields/:id', { preHandler: app.requirePermission('crm_custom_fields', 'delete') }, async (req) => {
    const { id } = req.params as { id: string };
    const r = await db.delete(schema.customFields).where(and(eq(schema.customFields.id, id), eq(schema.customFields.tenantId, req.user.tenantId))).returning({ id: schema.customFields.id });
    if (!r.length) throw notFound('Field');
    return ok(null, 'Field deleted successfully');
  });

  /** "Auto Import Property" — creates the standard diamond properties on certified_products */
  app.post('/api/custom-fields/auto-import', { preHandler: app.requirePermission('crm_custom_fields', 'create') }, async (req) => {
    const { keys } = (req.body ?? {}) as { keys?: string[] };
    const existing = await db.select({ fieldName: schema.customFields.fieldName }).from(schema.customFields).where(eq(schema.customFields.tenantId, req.user.tenantId));
    const have = new Set(existing.map((e) => e.fieldName));
    const wanted = DIAMOND_PROPERTY_TYPES.filter((p) => (!keys || keys.includes(p.key)) && !have.has(p.key));
    let order = existing.length;
    let added = 0;
    for (const p of wanted) {
      await db.insert(schema.customFields).values({
        tenantId: req.user.tenantId,
        fieldName: p.key,
        fieldLabel: p.label,
        fieldType: p.fieldType,
        moduleNames: ['certified_products'],
        isRequired: !!p.required,
        fieldConfig: { diamondPropertyType: p.code, options: (p.options ?? []).map((o) => ({ value: slugify(o), label: o })), conditionalFields: {} },
        displayOrder: ++order,
      });
      added++;
    }
    return ok({ added }, `${added} properties added`);
  });
}

function shape(r: typeof schema.customFields.$inferSelect) {
  const cfg = (r.fieldConfig ?? {}) as any;
  return {
    id: r.id,
    fieldName: r.fieldName,
    fieldLabel: r.fieldLabel,
    fieldType: r.fieldType,
    moduleNames: r.moduleNames,
    serialNo: r.serialNo,
    options: cfg.options ?? [],
    conditionalFields: cfg.conditionalFields ?? {},
    diamondPropertyType: cfg.diamondPropertyType ?? null,
    isRequired: r.isRequired,
    isReadOnly: r.isReadOnly,
    tooltip: r.tooltip,
    showTooltip: r.showTooltip,
    defaultValue: r.defaultValue,
    usedInLabProcess: r.usedInLabProcess,
    useInRapaportAdditionalBack: r.useInRapaportAdditionalBack,
    displaySection: r.displaySection,
    displayOrder: r.displayOrder,
    isActive: r.isActive,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function toRow(b: Partial<ReturnType<typeof customFieldSchema.parse>>, existing?: typeof schema.customFields.$inferSelect) {
  const prevCfg = (existing?.fieldConfig ?? {}) as any;
  const cfg = {
    ...prevCfg,
    ...(b.options !== undefined ? { options: b.options.map((o) => ({ value: o.value, label: o.label || o.value })) } : {}),
    ...(b.conditionalFields !== undefined ? { conditionalFields: b.conditionalFields } : {}),
    ...(b.diamondPropertyType !== undefined ? { diamondPropertyType: b.diamondPropertyType } : {}),
  };
  const out: Partial<typeof schema.customFields.$inferInsert> = { fieldConfig: cfg };
  if (b.fieldLabel !== undefined) out.fieldLabel = b.fieldLabel;
  if (b.fieldType !== undefined) out.fieldType = b.fieldType;
  if (b.moduleNames !== undefined) out.moduleNames = b.moduleNames;
  if (b.serialNo !== undefined) out.serialNo = b.serialNo;
  if (b.isRequired !== undefined) out.isRequired = b.isRequired;
  if (b.isReadOnly !== undefined) out.isReadOnly = b.isReadOnly;
  if (b.tooltip !== undefined) out.tooltip = b.tooltip;
  if (b.showTooltip !== undefined) out.showTooltip = b.showTooltip;
  if (b.defaultValue !== undefined) out.defaultValue = b.defaultValue;
  if (b.usedInLabProcess !== undefined) out.usedInLabProcess = b.usedInLabProcess;
  if (b.useInRapaportAdditionalBack !== undefined) out.useInRapaportAdditionalBack = b.useInRapaportAdditionalBack;
  if (b.displaySection !== undefined) out.displaySection = b.displaySection;
  return out;
}
