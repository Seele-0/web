import { env } from "cloudflare:test";
import {
  ensureAutomaticLock,
  getLatestLockableShanghaiDate,
} from "../../functions/_lib/automatic-lock";
import { getOrderSnapshot, setOrderLocked } from "../../functions/_lib/order-repository";

describe("automatic order locking", () => {
  it.each([
    ["2026-07-30T15:58:59.000Z", "2026-07-29"],
    ["2026-07-30T15:59:00.000Z", "2026-07-30"],
    ["2026-07-30T16:01:00.000Z", "2026-07-30"],
  ])("chooses the latest Shanghai date whose 23:59 cutoff passed", (iso, expected) => {
    expect(getLatestLockableShanghaiDate(new Date(iso))).toBe(expected);
  });

  it("locks once and does not relock after an administrator unlock", async () => {
    const first = await ensureAutomaticLock(env.DB, {
      orderDate: "2026-07-30",
      now: "2026-07-30T15:59:00.000Z",
      source: "cron",
      executionToken: "cron-1",
    });
    expect(first).toBe(true);
    expect((await getOrderSnapshot(env.DB, "2026-07-30")).locked).toBe(true);

    await setOrderLocked(env.DB, {
      orderDate: "2026-07-30", locked: false, now: "2026-07-30T16:00:00.000Z",
    });
    const replay = await ensureAutomaticLock(env.DB, {
      orderDate: "2026-07-30",
      now: "2026-07-30T16:01:00.000Z",
      source: "request_fallback",
      executionToken: "fallback-1",
    });
    expect(replay).toBe(false);
    expect((await getOrderSnapshot(env.DB, "2026-07-30")).locked).toBe(false);
  });

  it("lets only one concurrent token lock, log, and increment the order", async () => {
    const [first, second] = await Promise.all([
      ensureAutomaticLock(env.DB, {
        orderDate: "2026-07-30", now: "2026-07-30T15:59:00.000Z", source: "cron", executionToken: "cron-a",
      }),
      ensureAutomaticLock(env.DB, {
        orderDate: "2026-07-30", now: "2026-07-30T15:59:00.000Z", source: "request_fallback", executionToken: "fallback-b",
      }),
    ]);
    expect([first, second].filter(Boolean)).toHaveLength(1);
    expect((await getOrderSnapshot(env.DB, "2026-07-30")).revision).toBe(1);
    expect((await env.DB.prepare("SELECT COUNT(*) AS count FROM automatic_order_locks WHERE order_date = ?").bind("2026-07-30").first<{ count: number }>())?.count).toBe(1);
    expect((await env.DB.prepare("SELECT COUNT(*) AS count FROM activity_log WHERE action = 'automatic_lock_order'").first<{ count: number }>())?.count).toBe(1);
  });
});
