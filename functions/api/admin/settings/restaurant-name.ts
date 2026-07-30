import { verifyAdminRequest } from "../../../_lib/admin-session";
import type { Env } from "../../../_lib/env";
import { errorResponse, HttpError, json, readJson } from "../../../_lib/http";
import { setRestaurantName } from "../../../_lib/menu-repository";

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await verifyAdminRequest(request, env);
    const input = await readJson<{ restaurantName?: unknown }>(request);
    if (typeof input.restaurantName !== "string") throw new HttpError(400, "invalid_restaurant_name", "餐馆名称无效");
    await setRestaurantName(env.DB, input.restaurantName, new Date().toISOString());
    return json({ restaurantName: input.restaurantName.trim() });
  } catch (error) { return errorResponse(error); }
};
