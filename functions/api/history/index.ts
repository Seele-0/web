import { runAutomaticLockFallback } from "../../_lib/automatic-lock";
import type { Env } from "../../_lib/env";
import { errorResponse, json } from "../../_lib/http";
import { getOrderSlotFromStorageId } from "../../../src/domain/meal-period";

type HistoryRow = { order_date: string; share_count: number; revision: number; locked: number; total_quantity: number; total_cents: number };

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    // Repair legacy empty rows before resolving the latest slot, so a real
    // date-only dinner order is never shadowed by an empty slot record.
    await env.DB.prepare(
      `DELETE FROM daily_orders
       WHERE locked = 1
         AND NOT EXISTS (
           SELECT 1 FROM order_contributions
           WHERE order_date = daily_orders.order_date AND quantity > 0
         )`,
    ).run();
    await runAutomaticLockFallback(env.DB);
    const result = await env.DB.prepare(
      `SELECT o.order_date, o.share_count, o.revision, o.locked,
              COALESCE(SUM(c.quantity), 0) AS total_quantity,
              COALESCE(SUM(c.quantity * i.price_cents), 0) AS total_cents
       FROM daily_orders o
       LEFT JOIN order_contributions c ON c.order_date = o.order_date AND c.quantity > 0
       LEFT JOIN order_items i ON i.order_date = c.order_date AND i.menu_item_id = c.menu_item_id
       GROUP BY o.order_date, o.share_count, o.revision, o.locked
       HAVING COALESCE(SUM(c.quantity), 0) > 0
       ORDER BY o.order_date DESC`,
    ).all<HistoryRow>();
    return json({ dates: result.results.map((row) => ({ ...getOrderSlotFromStorageId(row.order_date), shareCount: row.share_count, revision: row.revision, locked: Boolean(row.locked), totalQuantity: row.total_quantity, totalCents: row.total_cents })) });
  } catch (error) { return errorResponse(error); }
};
