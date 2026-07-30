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

it("backfills one immutable item snapshot across multiple contributors", async () => {
  await reset();
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS.slice(0, 2));
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO daily_orders (order_date, share_count, revision, locked, updated_at) VALUES ('2026-07-29', 1, 1, 0, CURRENT_TIMESTAMP)",
    ),
    env.DB.prepare(
      "INSERT INTO order_contributions (order_date, menu_item_id, device_id, display_name, quantity, updated_at) VALUES ('2026-07-29', 'dish-suan-cai-yu', 'device-a', '张三', 2, '2026-07-29T10:15:00.000Z')",
    ),
    env.DB.prepare(
      "INSERT INTO order_contributions (order_date, menu_item_id, device_id, display_name, quantity, updated_at) VALUES ('2026-07-29', 'dish-suan-cai-yu', 'device-b', '李四', 3, '2026-07-29T12:45:00.000Z')",
    ),
  ]);

  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS.slice(2));

  const snapshots = await env.DB.prepare(
    "SELECT name, price_cents, sort_order, created_at, updated_at FROM order_items WHERE order_date = '2026-07-29' AND menu_item_id = 'dish-suan-cai-yu'",
  ).all<{
    name: string;
    price_cents: number;
    sort_order: number;
    created_at: string;
    updated_at: string;
  }>();

  expect(snapshots.results).toEqual([
    {
      name: "酸菜鱼",
      price_cents: 6800,
      sort_order: 1,
      created_at: "2026-07-29T10:15:00.000Z",
      updated_at: "2026-07-29T12:45:00.000Z",
    },
  ]);
});
