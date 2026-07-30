import { env } from "cloudflare:test";

it("creates the complete schema and seeds the default restaurant", async () => {
  const tables = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
  ).all<{ name: string }>();

  expect(tables.results.map((row) => row.name)).toEqual(
    expect.arrayContaining([
      "settings",
      "menu_items",
      "daily_orders",
      "order_contributions",
      "operations",
      "activity_log",
    ]),
  );

  const setting = await env.DB.prepare(
    "SELECT value FROM settings WHERE key = 'restaurant_name'",
  ).first<{ value: string }>();
  expect(setting?.value).toBe("今日点餐");
});
