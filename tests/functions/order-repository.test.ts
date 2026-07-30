import { env } from "cloudflare:test";
import { HttpError } from "../../functions/_lib/http";
import {
  adjustContribution,
  getOrderSnapshot,
  setShareCount,
} from "../../functions/_lib/order-repository";

const baseInput = {
  orderDate: "2026-07-30",
  menuItemId: "dish-suan-cai-yu",
  deviceId: "device-a",
  displayName: "张三",
  delta: 1 as const,
  now: "2026-07-30T10:00:00.000Z",
};

describe("order repository", () => {
  it("applies a contribution atomically and increments revision", async () => {
    const snapshot = await adjustContribution(env.DB, { ...baseInput, operationId: "device-a-1" });
    expect(snapshot.revision).toBe(1);
    expect(snapshot.dishes[0]).toMatchObject({ menuItemId: "dish-suan-cai-yu", quantity: 1 });
  });

  it("treats a repeated operation id as idempotent", async () => {
    await adjustContribution(env.DB, { ...baseInput, operationId: "device-a-1" });
    const replay = await adjustContribution(env.DB, { ...baseInput, operationId: "device-a-1" });
    expect(replay.revision).toBe(1);
    expect(replay.dishes[0].quantity).toBe(1);
  });

  it("aggregates contributions from independent devices", async () => {
    await adjustContribution(env.DB, { ...baseInput, operationId: "device-a-1" });
    const snapshot = await adjustContribution(env.DB, {
      ...baseInput,
      operationId: "device-b-1",
      deviceId: "device-b",
      displayName: "李四",
    });
    expect(snapshot.revision).toBe(2);
    expect(snapshot.dishes[0].quantity).toBe(2);
    expect(snapshot.dishes[0].contributors).toEqual([
      { deviceId: "device-a", displayName: "张三", quantity: 1 },
      { deviceId: "device-b", displayName: "李四", quantity: 1 },
    ]);
  });

  it("preserves the first ordered dish name and price after the live menu changes", async () => {
    await adjustContribution(env.DB, { ...baseInput, operationId: "snapshot-1" });

    await env.DB.prepare(
      "UPDATE menu_items SET name = '新酸菜鱼', price_cents = 9900, sort_order = 99 WHERE id = ?",
    ).bind(baseInput.menuItemId).run();

    expect(await getOrderSnapshot(env.DB, baseInput.orderDate)).toMatchObject({
      totalCents: 6800,
      dishes: [
        {
          name: "酸菜鱼",
          priceCents: 6800,
          quantity: 1,
          subtotalCents: 6800,
        },
      ],
    });

    await adjustContribution(env.DB, { ...baseInput, operationId: "snapshot-2" });
    const snapshots = await env.DB.prepare(
      "SELECT name, price_cents, sort_order FROM order_items WHERE order_date = ? AND menu_item_id = ?",
    ).bind(baseInput.orderDate, baseInput.menuItemId).all<{
      name: string;
      price_cents: number;
      sort_order: number;
    }>();

    expect(snapshots.results).toEqual([{ name: "酸菜鱼", price_cents: 6800, sort_order: 1 }]);
  });

  it("keeps the remaining contributor when another device decrements to zero", async () => {
    await adjustContribution(env.DB, { ...baseInput, operationId: "device-a-1" });
    await adjustContribution(env.DB, {
      ...baseInput,
      operationId: "device-b-1",
      deviceId: "device-b",
      displayName: "李四",
    });

    const snapshot = await adjustContribution(env.DB, {
      ...baseInput,
      operationId: "device-a-minus-1",
      delta: -1,
    });

    expect(snapshot.dishes).toEqual([
      expect.objectContaining({
        name: "酸菜鱼",
        quantity: 1,
        contributors: [{ deviceId: "device-b", displayName: "李四", quantity: 1 }],
      }),
    ]);
  });

  it("rejects decrementing a zero contribution without changing storage", async () => {
    await expect(
      adjustContribution(env.DB, { ...baseInput, operationId: "device-a-minus", delta: -1 }),
    ).rejects.toMatchObject({ status: 409, code: "quantity_below_zero" } satisfies Partial<HttpError>);
    expect(await getOrderSnapshot(env.DB, baseInput.orderDate)).toMatchObject({ revision: 0, dishes: [] });
  });

  it("sets a validated share count and increments revision", async () => {
    const snapshot = await setShareCount(env.DB, {
      operationId: "share-1",
      orderDate: baseInput.orderDate,
      deviceId: "device-a",
      displayName: "张三",
      shareCount: 8,
      now: baseInput.now,
    });
    expect(snapshot).toMatchObject({ shareCount: 8, revision: 1 });
  });
});
