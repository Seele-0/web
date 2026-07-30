import { getShanghaiBusinessDate } from "../_lib/date";
import type { Env } from "../_lib/env";
import { errorResponse, json } from "../_lib/http";
import { getMenuConfiguration } from "../_lib/menu-repository";
import { getOrderSnapshot } from "../_lib/order-repository";

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const [configuration, order] = await Promise.all([
      getMenuConfiguration(env.DB),
      getOrderSnapshot(env.DB, getShanghaiBusinessDate()),
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
