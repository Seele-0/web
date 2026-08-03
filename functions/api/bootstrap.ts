import { runAutomaticLockFallback } from "../_lib/automatic-lock";
import { getShanghaiBusinessDate } from "../_lib/date";
import type { Env } from "../_lib/env";
import { errorResponse, HttpError, json } from "../_lib/http";
import { getMenuConfiguration } from "../_lib/menu-repository";
import { getOrderSnapshot } from "../_lib/order-repository";
import { getShanghaiMealPeriod, isMealPeriod } from "../../src/domain/meal-period";

export function createBootstrapHandler(now: () => Date = () => new Date()): PagesFunction<Env> {
  return async ({ env, request }) => {
    try {
      const current = now();
      await runAutomaticLockFallback(env.DB, current);
      const requested = new URL(request.url).searchParams.get("mealPeriod");
      if (requested !== null && !isMealPeriod(requested)) throw new HttpError(400, "invalid_meal_period", "点餐时段无效");
      const mealPeriod = requested ?? getShanghaiMealPeriod(current);
      const orderDate = getShanghaiBusinessDate(current);
      const [configuration, order] = await Promise.all([
        getMenuConfiguration(env.DB),
        getOrderSnapshot(env.DB, orderDate, mealPeriod),
      ]);
      return json({ restaurantName: configuration.restaurantName, menu: configuration.menu, configurationRevision: configuration.configurationRevision, order }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) { return errorResponse(error); }
  };
}
export const onRequestGet = createBootstrapHandler();
