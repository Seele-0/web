import { runAutomaticLockFallback } from "../../../_lib/automatic-lock";
import { verifyAdminRequest } from "../../../_lib/admin-session";
import { requireMealPeriod, requireOrderDate } from "../../../_lib/admin-input";
import type { Env } from "../../../_lib/env";
import { errorResponse, HttpError, json, readJson } from "../../../_lib/http";
import { getOrderSnapshot, setOrderLocked } from "../../../_lib/order-repository";

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await verifyAdminRequest(request, env);
    await runAutomaticLockFallback(env.DB);
    const input = await readJson<{ orderDate?: unknown; mealPeriod?: unknown; locked?: unknown }>(request);
    if (typeof input.locked !== "boolean") throw new HttpError(400, "invalid_lock_request", "锁定参数无效");
    const orderDate = requireOrderDate(input.orderDate);
    const mealPeriod = requireMealPeriod(input.mealPeriod);
    await setOrderLocked(env.DB, { orderDate, mealPeriod, locked: input.locked, now: new Date().toISOString() });
    return json(await getOrderSnapshot(env.DB, orderDate, mealPeriod));
  } catch (error) { return errorResponse(error); }
};
