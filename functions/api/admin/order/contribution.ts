import { verifyAdminRequest } from "../../../_lib/admin-session";
import type { Env } from "../../../_lib/env";
import { errorResponse, HttpError, json, readJson } from "../../../_lib/http";
import { getOrderSnapshot } from "../../../_lib/order-repository";

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await verifyAdminRequest(request, env);
    const input = await readJson<Record<string, unknown>>(request);
    const { orderDate, menuItemId, deviceId, displayName, quantity } = input;
    const normalizedName = typeof displayName === "string" ? displayName.trim() : "";
    if (typeof orderDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(orderDate) || typeof menuItemId !== "string" || typeof deviceId !== "string" || normalizedName.length < 1 || normalizedName.length > 30 || !Number.isInteger(quantity) || (quantity as number) < 0 || (quantity as number) > 999) {
      throw new HttpError(400, "invalid_contribution", "贡献修正参数无效");
    }
    const existingOrder = await env.DB.prepare("SELECT locked FROM daily_orders WHERE order_date = ?").bind(orderDate).first<{ locked: number }>();
    if (existingOrder?.locked) throw new HttpError(409, "order_locked", "请先解锁该订单再修正贡献");
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO daily_orders (order_date, share_count, revision, locked, updated_at) VALUES (?, 1, 0, 0, ?) ON CONFLICT(order_date) DO NOTHING").bind(orderDate, now),
      env.DB.prepare(
        `INSERT INTO order_items
          (order_date, menu_item_id, name, price_cents, sort_order, created_at, updated_at)
         SELECT ?, id, name, price_cents, sort_order, ?, ?
         FROM menu_items
         WHERE id = ?
         ON CONFLICT(order_date, menu_item_id) DO NOTHING`,
      ).bind(orderDate, now, now, menuItemId),
      env.DB.prepare(
        `INSERT INTO order_contributions (order_date, menu_item_id, device_id, display_name, quantity, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(order_date, menu_item_id, device_id) DO UPDATE SET display_name = excluded.display_name, quantity = excluded.quantity, updated_at = excluded.updated_at`,
      ).bind(orderDate, menuItemId, deviceId, normalizedName, quantity, now),
      env.DB.prepare("UPDATE daily_orders SET revision = revision + 1, updated_at = ? WHERE order_date = ?").bind(now, orderDate),
      env.DB.prepare("INSERT INTO activity_log (order_date, device_id, display_name, action, details_json, created_at) VALUES (?, ?, ?, 'admin_correct_contribution', ?, ?)").bind(orderDate, deviceId, normalizedName, JSON.stringify({ menuItemId, quantity }), now),
    ]);
    return json(await getOrderSnapshot(env.DB, orderDate));
  } catch (error) { return errorResponse(error); }
};
