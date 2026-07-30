import { env } from "cloudflare:test";
import {
  clearMenu,
  deleteMenuItem,
  replaceMenuFromText,
  upsertMenuItem,
} from "../../functions/_lib/menu-repository";

const NOW = "2026-07-30T12:00:00.000Z";

type StoredMenuItem = {
  id: string;
  name: string;
  price_cents: number;
  sort_order: number;
  active: number;
  created_at: string;
  updated_at: string;
};

type ActivityRow = {
  order_date: string;
  action: string;
  details_json: string;
};

async function menuRows(): Promise<StoredMenuItem[]> {
  const result = await env.DB.prepare(
    "SELECT id, name, price_cents, sort_order, active, created_at, updated_at FROM menu_items ORDER BY sort_order, name",
  ).all<StoredMenuItem>();
  return result.results;
}

async function menuRevision(): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT value FROM settings WHERE key = 'menu_revision'",
  ).first<{ value: string }>();
  return Number(row?.value ?? 0);
}

async function activityRows(): Promise<ActivityRow[]> {
  const result = await env.DB.prepare(
    "SELECT order_date, action, details_json FROM activity_log ORDER BY id",
  ).all<ActivityRow>();
  return result.results;
}

async function expectNoMenuMutation(before: StoredMenuItem[]) {
  expect(await menuRows()).toEqual(before);
  expect(await menuRevision()).toBe(0);
  expect(await activityRows()).toEqual([]);
}

describe("menu repository writes", () => {
  it("replaces the active menu in input order and records one revision and activity", async () => {
    const originalAcidFish = await env.DB.prepare(
      "SELECT id, created_at FROM menu_items WHERE name = '酸菜鱼'",
    ).first<{ id: string; created_at: string }>();

    const parsed = await replaceMenuFromText(
      env.DB,
      "酸菜鱼 -- 72\n新菜 -- 10",
      NOW,
    );

    expect(parsed.errors).toEqual([]);
    expect(parsed.items).toEqual([
      { name: "酸菜鱼", priceCents: 7200, sourceLine: 1 },
      { name: "新菜", priceCents: 1000, sourceLine: 2 },
    ]);

    const rows = await menuRows();
    expect(rows.find((row) => row.name === "酸菜鱼")).toMatchObject({
      id: originalAcidFish?.id,
      price_cents: 7200,
      sort_order: 1,
      active: 1,
      created_at: originalAcidFish?.created_at,
      updated_at: NOW,
    });
    expect(rows.find((row) => row.name === "新菜")).toMatchObject({
      price_cents: 1000,
      sort_order: 2,
      active: 1,
      created_at: NOW,
      updated_at: NOW,
    });
    expect(rows.find((row) => row.name === "米饭")).toMatchObject({ active: 0 });
    expect(rows.filter((row) => row.active === 1).map((row) => row.name)).toEqual([
      "酸菜鱼",
      "新菜",
    ]);
    expect(await menuRevision()).toBe(1);

    const activities = await activityRows();
    expect(activities).toHaveLength(1);
    expect(activities[0]).toMatchObject({
      order_date: "2026-07-30",
      action: "replace_menu",
    });
    expect(JSON.parse(activities[0].details_json)).toEqual({ itemCount: 2 });
  });

  it("rejects an empty replacement without changing menu, revision, or activity", async () => {
    const before = await menuRows();

    await expect(replaceMenuFromText(env.DB, " \n\t", NOW)).rejects.toMatchObject({
      status: 400,
      code: "invalid_menu_text",
      message: "菜单不能为空",
    });

    await expectNoMenuMutation(before);
  });

  it("rejects duplicate replacement rows without partial writes", async () => {
    const before = await menuRows();

    await expect(
      replaceMenuFromText(env.DB, "酸菜鱼 -- 72\n酸菜鱼 -- 68", NOW),
    ).rejects.toMatchObject({
      status: 400,
      code: "invalid_menu_text",
      message: "菜品名称重复",
    });

    await expectNoMenuMutation(before);
  });

  it("adds a new dish at the end and returns its stored record", async () => {
    const created = await upsertMenuItem(env.DB, {
      name: "  新菜  ",
      priceCents: 1000,
      now: NOW,
    });

    expect(created).toMatchObject({
      name: "新菜",
      priceCents: 1000,
      sortOrder: 6,
    });
    expect(created.id).toMatch(/^dish-[0-9a-f-]{36}$/);
    expect(await env.DB.prepare(
      "SELECT id, name, price_cents, sort_order, active FROM menu_items WHERE id = ?",
    ).bind(created.id).first()).toEqual({
      id: created.id,
      name: "新菜",
      price_cents: 1000,
      sort_order: 6,
      active: 1,
    });
    expect(await menuRevision()).toBe(1);

    const activities = await activityRows();
    expect(activities).toHaveLength(1);
    expect(activities[0]).toMatchObject({ order_date: "2026-07-30", action: "upsert_menu_item" });
    expect(JSON.parse(activities[0].details_json)).toMatchObject({
      menuItemId: created.id,
      name: "新菜",
      priceCents: 1000,
    });
  });

  it("updates an existing dish and later re-enables it without changing id or sort order", async () => {
    const updated = await upsertMenuItem(env.DB, {
      name: "酸菜鱼",
      priceCents: 7000,
      now: NOW,
    });
    expect(updated).toEqual({
      id: "dish-suan-cai-yu",
      name: "酸菜鱼",
      priceCents: 7000,
      sortOrder: 1,
    });

    await env.DB.prepare(
      "UPDATE menu_items SET active = 0 WHERE id = 'dish-suan-cai-yu'",
    ).run();
    const reenabled = await upsertMenuItem(env.DB, {
      name: " 酸菜鱼 ",
      priceCents: 7200,
      now: "2026-07-30T12:05:00.000Z",
    });

    expect(reenabled).toEqual({
      id: "dish-suan-cai-yu",
      name: "酸菜鱼",
      priceCents: 7200,
      sortOrder: 1,
    });
    expect(await env.DB.prepare(
      "SELECT price_cents, sort_order, active FROM menu_items WHERE id = 'dish-suan-cai-yu'",
    ).first()).toEqual({ price_cents: 7200, sort_order: 1, active: 1 });
    expect(await menuRevision()).toBe(2);
    expect((await activityRows()).map((row) => row.action)).toEqual([
      "upsert_menu_item",
      "upsert_menu_item",
    ]);
  });

  it("rejects invalid dish names and prices without side effects", async () => {
    const before = await menuRows();

    await expect(upsertMenuItem(env.DB, { name: " ", priceCents: 1000, now: NOW })).rejects.toMatchObject({
      status: 400,
      code: "invalid_menu_item_name",
      message: "菜品名称长度必须为 1 到 80 个字符",
    });
    await expect(upsertMenuItem(env.DB, { name: "新菜", priceCents: 0, now: NOW })).rejects.toMatchObject({
      status: 400,
      code: "invalid_menu_item_price",
      message: "菜品价格必须为 1 到 10000000 分的整数",
    });
    await expect(upsertMenuItem(env.DB, { name: "新菜", priceCents: 1.5, now: NOW })).rejects.toMatchObject({
      status: 400,
      code: "invalid_menu_item_price",
      message: "菜品价格必须为 1 到 10000000 分的整数",
    });

    await expectNoMenuMutation(before);
  });

  it("soft-deletes one active dish and records one revision and activity", async () => {
    await deleteMenuItem(env.DB, { menuItemId: "dish-suan-cai-yu", now: NOW });

    expect(await env.DB.prepare(
      "SELECT active FROM menu_items WHERE id = 'dish-suan-cai-yu'",
    ).first()).toEqual({ active: 0 });
    expect(await menuRevision()).toBe(1);
    const activities = await activityRows();
    expect(activities).toHaveLength(1);
    expect(activities[0]).toMatchObject({ order_date: "2026-07-30", action: "delete_menu_item" });
    expect(JSON.parse(activities[0].details_json)).toEqual({
      menuItemId: "dish-suan-cai-yu",
      name: "酸菜鱼",
    });
  });

  it("treats missing or already inactive dish ids as not found without increasing revision", async () => {
    await env.DB.prepare(
      "UPDATE menu_items SET active = 0 WHERE id = 'dish-suan-cai-yu'",
    ).run();

    await expect(deleteMenuItem(env.DB, { menuItemId: "missing", now: NOW })).rejects.toMatchObject({
      status: 404,
      code: "menu_item_not_found",
      message: "菜品不存在",
    });
    await expect(deleteMenuItem(env.DB, { menuItemId: "dish-suan-cai-yu", now: NOW })).rejects.toMatchObject({
      status: 404,
      code: "menu_item_not_found",
      message: "菜品不存在",
    });

    expect(await menuRevision()).toBe(0);
    expect(await activityRows()).toEqual([]);
  });

  it("clears all active dishes without deleting historical menu rows", async () => {
    const beforeCount = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM menu_items",
    ).first<{ count: number }>();

    await clearMenu(env.DB, { now: NOW });

    expect(await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM menu_items WHERE active = 1",
    ).first()).toEqual({ count: 0 });
    expect(await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM menu_items",
    ).first()).toEqual(beforeCount);
    expect(await menuRevision()).toBe(1);
    const activities = await activityRows();
    expect(activities).toHaveLength(1);
    expect(activities[0]).toMatchObject({ order_date: "2026-07-30", action: "clear_menu" });
    expect(JSON.parse(activities[0].details_json)).toEqual({ itemCount: 5 });
  });
});
