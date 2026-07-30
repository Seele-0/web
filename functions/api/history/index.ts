import type { Env } from "../../_lib/env";
import { errorResponse, json } from "../../_lib/http";

type HistoryRow = {
  order_date: string;
  share_count: number;
  revision: number;
  locked: number;
  total_quantity: number;
  total_cents: number;
};

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const result = await env.DB.prepare(
      `SELECT o.order_date, o.share_count, o.revision, o.locked,
              COALESCE(SUM(c.quantity), 0) AS total_quantity,
              COALESCE(SUM(c.quantity * m.price_cents), 0) AS total_cents
       FROM daily_orders o
       LEFT JOIN order_contributions c ON c.order_date = o.order_date AND c.quantity > 0
       LEFT JOIN menu_items m ON m.id = c.menu_item_id
       GROUP BY o.order_date, o.share_count, o.revision, o.locked
       ORDER BY o.order_date DESC`,
    ).all<HistoryRow>();
    return json({
      dates: result.results.map((row) => ({
        orderDate: row.order_date,
        shareCount: row.share_count,
        revision: row.revision,
        locked: Boolean(row.locked),
        totalQuantity: row.total_quantity,
        totalCents: row.total_cents,
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
};
