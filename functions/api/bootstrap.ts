import { runAutomaticLockFallback } from "../_lib/automatic-lock";
import { getShanghaiBusinessDate } from "../_lib/date";
import type { Env } from "../_lib/env";
import { errorResponse, json } from "../_lib/http";
import { getMenuConfiguration } from "../_lib/menu-repository";
import { getOrderSnapshot } from "../_lib/order-repository";

export function createBootstrapHandler(now: () => Date = () => new Date()): PagesFunction<Env> {
  return async ({ env }) => {
    try {
      const current = now();
      await runAutomaticLockFallback(env.DB, current);
      const orderDate = getShanghaiBusinessDate(current);
      const [configuration, order] = await Promise.all([
        getMenuConfiguration(env.DB),
        getOrderSnapshot(env.DB, orderDate),
      ]);
      return json(
        {
          restaurantName: configuration.restaurantName,
          menu: configuration.menu,
          configurationRevision: configuration.configurationRevision,
          order,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export const onRequestGet = createBootstrapHandler();
