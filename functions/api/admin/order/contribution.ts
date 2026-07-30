import { verifyAdminRequest } from "../../../_lib/admin-session";
import type { Env } from "../../../_lib/env";
import { errorResponse, HttpError, json, readJson } from "../../../_lib/http";
import { getOrderSnapshot } from "../../../_lib/order-repository";

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await verifyAdminRequest(request, env);
    const input = await readJson<Record<string, unknown>>(request);
    const { orderDate, menuItemId, deviceId, displayName, quantity } = input;
    if (typeof orderDate !== "string" || typeof menuItemId !== "string" || typeof deviceId !== "string" || typeof displayName !== "string" || !Number.isInteger(quantity) || (quantity as number) < 0) {
      throw new HttpError(400, "invalid_contribution", "贡献修正参数无效");
    }
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO daily_orders (order_date, share_count, revision, locked, updated_at) VALUES (?, 1, 0, 0, ?) ON CONFLICT(order_date) DO NOTHING").bind(orderDate, now),
      env.DB.prepare(
        `INSERT INTO order_contributions (order_date, menu_item_id, device_id, display_name, quantity, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(order_date, menu_item_id, device_id) DO UPDATE SET display_name = excluded.display_name, quantity = excluded.quantity, updated_at = excluded.updated_at`,
      ).bind(orderDate, menuItemId, deviceId, displayName.trim(), quantity, now),
      env.DB.prepare("UPDATE daily_orders SET revision = revision + 1, updated_at = ? WHERE order_date = ?").bind(now, orderDate),
      env.DB.prepare("INSERT INTO activity_log (order_date, device_id, display_name, action, details_json, created_at) VALUES (?, ?, ?, 'admin_correct_contribution', ?, ?)").bind(orderDate, deviceId, displayName, JSON.stringify({ menuItemId, quantity }), now),
    ]);
    return json(await getOrderSnapshot(env.DB, orderDate));
  } catch (error) { return errorResponse(error); }
};
