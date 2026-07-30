import { getShanghaiBusinessDate } from "../_lib/date";
import type { Env } from "../_lib/env";
import { errorResponse, json } from "../_lib/http";
import { getOrderSnapshot } from "../_lib/order-repository";

type MenuRow = { id: string; name: string; price_cents: number; sort_order: number };

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const [setting, menuResult] = await Promise.all([
      env.DB.prepare("SELECT value FROM settings WHERE key = 'restaurant_name'").first<{ value: string }>(),
      env.DB.prepare(
        "SELECT id, name, price_cents, sort_order FROM menu_items WHERE active = 1 ORDER BY sort_order, name",
      ).all<MenuRow>(),
    ]);
    const order = await getOrderSnapshot(env.DB, getShanghaiBusinessDate());
    return json(
      {
        restaurantName: setting?.value ?? "今日点餐",
        menu: menuResult.results.map((item) => ({
          id: item.id,
          name: item.name,
          priceCents: item.price_cents,
          sortOrder: item.sort_order,
          active: true,
        })),
        order,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
};
