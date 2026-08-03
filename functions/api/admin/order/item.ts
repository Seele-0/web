import { runAutomaticLockFallback } from "../../../_lib/automatic-lock";
import { verifyAdminRequest } from "../../../_lib/admin-session";
import { requireIdentifier, requireMenuItemName, requireMealPeriod, requireOrderDate, requirePriceCents, requireQuantity } from "../../../_lib/admin-input";
import type { Env } from "../../../_lib/env";
import { errorResponse, json, readJson } from "../../../_lib/http";
import { deleteOrderItem, upsertAdminOrderItem } from "../../../_lib/order-repository";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await verifyAdminRequest(request, env);
    await runAutomaticLockFallback(env.DB);
    const input = await readJson<{ orderDate?: unknown; mealPeriod?: unknown; name?: unknown; priceCents?: unknown; quantity?: unknown }>(request);
    const orderDate = requireOrderDate(input.orderDate);
    const mealPeriod = requireMealPeriod(input.mealPeriod);
    const name = requireMenuItemName(input.name, "invalid_order_item_name");
    const priceCents = requirePriceCents(input.priceCents, "invalid_order_item_price");
    const quantity = requireQuantity(input.quantity);
    return json(await upsertAdminOrderItem(env.DB, { orderDate, mealPeriod, name, priceCents, quantity, now: new Date().toISOString() }));
  } catch (error) {
    return errorResponse(error);
  }
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await verifyAdminRequest(request, env);
    await runAutomaticLockFallback(env.DB);
    const input = await readJson<{ orderDate?: unknown; mealPeriod?: unknown; menuItemId?: unknown }>(request);
    const orderDate = requireOrderDate(input.orderDate);
    const mealPeriod = requireMealPeriod(input.mealPeriod);
    const menuItemId = requireIdentifier(input.menuItemId, "invalid_menu_item_id", "菜品标识符无效");
    return json(await deleteOrderItem(env.DB, { orderDate, mealPeriod, menuItemId, now: new Date().toISOString() }));
  } catch (error) {
    return errorResponse(error);
  }
};
