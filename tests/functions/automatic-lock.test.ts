import { env } from "cloudflare:test";
import {
  ensureAutomaticLock,
  getLatestLockableOrderSlot,
} from "../../functions/_lib/automatic-lock";
import { getOrderSnapshot, setOrderLocked } from "../../functions/_lib/order-repository";

describe("automatic order locking", () => {
  it.each([
    ["2026-07-30T06:59:59.000Z", { orderDate: "2026-07-29", mealPeriod: "dinner" }],
    ["2026-07-30T07:00:00.000Z", { orderDate: "2026-07-30", mealPeriod: "lunch" }],
    ["2026-07-30T12:59:59.000Z", { orderDate: "2026-07-30", mealPeriod: "lunch" }],
    ["2026-07-30T13:00:00.000Z", { orderDate: "2026-07-30", mealPeriod: "dinner" }],
  ])("chooses the latest Shanghai meal order whose cutoff passed", (iso, expected) => {
    expect(getLatestLockableOrderSlot(new Date(iso))).toEqual(expected);
  });

  it("locks each meal once and does not relock after an administrator unlock", async () => {
    const first = await ensureAutomaticLock(env.DB, {
      orderDate: "2026-07-30",
      mealPeriod: "lunch",
      now: "2026-07-30T07:00:00.000Z",
      source: "cron",
      executionToken: "cron-lunch-1",
    });
    expect(first).toBe(true);
    expect((await getOrderSnapshot(env.DB, "2026-07-30", "lunch")).locked).toBe(true);

    await setOrderLocked(env.DB, {
      orderDate: "2026-07-30",
      mealPeriod: "lunch",
      locked: false,
      now: "2026-07-30T07:05:00.000Z",
    });

    const second = await ensureAutomaticLock(env.DB, {
      orderDate: "2026-07-30",
      mealPeriod: "lunch",
      now: "2026-07-30T07:10:00.000Z",
      source: "request_fallback",
      executionToken: "fallback-lunch-2",
    });
    expect(second).toBe(false);
    expect((await getOrderSnapshot(env.DB, "2026-07-30", "lunch")).locked).toBe(false);
    expect((await env.DB.prepare("SELECT COUNT(*) AS count FROM automatic_order_locks WHERE order_date = ?").bind("2026-07-30#lunch").first<{ count: number }>())?.count).toBe(1);
  });

  it("treats a legacy date-only order as dinner", async () => {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO daily_orders (order_date, share_count, revision, locked, updated_at) VALUES (?, 1, 0, 0, ?)",
      ).bind("2026-07-30", "2026-07-30T06:00:00.000Z"),
      env.DB.prepare(
        "INSERT INTO order_items (order_date, menu_item_id, name, price_cents, sort_order, created_at, updated_at) VALUES (?, 'dish-suan-cai-yu', '历史菜品', 1200, 1, ?, ?)",
      ).bind("2026-07-30", "2026-07-30T06:00:00.000Z", "2026-07-30T06:00:00.000Z"),
      env.DB.prepare(
        "INSERT INTO order_contributions (order_date, menu_item_id, device_id, display_name, quantity, updated_at) VALUES (?, 'dish-suan-cai-yu', 'legacy-device', '历史用户', 1, ?)",
      ).bind("2026-07-30", "2026-07-30T06:00:00.000Z"),
    ]);

    await ensureAutomaticLock(env.DB, {
      orderDate: "2026-07-30",
      mealPeriod: "dinner",
      now: "2026-07-30T13:00:00.000Z",
      source: "cron",
      executionToken: "cron-legacy-dinner",
    });

    expect((await getOrderSnapshot(env.DB, "2026-07-30", "dinner")).locked).toBe(true);
    expect((await env.DB.prepare("SELECT locked FROM daily_orders WHERE order_date = ?").bind("2026-07-30").first<{ locked: number }>())?.locked).toBe(1);
    expect((await env.DB.prepare("SELECT order_date FROM daily_orders WHERE order_date = ?").bind("2026-07-30#dinner").first()) ).toBeNull();
  });

  it("keeps lunch and dinner locks independent", async () => {
    await ensureAutomaticLock(env.DB, {
      orderDate: "2026-07-30",
      mealPeriod: "lunch",
      now: "2026-07-30T07:00:00.000Z",
      source: "cron",
      executionToken: "cron-lunch-independent",
    });

    expect((await getOrderSnapshot(env.DB, "2026-07-30", "lunch")).locked).toBe(true);
    expect((await getOrderSnapshot(env.DB, "2026-07-30", "dinner")).locked).toBe(false);
  });
});
