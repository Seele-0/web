import type { Env } from "../../_lib/env";
import { errorResponse, HttpError, json } from "../../_lib/http";
import { getOrderSnapshot } from "../../_lib/order-repository";

export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  try {
    const orderDate = typeof params.date === "string" ? params.date : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(orderDate)) {
      throw new HttpError(400, "invalid_date", "订单日期格式无效");
    }
    const exists = await env.DB.prepare("SELECT order_date FROM daily_orders WHERE order_date = ?").bind(orderDate).first();
    if (!exists) throw new HttpError(404, "order_not_found", "未找到该日期的订单");
    return json(await getOrderSnapshot(env.DB, orderDate), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
};
