import { errorResponse, HttpError, json, readJson } from "../../../_lib/http";
import { verifyAdminRequest } from "../../../_lib/admin-session";
import type { Env } from "../../../_lib/env";
import { setAdminContribution } from "../../../_lib/order-repository";

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
    return json(await setAdminContribution(env.DB, {
      orderDate,
      menuItemId,
      deviceId,
      displayName: normalizedName,
      quantity: quantity as number,
      now: new Date().toISOString(),
    }));
  } catch (error) { return errorResponse(error); }
};
