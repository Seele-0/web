import { runAutomaticLockFallback } from "../../_lib/automatic-lock";
import type { Env } from "../../_lib/env";
import { errorResponse, HttpError, json } from "../../_lib/http";
import { getOrderSnapshot } from "../../_lib/order-repository";
import { getOrderStorageId, isMealPeriod } from "../../../src/domain/meal-period";

export const onRequestGet: PagesFunction<Env> = async ({ env, params, request }) => {
  try {
    await runAutomaticLockFallback(env.DB);
    const orderDate = typeof params.date === "string" ? params.date : "";
    const mealPeriod = new URL(request.url).searchParams.get("mealPeriod") ?? "lunch";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(orderDate)) throw new HttpError(400, "invalid_date", "订单日期格式无效");
    if (!isMealPeriod(mealPeriod)) throw new HttpError(400, "invalid_meal_period", "点餐时段无效");
    const exists = await env.DB.prepare("SELECT order_date FROM daily_orders WHERE order_date = ?").bind(getOrderStorageId(orderDate, mealPeriod)).first();
    if (!exists) throw new HttpError(404, "order_not_found", "未找到该时段的订单");
    return json(await getOrderSnapshot(env.DB, orderDate, mealPeriod), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
};
