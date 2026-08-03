import { getPreviousBusinessDate, getShanghaiBusinessDate, getShanghaiDateTimeParts } from "./date";
import type { MealPeriod } from "../../src/domain/meal-period";
import { resolveOrderStorageId } from "./order-repository";

export type AutomaticLockSource = "cron" | "request_fallback";
export type OrderSlot = { orderDate: string; mealPeriod: MealPeriod };

export type AutomaticLockInput = OrderSlot & {
  now: string;
  source: AutomaticLockSource;
  executionToken: string;
};

function markerOwnershipCondition(): string {
  return `EXISTS (
    SELECT 1 FROM automatic_order_locks
    WHERE order_date = ? AND execution_token = ?
  )`;
}

/** The most recent lunch/dinner cutoff that has passed in Asia/Shanghai. */
export function getLatestLockableOrderSlot(now = new Date()): OrderSlot {
  const { hour, minute } = getShanghaiDateTimeParts(now);
  const today = getShanghaiBusinessDate(now);
  if (hour > 21 || (hour === 21 && minute >= 0)) return { orderDate: today, mealPeriod: "dinner" };
  if (hour > 15 || (hour === 15 && minute >= 0)) return { orderDate: today, mealPeriod: "lunch" };
  return { orderDate: getPreviousBusinessDate(today), mealPeriod: "dinner" };
}

export async function ensureAutomaticLock(db: D1Database, input: AutomaticLockInput): Promise<boolean> {
  const storageId = await resolveOrderStorageId(db, input.orderDate, input.mealPeriod);
  const ownsMarker = markerOwnershipCondition();
  await db.batch([
    db.prepare(
      `INSERT OR IGNORE INTO automatic_order_locks
        (order_date, locked_at, source, execution_token)
       VALUES (?, ?, ?, ?)`,
    ).bind(storageId, input.now, input.source, input.executionToken),
    db.prepare(
      `INSERT INTO daily_orders (order_date, share_count, revision, locked, updated_at)
       SELECT ?, 1, 0, 0, ?
       WHERE ${ownsMarker}
       ON CONFLICT(order_date) DO NOTHING`,
    ).bind(storageId, input.now, storageId, input.executionToken),
    db.prepare(
      `UPDATE daily_orders
       SET locked = 1, revision = revision + 1, updated_at = ?
       WHERE order_date = ? AND ${ownsMarker}`,
    ).bind(input.now, storageId, storageId, input.executionToken),
    db.prepare(
      `INSERT INTO activity_log (order_date, action, details_json, created_at)
       SELECT ?, 'automatic_lock_order', json_object('source', ?, 'executionToken', ?, 'mealPeriod', ?), ?
       WHERE ${ownsMarker}`,
    ).bind(storageId, input.source, input.executionToken, input.mealPeriod, input.now, storageId, input.executionToken),
  ]);

  const marker = await db
    .prepare("SELECT execution_token FROM automatic_order_locks WHERE order_date = ?")
    .bind(storageId)
    .first<{ execution_token: string }>();
  return marker?.execution_token === input.executionToken;
}

export async function runAutomaticLockFallback(db: D1Database, now = new Date()): Promise<boolean> {
  const slot = getLatestLockableOrderSlot(now);
  return ensureAutomaticLock(db, {
    ...slot,
    now: now.toISOString(),
    source: "request_fallback",
    executionToken: `fallback-${now.getTime()}-${crypto.randomUUID()}`,
  });
}
