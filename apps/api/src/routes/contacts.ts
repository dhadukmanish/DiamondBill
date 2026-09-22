import type { FastifyInstance } from 'fastify';
import { and, asc, desc, eq, ilike, or, sql, count, inArray } from 'drizzle-orm';
import { db, schema } from '../db/client';
import { contactSchema, CONTACT_TYPE_LABELS } from '@diamondbill/shared';
import { parse } from '../lib/validate';
import { notFound, validation } from '../lib/errors';
import { ok } from '../lib/respond';
import { parseListQuery } from '../lib/list';
import { logActivity } from '../services/activity';
import { getSettings } from '../services/settings';

const SORTABLE: Record<string, any> = {
  created_at: schema.contacts.createdAt,
  createdAt: schema.contacts.createdAt,
  companyName: schema.contacts.companyName,
  contactType: schema.contacts.contactType,
  email: schema.contacts.email,
  phone: schema.contacts.phone,
  serialNo: schema.contacts.serialNo,
};

export function maskPhone(p?: string | null) {
  if (!p) return p ?? null;
  if (p.length <= 6) return p;
  return p.slice(0, 3) + 'X'.repeat(p.length - 6) + p.slice(-3);
}

export function contactDisplay(c: { serialNo: number; companyName: string; contactPerson?: string | null; phone?: string | null; phoneCode?: string | null; email?: string | null; gstin?: string | null }, fmt: string) {
  return fmt
    .replace(/##Serial No##/g, String(c.serialNo))
    .replace(/##Company Name##/g, c.companyName ?? '')
    .replace(/##Person Name##/g, c.contactPerson ?? '')
    .replace(/##Mobile No##/g, c.phone ? `${c.phoneCode ?? ''} ${c.phone}`.trim() : '')
    .replace(/##Email##/g, c.email ?? '')
    .replace(/##GST No##/g, c.gstin ?? '')
    .replace(/\(\s*\)/g, '')
    .replace(/,\s*$/g, '')
    .trim();
}

export async function contactRoutes(app: FastifyInstance) {
  app.get('/api/crm/contacts', { preHandler: app.requirePermission('crm_contacts') }, async (req) => {
    const q = parseListQuery(req.query as any);
    const { contactType } = req.query as { contactType?: string | string[] };
    const types = contactType ? (Array.isArray(contactType) ? contactType : [contactType]) : undefined;
    const where = and(
      eq(schema.contacts.tenantId, req.user.tenantId),
      q.firmId ? eq(schema.contacts.firmId, q.firmId) : undefined,
      types?.length ? inArray(schema.contacts.contactType, types) : undefined,
      q.search
        ? or(
            ilike(schema.contacts.companyName, `%${q.search}%`),
            ilike(schema.contacts.contactPerson, `%${q.search}%`),
            ilike(schema.contacts.email, `%${q.search}%`),
            ilike(schema.contacts.phone, `%${q.search}%`),
            sql`${schema.contacts.serialNo}::text ilike ${'%' + q.search + '%'}`,
          )
        : undefined,
    );
    const [{ total }] = await db.select({ total: count() }).from(schema.contacts).where(where);
    const col = SORTABLE[q.sortBy ?? 'created_at'] ?? schema.contacts.createdAt;
    const rows = await db
      .select()
      .from(schema.contacts)
      .where(where)
      .orderBy(q.sortOrder === 'asc' ? asc(col) : desc(col))
      .limit(q.limit)
      .offset((q.page - 1) * q.limit);
    return ok(
      { rows: rows.map((r) => ({ ...r, phoneMasked: maskPhone(r.phone), contactTypeLabel: CONTACT_TYPE_LABELS[r.contactType as keyof typeof CONTACT_TYPE_LABELS] })), total: Number(total), page: q.page, pageSize: q.limit },
      'Contacts retrieved successfully',
    );
  });

  app.get('/api/crm/contacts/next-serial', { preHandler: app.authenticate }, async (req) => {
    const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${schema.contacts.serialNo}),0)` }).from(schema.contacts).where(eq(schema.contacts.tenantId, req.user.tenantId));
    return ok({ serialNo: Number(max) + 1 });
  });

  app.get('/api/crm/contacts/:id', { preHandler: app.requirePermission('crm_contacts') }, async (req) => {
    const { id } = req.params as { id: string };
    const [row] = await db.select().from(schema.contacts).where(and(eq(schema.contacts.id, id), eq(schema.contacts.tenantId, req.user.tenantId)));
    if (!row) throw notFound('Contact');
    return ok(row, 'Contact retrieved successfully');
  });

  app.post('/api/crm/contacts', { preHandler: app.requirePermission('crm_contacts', 'create') }, async (req) => {
    const body = parse(contactSchema, req.body);
    const settings = await getSettings(req.user.tenantId);
    if (settings.contactIsFirmwise && !body.firmId) throw validation('Firm is required');
    if (!settings.allowRepeatedMobile && body.phone) {
      const dup = await db.select({ id: schema.contacts.id }).from(schema.contacts).where(and(eq(schema.contacts.tenantId, req.user.tenantId), eq(schema.contacts.phone, body.phone))).limit(1);
      if (dup.length) throw validation('A contact with this mobile number already exists');
    }
    const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${schema.contacts.serialNo}),0)` }).from(schema.contacts).where(eq(schema.contacts.tenantId, req.user.tenantId));
    const serialNo = body.serialNo ? Number(body.serialNo) : Number(max) + 1;
    const [row] = await db
      .insert(schema.contacts)
      .values({ ...toRow(body), serialNo, tenantId: req.user.tenantId, contactName: body.companyName, createdBy: req.user.id })
      .returning();
    await logActivity(req, 'contact', row.id, 'created', `Contact "${row.companyName}" created`);
    return ok(row, 'Contact created successfully');
  });

  app.put('/api/crm/contacts/:id', { preHandler: app.requirePermission('crm_contacts', 'update') }, async (req) => {
    const { id } = req.params as { id: string };
    const body = parse(contactSchema.partial(), req.body);
    const [row] = await db
      .update(schema.contacts)
      .set({ ...toRow(body as any), ...(body.companyName ? { contactName: body.companyName } : {}), updatedBy: req.user.id, updatedAt: new Date() })
      .where(and(eq(schema.contacts.id, id), eq(schema.contacts.tenantId, req.user.tenantId)))
      .returning();
    if (!row) throw notFound('Contact');
    await logActivity(req, 'contact', row.id, 'updated', `Contact "${row.companyName}" updated`);
    return ok(row, 'Contact updated successfully');
  });

  app.delete('/api/crm/contacts/:id', { preHandler: app.requirePermission('crm_contacts', 'delete') }, async (req) => {
    const { id } = req.params as { id: string };
    const r = await db.delete(schema.contacts).where(and(eq(schema.contacts.id, id), eq(schema.contacts.tenantId, req.user.tenantId))).returning({ id: schema.contacts.id });
    if (!r.length) throw notFound('Contact');
    return ok(null, 'Contact deleted successfully');
  });

  /** Lookup used by document forms: ?contactType=customer&contactType=customer_vendor */
  app.get('/api/crm/lookup/contacts', { preHandler: app.authenticate }, async (req) => {
    const { contactType, search, limit } = req.query as { contactType?: string | string[]; search?: string; limit?: string };
    const types = contactType ? (Array.isArray(contactType) ? contactType : [contactType]) : undefined;
    const settings = await getSettings(req.user.tenantId);
    const rows = await db
      .select()
      .from(schema.contacts)
      .where(and(eq(schema.contacts.tenantId, req.user.tenantId), types?.length ? inArray(schema.contacts.contactType, types) : undefined, search ? or(ilike(schema.contacts.companyName, `%${search}%`), ilike(schema.contacts.phone, `%${search}%`)) : undefined))
      .orderBy(asc(schema.contacts.serialNo))
      .limit(Math.min(1000, Number(limit ?? 200)));
    return ok(rows.map((c) => ({ id: c.id, contactType: c.contactType, companyName: c.companyName, phone: c.phone, phoneCode: c.phoneCode, email: c.email, serialNo: c.serialNo, display: contactDisplay(c, settings.contactDisplayFormat), billingAddress: c.billingAddress, shippingAddresses: c.shippingAddresses, paymentTermDays: c.paymentTermDays, paymentTermName: c.paymentTermName, gstin: c.gstin })));
  });

  app.get('/api/crm/lookup/contact-display-format', { preHandler: app.authenticate }, async (req) => {
    const s = await getSettings(req.user.tenantId);
    return ok({ format: s.contactDisplayFormat });
  });
}

function toRow(b: Record<string, any>) {
  const { discountValue, brokerageValue, creditLimitAmount, email, ...rest } = b;
  return {
    ...rest,
    email: email || null,
    discountValue: discountValue == null ? null : String(discountValue),
    brokerageValue: brokerageValue == null ? null : String(brokerageValue),
    creditLimitAmount: creditLimitAmount == null ? null : String(creditLimitAmount),
  } as any;
}
