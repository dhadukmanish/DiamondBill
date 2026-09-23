import type { FastifyInstance } from 'fastify';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '../db/client';
import { rapaportSetSchema, rapaportGridSchema, rapaportCopySchema, rapaportAdditionalBackSchema, RAP_COLORS, RAP_CLARITIES } from '@diamondbill/shared';
import { parse } from '../lib/validate';
import { validation } from '../lib/errors';
import { ok } from '../lib/respond';
import { z } from 'zod';

const R = schema.rapaportPrices, AB = schema.rapaportAdditionalBacks;
const s4 = (v: number) => v.toFixed(4);

/** Shape / size / color / clarity option lists come from the certified custom fields (diamondPropertyType codes 1, 2, 6, 5). */
async function propertyOptions(tenantId: string) {
  const rows = await db.select().from(schema.customFields).where(and(eq(schema.customFields.tenantId, tenantId), sql`${schema.customFields.moduleNames} ? 'certified_products'`));
  const byCode = (code: string) => rows.find((r) => (r.fieldConfig as any)?.diamondPropertyType === code);
  const opts = (r?: typeof rows[number]) => (((r?.fieldConfig as any)?.options ?? []) as { value: string; label: string }[]);
  const shape = byCode('1'), size = byCode('2'), color = byCode('6'), clarity = byCode('5');
  return {
    shapes: opts(shape), sizes: opts(size), colors: opts(color).length ? opts(color) : RAP_COLORS.map((c) => ({ value: c.toLowerCase(), label: c })), clarities: opts(clarity).length ? opts(clarity) : RAP_CLARITIES.map((c) => ({ value: c.toLowerCase(), label: c })),
    ready: !!shape && !!size, sizeFieldExists: !!size, shapeFieldExists: !!shape,
    additionalBackFields: rows.filter((r) => r.useInRapaportAdditionalBack).map((r) => ({ fieldName: r.fieldName, fieldLabel: r.fieldLabel, options: opts(r) })),
  };
}

export async function rapaportRoutes(app: FastifyInstance) {
  app.get('/api/accounting/rapaport/options', { preHandler: app.authenticate }, async (req) => ok(await propertyOptions(req.user.tenantId)));

  /** Grid for one shape + size */
  app.get('/api/accounting/rapaport/prices', { preHandler: app.requirePermission('acc_rapaport_prices') }, async (req) => {
    const { shape, size } = req.query as { shape?: string; size?: string };
    if (!shape || !size) return ok({ cells: [] });
    const cells = await db.select().from(R).where(and(eq(R.tenantId, req.user.tenantId), eq(R.shape, shape), eq(R.size, size)));
    return ok({ cells: cells.map((c) => ({ color: c.color, clarity: c.clarity, price: Number(c.price), additionalBack: Number(c.additionalBack) })) });
  });

  /** Inline grid save (upsert each cell for every selected size) */
  app.put('/api/accounting/rapaport/prices', { preHandler: app.requirePermission('acc_rapaport_prices', 'update') }, async (req) => {
    const body = parse(rapaportGridSchema, req.body);
    let saved = 0;
    for (const size of body.sizes)
      for (const c of body.cells) {
        await db
          .insert(R)
          .values({ tenantId: req.user.tenantId, shape: body.shape, size, color: c.color, clarity: c.clarity, price: s4(c.price ?? 0), additionalBack: s4(c.additionalBack ?? 0) })
          .onConflictDoUpdate({ target: [R.tenantId, R.shape, R.size, R.color, R.clarity], set: { ...(c.price !== undefined ? { price: s4(c.price) } : {}), ...(c.additionalBack !== undefined ? { additionalBack: s4(c.additionalBack) } : {}), updatedAt: new Date() } });
        saved++;
      }
    return ok({ saved }, 'Prices saved');
  });

  /** Set / add / subtract a value across shapes × sizes (all colors × clarities unless restricted) */
  app.post('/api/accounting/rapaport/prices/apply', { preHandler: app.requirePermission('acc_rapaport_prices', 'update') }, async (req) => {
    const body = parse(rapaportSetSchema, req.body);
    const o = await propertyOptions(req.user.tenantId);
    const colors = body.colors?.length ? body.colors : o.colors.map((c) => c.value);
    const clarities = body.clarities?.length ? body.clarities : o.clarities.map((c) => c.value);
    let touched = 0;
    for (const shape of body.shapes)
      for (const size of body.sizes)
        for (const color of colors)
          for (const clarity of clarities) {
            const priceExpr = body.mode === 'set' ? sql`${s4(body.value)}` : body.mode === 'add' ? sql`${R.price} + ${s4(body.value)}` : sql`greatest(${R.price} - ${s4(body.value)}, 0)`;
            await db
              .insert(R)
              .values({ tenantId: req.user.tenantId, shape, size, color, clarity, price: s4(Math.max(0, body.mode === 'subtract' ? 0 : body.value)) })
              .onConflictDoUpdate({ target: [R.tenantId, R.shape, R.size, R.color, R.clarity], set: { price: priceExpr, updatedAt: new Date() } });
            touched++;
          }
    return ok({ touched }, `${touched} cells updated`);
  });

  app.post('/api/accounting/rapaport/prices/copy', { preHandler: app.requirePermission('acc_rapaport_prices', 'update') }, async (req) => {
    const body = parse(rapaportCopySchema, req.body);
    const src = await db.select().from(R).where(and(eq(R.tenantId, req.user.tenantId), eq(R.shape, body.shape), eq(R.size, body.fromSize)));
    if (!src.length) throw validation('No prices found for the source size');
    for (const c of src) await db.insert(R).values({ tenantId: req.user.tenantId, shape: body.shape, size: body.toSize, color: c.color, clarity: c.clarity, price: c.price, additionalBack: c.additionalBack }).onConflictDoUpdate({ target: [R.tenantId, R.shape, R.size, R.color, R.clarity], set: { price: c.price, additionalBack: c.additionalBack, updatedAt: new Date() } });
    return ok({ copied: src.length }, `${src.length} prices copied`);
  });

  app.delete('/api/accounting/rapaport/prices', { preHandler: app.requirePermission('acc_rapaport_prices', 'delete') }, async (req) => {
    const { shape, sizes } = z.object({ shape: z.string(), sizes: z.array(z.string()).min(1) }).parse(req.body);
    const r = await db.delete(R).where(and(eq(R.tenantId, req.user.tenantId), eq(R.shape, shape), inArray(R.size, sizes))).returning({ id: R.id });
    return ok({ deleted: r.length }, `${r.length} prices deleted`);
  });

  /** Sizes that already have prices for a shape (for "existing range" pickers) */
  app.get('/api/accounting/rapaport/sizes', { preHandler: app.authenticate }, async (req) => {
    const { shape } = req.query as { shape?: string };
    const rows = await db.selectDistinct({ size: R.size }).from(R).where(and(eq(R.tenantId, req.user.tenantId), shape ? eq(R.shape, shape) : undefined)).orderBy(asc(R.size));
    return ok(rows.map((r) => r.size));
  });

  /* ---- Additional back by property value ---- */
  app.get('/api/accounting/rapaport/additional-back', { preHandler: app.requirePermission('acc_rapaport_additional_back') }, async (req) => {
    const { shape, size } = req.query as { shape?: string; size?: string };
    const o = await propertyOptions(req.user.tenantId);
    const rows = shape && size ? await db.select().from(AB).where(and(eq(AB.tenantId, req.user.tenantId), eq(AB.shape, shape), eq(AB.size, size))) : [];
    return ok({ fields: o.additionalBackFields, values: rows.map((r) => ({ fieldName: r.fieldName, optionValue: r.optionValue, backPercent: Number(r.backPercent) })) });
  });
  app.put('/api/accounting/rapaport/additional-back', { preHandler: app.requirePermission('acc_rapaport_additional_back', 'update') }, async (req) => {
    const body = parse(rapaportAdditionalBackSchema, req.body);
    for (const size of body.sizes) for (const v of body.values) await db.insert(AB).values({ tenantId: req.user.tenantId, shape: body.shape, size, fieldName: v.fieldName, optionValue: v.optionValue, backPercent: s4(v.backPercent) }).onConflictDoUpdate({ target: [AB.tenantId, AB.shape, AB.size, AB.fieldName, AB.optionValue], set: { backPercent: s4(v.backPercent), updatedAt: new Date() } });
    return ok(null, 'Additional back saved');
  });

  /** Price lookup for a stone: list $/ct + grid back + property backs → net $/ct */
  app.get('/api/accounting/rapaport/quote', { preHandler: app.authenticate }, async (req) => {
    const { shape, size, color, clarity, props } = req.query as Record<string, string | undefined>;
    if (!shape || !size || !color || !clarity) throw validation('shape, size, color and clarity are required');
    const [cell] = await db.select().from(R).where(and(eq(R.tenantId, req.user.tenantId), eq(R.shape, shape), eq(R.size, size), eq(R.color, color), eq(R.clarity, clarity)));
    if (!cell) return ok({ found: false });
    const extra = props ? JSON.parse(props) as Record<string, string> : {};
    const backs = Object.keys(extra).length ? await db.select().from(AB).where(and(eq(AB.tenantId, req.user.tenantId), eq(AB.shape, shape), eq(AB.size, size), inArray(AB.fieldName, Object.keys(extra)))) : [];
    const propBack = backs.filter((b) => extra[b.fieldName] === b.optionValue).reduce((s, b) => s + Number(b.backPercent), 0);
    const totalBack = Number(cell.additionalBack) + propBack;
    const list = Number(cell.price);
    return ok({ found: true, listPrice: list, gridBack: Number(cell.additionalBack), propertyBack: propBack, totalBack, netPerCarat: list * (1 - totalBack / 100) });
  });

  /* ---- Barcode / label settings ---- */
  app.get('/api/accounting/masters/barcode-settings', { preHandler: app.authenticate }, async (req) => {
    const rows = await db.select().from(schema.barcodeSettings).where(eq(schema.barcodeSettings.tenantId, req.user.tenantId));
    return ok(rows.map((r) => ({ stockType: r.stockType, ...(r.config as any) })));
  });
  app.put('/api/accounting/masters/barcode-settings', { preHandler: app.requirePermission('acc_product_barcode_settings', 'update') }, async (req) => {
    const { stockType, ...config } = z.object({ stockType: z.string() }).passthrough().parse(req.body);
    await db.insert(schema.barcodeSettings).values({ tenantId: req.user.tenantId, stockType, config }).onConflictDoUpdate({ target: [schema.barcodeSettings.tenantId, schema.barcodeSettings.stockType], set: { config, updatedAt: new Date() } });
    return ok(null, 'Barcode settings saved');
  });
}
