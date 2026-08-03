import { runAutomaticLockFallback } from "../../../_lib/automatic-lock";
import { verifyAdminRequest } from "../../../_lib/admin-session";
import { requireMealPeriod, requireOrderDate } from "../../../_lib/admin-input";
import type { Env } from "../../../_lib/env";
import { errorResponse, HttpError, json, readJson } from "../../../_lib/http";
import { replaceOrderFromText } from "../../../_lib/order-repository";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await verifyAdminRequest(request, env);
    await runAutomaticLockFallback(env.DB);
    const input = await readJson<{ orderDate?: unknown; mealPeriod?: unknown; text?: unknown }>(request, 100_000);
    const orderDate = requireOrderDate(input.orderDate);
    const mealPeriod = requireMealPeriod(input.mealPeriod);
    if (typeof input.text !== "string") {
      throw new HttpError(400, "invalid_order_text", "订单文本格式无效");
    }
    return json(await replaceOrderFromText(env.DB, { orderDate, mealPeriod, text: input.text, now: new Date().toISOString() }));
  } catch (error) {
    return errorResponse(error);
  }
};
