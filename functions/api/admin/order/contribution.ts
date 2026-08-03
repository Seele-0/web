import { runAutomaticLockFallback } from "../../../_lib/automatic-lock";
import { requireIdentifier, requireMealPeriod, requireOrderDate } from "../../../_lib/admin-input";
import { errorResponse, HttpError, json, readJson } from "../../../_lib/http";
import { verifyAdminRequest } from "../../../_lib/admin-session";
import type { Env } from "../../../_lib/env";
import { setAdminContribution } from "../../../_lib/order-repository";

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await verifyAdminRequest(request, env);
    await runAutomaticLockFallback(env.DB);
    const input = await readJson<Record<string, unknown>>(request);
    const orderDate = requireOrderDate(input.orderDate);
    const mealPeriod = requireMealPeriod(input.mealPeriod);
    const menuItemId = requireIdentifier(input.menuItemId, "invalid_contribution", "贡献修正参数无效");
    const deviceId = requireIdentifier(input.deviceId, "invalid_contribution", "贡献修正参数无效");
    const displayName = typeof input.displayName === "string" ? input.displayName.trim() : "";
    const quantity = input.quantity;
    if (displayName.length < 1 || displayName.length > 30 || typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 0 || quantity > 999) {
      throw new HttpError(400, "invalid_contribution", "贡献修正参数无效");
    }
    return json(await setAdminContribution(env.DB, {
      orderDate,
      mealPeriod,
      menuItemId,
      deviceId,
      displayName,
      quantity,
      now: new Date().toISOString(),
    }));
  } catch (error) {
    return errorResponse(error);
  }
};
