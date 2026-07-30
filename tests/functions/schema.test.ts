import { applyD1Migrations, env, reset } from "cloudflare:test";

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
      "order_items",
      "automatic_order_locks",
    ]),
  );

  const setting = await env.DB.prepare(
    "SELECT value FROM settings WHERE key = 'restaurant_name'",
  ).first<{ value: string }>();
  expect(setting?.value).toBe("今日点餐");
});

it("creates the exact order item snapshot columns", async () => {
  const columns = await env.DB.prepare("PRAGMA table_info(order_items)").all<{
    name: string;
  }>();

  expect(columns.results.map((column) => column.name)).toEqual([
    "order_date",
    "menu_item_id",
    "name",
    "price_cents",
    "sort_order",
    "created_at",
    "updated_at",
  ]);
});

it("creates the exact automatic order lock columns", async () => {
  const columns = await env.DB.prepare(
    "PRAGMA table_info(automatic_order_locks)",
  ).all<{ name: string }>();

  expect(columns.results.map((column) => column.name)).toEqual([
    "order_date",
    "locked_at",
    "source",
    "execution_token",
  ]);
});

it("backfills an immutable item snapshot for existing contributions", async () => {
  await reset();
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS.slice(0, 2));
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO daily_orders (order_date, share_count, revision, locked, updated_at) VALUES ('2026-07-29', 1, 1, 0, CURRENT_TIMESTAMP)",
    ),
    env.DB.prepare(
      "INSERT INTO order_contributions (order_date, menu_item_id, device_id, display_name, quantity, updated_at) VALUES ('2026-07-29', 'dish-suan-cai-yu', 'device-a', '张三', 2, CURRENT_TIMESTAMP)",
    ),
  ]);

  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS.slice(2));

  expect(
    await env.DB.prepare(
      "SELECT name, price_cents, sort_order FROM order_items WHERE order_date = '2026-07-29' AND menu_item_id = 'dish-suan-cai-yu'",
    ).first(),
  ).toEqual({ name: "酸菜鱼", price_cents: 6800, sort_order: 1 });
});
