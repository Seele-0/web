import { runAutomaticLockFallback } from "../../../_lib/automatic-lock";
import { verifyAdminRequest } from "../../../_lib/admin-session";
import { requireMealPeriod, requireOrderDate } from "../../../_lib/admin-input";
import type { Env } from "../../../_lib/env";
import { errorResponse, json, readJson } from "../../../_lib/http";
import { clearOrder } from "../../../_lib/order-repository";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await verifyAdminRequest(request, env);
    await runAutomaticLockFallback(env.DB);
    const input = await readJson<{ orderDate?: unknown; mealPeriod?: unknown }>(request);
    const orderDate = requireOrderDate(input.orderDate);
    const mealPeriod = requireMealPeriod(input.mealPeriod);
    return json(await clearOrder(env.DB, { orderDate, mealPeriod, now: new Date().toISOString() }));
  } catch (error) {
    return errorResponse(error);
  }
};
