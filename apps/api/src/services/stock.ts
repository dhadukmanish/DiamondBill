import { and, asc, eq, gt, sql } from 'drizzle-orm';
import { db, schema } from '../db/client';
import { validation } from '../lib/errors';

/**
 * Stock engine — the only place that writes stock_lots / stock_movements / stock_balances.
 *
 *  stockIn   → creates a FIFO lot + `in`-type movement, bumps balance
 *  stockOut  → consumes lots FIFO (oldest first), records COGS value, bumps balance
 *  memoOut/memoIn → quantity leaves/returns on approval without cost consumption
 *  reverse   → undo every movement of a reference (used when a document is cancelled/deleted)
 *
 * All functions accept an optional transaction (`tx`) so callers can wrap a whole document.
 */

type Tx = typeof db;
export interface StockKey { tenantId: string; firmId: string; branchId: string; productItemId: string }
export interface StockRef { refType: string; refId?: string | null; refNumber?: string | null; note?: string | null; createdBy?: string | null }
export type InKind = 'in' | 'adjust_in' | 'transfer_in';
export type OutKind = 'out' | 'adjust_out' | 'transfer_out';

const n = (v: unknown) => Number(v ?? 0);
const s4 = (v: number) => v.toFixed(4);

async function ensureBalance(tx: Tx, k: StockKey) {
  await tx
    .insert(schema.stockBalances)
    .values({ tenantId: k.tenantId, firmId: k.firmId, branchId: k.branchId, productItemId: k.productItemId })
    .onConflictDoNothing({ target: [schema.stockBalances.firmId, schema.stockBalances.branchId, schema.stockBalances.productItemId] });
}

async function bump(tx: Tx, k: StockKey, delta: { totalIn?: number; totalOut?: number; qtyOnHand?: number; memoOut?: number; memoIn?: number; soCommitted?: number; poCommitted?: number; value?: number }) {
  await ensureBalance(tx, k);
  const b = schema.stockBalances;
  await tx
    .update(b)
    .set({
      totalIn: sql`${b.totalIn} + ${s4(delta.totalIn ?? 0)}`,
      totalOut: sql`${b.totalOut} + ${s4(delta.totalOut ?? 0)}`,
      qtyOnHand: sql`${b.qtyOnHand} + ${s4(delta.qtyOnHand ?? 0)}`,
      memoOut: sql`${b.memoOut} + ${s4(delta.memoOut ?? 0)}`,
      memoIn: sql`${b.memoIn} + ${s4(delta.memoIn ?? 0)}`,
      soCommitted: sql`${b.soCommitted} + ${s4(delta.soCommitted ?? 0)}`,
      poCommitted: sql`${b.poCommitted} + ${s4(delta.poCommitted ?? 0)}`,
      value: sql`${b.value} + ${s4(delta.value ?? 0)}`,
      updatedAt: new Date(),
    })
    .where(and(eq(b.firmId, k.firmId), eq(b.branchId, k.branchId), eq(b.productItemId, k.productItemId)));
}

/** Add stock: creates a cost layer. */
export async function stockIn(k: StockKey, p: { date: string; qty: number; rate: number; kind?: InKind } & StockRef, tx: Tx = db) {
  if (p.qty <= 0) throw validation('Quantity must be greater than zero');
  const [lot] = await tx
    .insert(schema.stockLots)
    .values({ tenantId: k.tenantId, firmId: k.firmId, branchId: k.branchId, productItemId: k.productItemId, lotDate: p.date, qtyIn: s4(p.qty), qtyRemaining: s4(p.qty), rate: s4(p.rate), sourceType: p.refType, sourceId: p.refId ?? null })
    .returning();
  const value = p.qty * p.rate;
  const [mv] = await tx
    .insert(schema.stockMovements)
    .values({ tenantId: k.tenantId, firmId: k.firmId, branchId: k.branchId, productItemId: k.productItemId, movementDate: p.date, kind: p.kind ?? 'in', qty: s4(p.qty), rate: s4(p.rate), value: s4(value), refType: p.refType, refId: p.refId ?? null, refNumber: p.refNumber ?? null, allocations: [{ lotId: lot.id, qty: p.qty, rate: p.rate }], note: p.note ?? null, createdBy: p.createdBy ?? null })
    .returning();
  await bump(tx, k, { totalIn: p.qty, qtyOnHand: p.qty, value });
  return { movement: mv, lot, value };
}

/** Remove stock FIFO. Returns COGS value and the lot allocations. */
export async function stockOut(k: StockKey, p: { date: string; qty: number; kind?: OutKind; allowNegative?: boolean; rateOverride?: number } & StockRef, tx: Tx = db) {
  if (p.qty <= 0) throw validation('Quantity must be greater than zero');
  const lots = await tx
    .select()
    .from(schema.stockLots)
    .where(and(eq(schema.stockLots.firmId, k.firmId), eq(schema.stockLots.branchId, k.branchId), eq(schema.stockLots.productItemId, k.productItemId), gt(schema.stockLots.qtyRemaining, '0')))
    .orderBy(asc(schema.stockLots.lotDate), asc(schema.stockLots.createdAt));
  let remaining = p.qty;
  let value = 0;
  const allocations: { lotId: string; qty: number; rate: number }[] = [];
  for (const lot of lots) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, n(lot.qtyRemaining));
    if (take <= 0) continue;
    const rate = p.rateOverride ?? n(lot.rate);
    allocations.push({ lotId: lot.id, qty: take, rate });
    value += take * rate;
    remaining -= take;
    await tx.update(schema.stockLots).set({ qtyRemaining: s4(n(lot.qtyRemaining) - take) }).where(eq(schema.stockLots.id, lot.id));
  }
  if (remaining > 0.00005) {
    if (!p.allowNegative) throw validation(`Insufficient stock: ${p.qty} requested, ${(p.qty - remaining).toFixed(4)} available`);
    // negative stock: cost at last known rate (or override)
    const lastRate = p.rateOverride ?? (allocations.length ? allocations[allocations.length - 1].rate : await lastRateFor(k, tx));
    allocations.push({ lotId: '', qty: remaining, rate: lastRate });
    value += remaining * lastRate;
  }
  const avgRate = p.qty ? value / p.qty : 0;
  const [mv] = await tx
    .insert(schema.stockMovements)
    .values({ tenantId: k.tenantId, firmId: k.firmId, branchId: k.branchId, productItemId: k.productItemId, movementDate: p.date, kind: p.kind ?? 'out', qty: s4(p.qty), rate: s4(avgRate), value: s4(value), refType: p.refType, refId: p.refId ?? null, refNumber: p.refNumber ?? null, allocations, note: p.note ?? null, createdBy: p.createdBy ?? null })
    .returning();
  await bump(tx, k, { totalOut: p.qty, qtyOnHand: -p.qty, value: -value });
  return { movement: mv, value, avgRate, allocations };
}

/** Memo (approval) out/in: quantity moves but cost layers stay untouched. */
export async function memoOut(k: StockKey, p: { date: string; qty: number } & StockRef, tx: Tx = db) {
  const [mv] = await tx.insert(schema.stockMovements).values({ tenantId: k.tenantId, firmId: k.firmId, branchId: k.branchId, productItemId: k.productItemId, movementDate: p.date, kind: 'memo_out', qty: s4(p.qty), refType: p.refType, refId: p.refId ?? null, refNumber: p.refNumber ?? null, note: p.note ?? null, createdBy: p.createdBy ?? null }).returning();
  await bump(tx, k, { memoOut: p.qty });
  return mv;
}
export async function memoIn(k: StockKey, p: { date: string; qty: number } & StockRef, tx: Tx = db) {
  const [mv] = await tx.insert(schema.stockMovements).values({ tenantId: k.tenantId, firmId: k.firmId, branchId: k.branchId, productItemId: k.productItemId, movementDate: p.date, kind: 'memo_in', qty: s4(p.qty), refType: p.refType, refId: p.refId ?? null, refNumber: p.refNumber ?? null, note: p.note ?? null, createdBy: p.createdBy ?? null }).returning();
  await bump(tx, k, { memoOut: -p.qty, memoIn: p.qty });
  return mv;
}

/** Purchase Memo commitment: qty "on order" — informational only, doesn't touch qtyOnHand. */
export async function poCommit(k: StockKey, p: { date: string; qty: number } & StockRef, tx: Tx = db) {
  const [mv] = await tx.insert(schema.stockMovements).values({ tenantId: k.tenantId, firmId: k.firmId, branchId: k.branchId, productItemId: k.productItemId, movementDate: p.date, kind: 'po_commit', qty: s4(p.qty), refType: p.refType, refId: p.refId ?? null, refNumber: p.refNumber ?? null, note: p.note ?? null, createdBy: p.createdBy ?? null }).returning();
  await bump(tx, k, { poCommitted: p.qty });
  return mv;
}
export async function poRelease(k: StockKey, p: { date: string; qty: number } & StockRef, tx: Tx = db) {
  const [mv] = await tx.insert(schema.stockMovements).values({ tenantId: k.tenantId, firmId: k.firmId, branchId: k.branchId, productItemId: k.productItemId, movementDate: p.date, kind: 'po_release', qty: s4(p.qty), refType: p.refType, refId: p.refId ?? null, refNumber: p.refNumber ?? null, note: p.note ?? null, createdBy: p.createdBy ?? null }).returning();
  await bump(tx, k, { poCommitted: -p.qty });
  return mv;
}

/** Sales Memo commitment: qty "on order" for a customer — informational only, doesn't touch qtyOnHand. */
export async function soCommit(k: StockKey, p: { date: string; qty: number } & StockRef, tx: Tx = db) {
  const [mv] = await tx.insert(schema.stockMovements).values({ tenantId: k.tenantId, firmId: k.firmId, branchId: k.branchId, productItemId: k.productItemId, movementDate: p.date, kind: 'so_commit', qty: s4(p.qty), refType: p.refType, refId: p.refId ?? null, refNumber: p.refNumber ?? null, note: p.note ?? null, createdBy: p.createdBy ?? null }).returning();
  await bump(tx, k, { soCommitted: p.qty });
  return mv;
}
export async function soRelease(k: StockKey, p: { date: string; qty: number } & StockRef, tx: Tx = db) {
  const [mv] = await tx.insert(schema.stockMovements).values({ tenantId: k.tenantId, firmId: k.firmId, branchId: k.branchId, productItemId: k.productItemId, movementDate: p.date, kind: 'so_release', qty: s4(p.qty), refType: p.refType, refId: p.refId ?? null, refNumber: p.refNumber ?? null, note: p.note ?? null, createdBy: p.createdBy ?? null }).returning();
  await bump(tx, k, { soCommitted: -p.qty });
  return mv;
}

/** Undo all movements of a reference document (restores lots and balances). */
export async function reverseRef(tenantId: string, refType: string, refId: string, tx: Tx = db) {
  const moves = await tx.select().from(schema.stockMovements).where(and(eq(schema.stockMovements.tenantId, tenantId), eq(schema.stockMovements.refType, refType), eq(schema.stockMovements.refId, refId)));
  for (const m of moves) {
    const k: StockKey = { tenantId, firmId: m.firmId, branchId: m.branchId, productItemId: m.productItemId };
    const q = n(m.qty), v = n(m.value);
    switch (m.kind) {
      case 'in': case 'adjust_in': case 'transfer_in': {
        // remove the lot (must not have been consumed)
        for (const a of m.allocations) {
          const [lot] = await tx.select().from(schema.stockLots).where(eq(schema.stockLots.id, a.lotId));
          if (lot && n(lot.qtyRemaining) < n(lot.qtyIn) - 0.00005) throw validation('Cannot reverse: stock from this document has already been consumed');
          await tx.delete(schema.stockLots).where(eq(schema.stockLots.id, a.lotId));
        }
        await bump(tx, k, { totalIn: -q, qtyOnHand: -q, value: -v });
        break;
      }
      case 'out': case 'adjust_out': case 'transfer_out': {
        for (const a of m.allocations) if (a.lotId) await tx.update(schema.stockLots).set({ qtyRemaining: sql`${schema.stockLots.qtyRemaining} + ${s4(a.qty)}` }).where(eq(schema.stockLots.id, a.lotId));
        await bump(tx, k, { totalOut: -q, qtyOnHand: q, value: v });
        break;
      }
      case 'memo_out': await bump(tx, k, { memoOut: -q }); break;
      case 'memo_in': await bump(tx, k, { memoOut: q, memoIn: -q }); break;
      case 'po_commit': await bump(tx, k, { poCommitted: -q }); break;
      case 'po_release': await bump(tx, k, { poCommitted: q }); break;
      case 'so_commit': await bump(tx, k, { soCommitted: -q }); break;
      case 'so_release': await bump(tx, k, { soCommitted: q }); break;
    }
    await tx.delete(schema.stockMovements).where(eq(schema.stockMovements.id, m.id));
  }
  return moves.length;
}

export async function getBalance(k: StockKey, tx: Tx = db) {
  const [b] = await tx.select().from(schema.stockBalances).where(and(eq(schema.stockBalances.firmId, k.firmId), eq(schema.stockBalances.branchId, k.branchId), eq(schema.stockBalances.productItemId, k.productItemId)));
  return { qtyOnHand: n(b?.qtyOnHand), memoOut: n(b?.memoOut), memoIn: n(b?.memoIn), soCommitted: n(b?.soCommitted), poCommitted: n(b?.poCommitted), value: n(b?.value), totalIn: n(b?.totalIn), totalOut: n(b?.totalOut), saleable: n(b?.qtyOnHand) - n(b?.memoOut) - n(b?.soCommitted) };
}

async function lastRateFor(k: StockKey, tx: Tx) {
  const [m] = await tx.select({ rate: schema.stockMovements.rate }).from(schema.stockMovements).where(and(eq(schema.stockMovements.productItemId, k.productItemId), eq(schema.stockMovements.kind, 'in'))).orderBy(sql`${schema.stockMovements.createdAt} desc`).limit(1);
  if (m) return n(m.rate);
  const [it] = await tx.select({ p: schema.productItems.purchasePrice }).from(schema.productItems).where(eq(schema.productItems.id, k.productItemId));
  return n(it?.p);
}
