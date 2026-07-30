import { getPreviousBusinessDate, getShanghaiBusinessDate, getShanghaiDateTimeParts } from "./date";

export type AutomaticLockSource = "cron" | "request_fallback";

export type AutomaticLockInput = {
  orderDate: string;
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

export function getLatestLockableShanghaiDate(now = new Date()): string {
  const { hour, minute } = getShanghaiDateTimeParts(now);
  const today = getShanghaiBusinessDate(now);
  return hour === 23 && minute >= 59 ? today : getPreviousBusinessDate(today);
}

export async function ensureAutomaticLock(db: D1Database, input: AutomaticLockInput): Promise<boolean> {
  const ownsMarker = markerOwnershipCondition();
  await db.batch([
    db.prepare(
      `INSERT OR IGNORE INTO automatic_order_locks
        (order_date, locked_at, source, execution_token)
       VALUES (?, ?, ?, ?)`,
    ).bind(input.orderDate, input.now, input.source, input.executionToken),
    db.prepare(
      `INSERT INTO daily_orders (order_date, share_count, revision, locked, updated_at)
       SELECT ?, 1, 0, 0, ?
       WHERE ${ownsMarker}
       ON CONFLICT(order_date) DO NOTHING`,
    ).bind(input.orderDate, input.now, input.orderDate, input.executionToken),
    db.prepare(
      `UPDATE daily_orders
       SET locked = 1, revision = revision + 1, updated_at = ?
       WHERE order_date = ? AND ${ownsMarker}`,
    ).bind(input.now, input.orderDate, input.orderDate, input.executionToken),
    db.prepare(
      `INSERT INTO activity_log (order_date, action, details_json, created_at)
       SELECT ?, 'automatic_lock_order', json_object('source', ?, 'executionToken', ?), ?
       WHERE ${ownsMarker}`,
    ).bind(input.orderDate, input.source, input.executionToken, input.now, input.orderDate, input.executionToken),
  ]);

  const marker = await db
    .prepare("SELECT execution_token FROM automatic_order_locks WHERE order_date = ?")
    .bind(input.orderDate)
    .first<{ execution_token: string }>();
  return marker?.execution_token === input.executionToken;
}

export async function runAutomaticLockFallback(db: D1Database, now = new Date()): Promise<boolean> {
  return ensureAutomaticLock(db, {
    orderDate: getLatestLockableShanghaiDate(now),
    now: now.toISOString(),
    source: "request_fallback",
    executionToken: `fallback-${now.getTime()}-${crypto.randomUUID()}`,
  });
}
