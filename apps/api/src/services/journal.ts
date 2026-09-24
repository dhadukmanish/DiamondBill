import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from '../db/client';
import { validation } from '../lib/errors';

/**
 * Double-entry journal — the only place that writes journal_entries / journal_lines.
 * Every posted trading document (Bill, Invoice, Credit/Debit Note, Payment) gets exactly one journal
 * entry, keyed by (tenantId, refType, refId). Cancelling/deleting a document reverses it by deleting
 * the entry outright (mirrors how services/stock.ts reverses stock movements).
 */

type Tx = typeof db;
const n = (v: unknown) => Number(v ?? 0);
const s4 = (v: number) => v.toFixed(4);

export interface JournalLineInput {
  accountId: string;
  debit?: number;
  credit?: number;
  contactId?: string | null;
  description?: string | null;
}

/** Post a balanced journal entry. Throws if debits ≠ credits (within a hundredth of a unit). */
export async function postJournal(
  tx: Tx,
  p: { tenantId: string; firmId: string; branchId?: string | null; date: string; refType: string; refId: string; refNumber?: string | null; description?: string; createdBy?: string | null; lines: JournalLineInput[] },
) {
  const lines = p.lines.filter((l) => Math.abs(n(l.debit) - n(l.credit)) > 0 || n(l.debit) > 0 || n(l.credit) > 0);
  const totalDebit = lines.reduce((s, l) => s + n(l.debit), 0);
  const totalCredit = lines.reduce((s, l) => s + n(l.credit), 0);
  if (!lines.length) return null;
  if (Math.abs(totalDebit - totalCredit) > 0.01) throw validation(`Journal is not balanced: debit ${totalDebit.toFixed(2)} ≠ credit ${totalCredit.toFixed(2)}`);
  const [entry] = await tx
    .insert(schema.journalEntries)
    .values({ tenantId: p.tenantId, firmId: p.firmId, branchId: p.branchId ?? null, entryDate: p.date, refType: p.refType, refId: p.refId, refNumber: p.refNumber ?? null, description: p.description ?? '', createdBy: p.createdBy ?? null })
    .returning();
  await tx.insert(schema.journalLines).values(
    lines.map((l, i) => ({ tenantId: p.tenantId, journalEntryId: entry.id, accountId: l.accountId, contactId: l.contactId ?? null, debit: s4(n(l.debit)), credit: s4(n(l.credit)), description: l.description ?? null, lineOrder: i })),
  );
  return entry;
}

/** Remove the journal entry for a document (used on cancel/delete). No-op if none exists. */
export async function reverseJournal(tx: Tx, tenantId: string, refType: string, refId: string) {
  await tx.delete(schema.journalEntries).where(and(eq(schema.journalEntries.tenantId, tenantId), eq(schema.journalEntries.refType, refType), eq(schema.journalEntries.refId, refId)));
}

/** Net balance of a ledger account (debit − credit for debit-nature accounts, flipped for credit-nature). */
export async function accountBalance(tenantId: string, accountId: string, nature: 'debit' | 'credit', firmId?: string) {
  const [row] = await db
    .select({ debit: sql<string>`coalesce(sum(${schema.journalLines.debit}),0)`, credit: sql<string>`coalesce(sum(${schema.journalLines.credit}),0)` })
    .from(schema.journalLines)
    .innerJoin(schema.journalEntries, eq(schema.journalEntries.id, schema.journalLines.journalEntryId))
    .where(and(eq(schema.journalLines.tenantId, tenantId), eq(schema.journalLines.accountId, accountId), firmId ? eq(schema.journalEntries.firmId, firmId) : undefined));
  const debit = n(row?.debit), credit = n(row?.credit);
  return nature === 'debit' ? debit - credit : credit - debit;
}

/** Outstanding balance for a contact's AR/AP sub-ledger (positive = they owe us / we owe them, per the account's nature). */
export async function contactBalance(tenantId: string, contactId: string, accountId: string, nature: 'debit' | 'credit') {
  const [row] = await db
    .select({ debit: sql<string>`coalesce(sum(${schema.journalLines.debit}),0)`, credit: sql<string>`coalesce(sum(${schema.journalLines.credit}),0)` })
    .from(schema.journalLines)
    .where(and(eq(schema.journalLines.tenantId, tenantId), eq(schema.journalLines.contactId, contactId), eq(schema.journalLines.accountId, accountId)));
  const debit = n(row?.debit), credit = n(row?.credit);
  return nature === 'debit' ? debit - credit : credit - debit;
}

/** Journal lines for a document's detail view, with account names. */
export async function journalForRef(tenantId: string, refType: string, refId: string) {
  const [entry] = await db.select().from(schema.journalEntries).where(and(eq(schema.journalEntries.tenantId, tenantId), eq(schema.journalEntries.refType, refType), eq(schema.journalEntries.refId, refId)));
  if (!entry) return { entry: null, lines: [] };
  const lines = await db
    .select({ id: schema.journalLines.id, accountId: schema.journalLines.accountId, accountName: schema.accounts.name, debit: schema.journalLines.debit, credit: schema.journalLines.credit, description: schema.journalLines.description })
    .from(schema.journalLines)
    .innerJoin(schema.accounts, eq(schema.accounts.id, schema.journalLines.accountId))
    .where(eq(schema.journalLines.journalEntryId, entry.id))
    .orderBy(schema.journalLines.lineOrder);
  return { entry, lines: lines.map((l) => ({ ...l, debit: n(l.debit), credit: n(l.credit) })) };
}
