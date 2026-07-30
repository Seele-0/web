import { env } from "cloudflare:test";
import { HttpError } from "../../functions/_lib/http";
import {
  adjustContribution,
  clearOrder,
  deleteOrderItem,
  getOrderSnapshot,
  replaceOrderFromText,
  setAdminContribution,
  setOrderLocked,
  setShareCount,
  upsertAdminOrderItem,
  ADMIN_IMPORT_DEVICE_ID,
  ADMIN_IMPORT_DISPLAY_NAME,
} from "../../functions/_lib/order-repository";

const baseInput = {
  orderDate: "2026-07-30",
  menuItemId: "dish-suan-cai-yu",
  deviceId: "device-a",
  displayName: "张三",
  delta: 1 as const,
  now: "2026-07-30T10:00:00.000Z",
};

async function menuRevision(): Promise<number> {
  const setting = await env.DB.prepare("SELECT value FROM settings WHERE key = 'menu_revision'").first<{ value: string }>();
  return Number(setting?.value ?? 0);
}


function lockImmediatelyBeforeBatch(orderDate: string): D1Database {
  return {
    prepare(sql: string) {
      return env.DB.prepare(sql);
    },
    async batch(statements: D1PreparedStatement[]) {
      await env.DB.prepare("UPDATE daily_orders SET locked = 1 WHERE order_date = ?").bind(orderDate).run();
      return env.DB.batch(statements);
    },
  } as unknown as D1Database;
}

async function activityCount(orderDate: string, action: string): Promise<number> {
  const result = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM activity_log WHERE order_date = ? AND action = ?",
  ).bind(orderDate, action).first<{ count: number }>();
  return result?.count ?? 0;
}


describe("order repository", () => {
  it("applies a contribution atomically and increments revision", async () => {
    const snapshot = await adjustContribution(env.DB, { ...baseInput, operationId: "device-a-1" });
    expect(snapshot.revision).toBe(1);
    expect(snapshot.dishes[0]).toMatchObject({ menuItemId: "dish-suan-cai-yu", quantity: 1 });
  });

  it("creates an order-item snapshot when the menu is deactivated after active preflight", async () => {
    const db = {
      prepare(sql: string) {
        return env.DB.prepare(sql);
      },
      async batch(statements: D1PreparedStatement[]) {
        await env.DB.prepare("UPDATE menu_items SET active = 0 WHERE id = ?").bind(baseInput.menuItemId).run();
        return env.DB.batch(statements);
      },
    } as unknown as D1Database;

    const snapshot = await adjustContribution(db, { ...baseInput, operationId: "deactivate-after-preflight" });
    const contribution = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM order_contributions WHERE order_date = ? AND menu_item_id = ?",
    ).bind(baseInput.orderDate, baseInput.menuItemId).first<{ count: number }>();
    const orderItem = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM order_items WHERE order_date = ? AND menu_item_id = ?",
    ).bind(baseInput.orderDate, baseInput.menuItemId).first<{ count: number }>();

    expect(snapshot.dishes).toEqual([expect.objectContaining({ menuItemId: baseInput.menuItemId, quantity: 1 })]);
    expect(contribution?.count).toBe(1);
    expect(orderItem?.count).toBe(1);
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

  it("rejects an adjustment when the order becomes locked immediately before its batch without side effects", async () => {
    await setOrderLocked(env.DB, { orderDate: baseInput.orderDate, locked: false, now: baseInput.now });
    const before = await getOrderSnapshot(env.DB, baseInput.orderDate);

    await expect(adjustContribution(lockImmediatelyBeforeBatch(baseInput.orderDate), {
      ...baseInput,
      operationId: "adjust-lock-race",
    })).rejects.toMatchObject({ status: 423, code: "order_locked" } satisfies Partial<HttpError>);

    expect(await getOrderSnapshot(env.DB, baseInput.orderDate)).toEqual({ ...before, locked: true });
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM operations WHERE operation_id = ?").bind("adjust-lock-race").first())
      .toMatchObject({ count: 0 });
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM order_items WHERE order_date = ?").bind(baseInput.orderDate).first())
      .toMatchObject({ count: 0 });
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM order_contributions WHERE order_date = ?").bind(baseInput.orderDate).first())
      .toMatchObject({ count: 0 });
    expect(await activityCount(baseInput.orderDate, "adjust_contribution")).toBe(0);
  });

  it("rejects a share-count update when the order becomes locked immediately before its batch without side effects", async () => {
    await setOrderLocked(env.DB, { orderDate: baseInput.orderDate, locked: false, now: baseInput.now });
    const before = await getOrderSnapshot(env.DB, baseInput.orderDate);

    await expect(setShareCount(lockImmediatelyBeforeBatch(baseInput.orderDate), {
      operationId: "share-lock-race",
      orderDate: baseInput.orderDate,
      deviceId: baseInput.deviceId,
      displayName: baseInput.displayName,
      shareCount: 8,
      now: "2026-07-30T10:01:00.000Z",
    })).rejects.toMatchObject({ status: 423, code: "order_locked" } satisfies Partial<HttpError>);

    expect(await getOrderSnapshot(env.DB, baseInput.orderDate)).toEqual({ ...before, locked: true });
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM operations WHERE operation_id = ?").bind("share-lock-race").first())
      .toMatchObject({ count: 0 });
    expect(await activityCount(baseInput.orderDate, "set_share_count")).toBe(0);
  });

  it("replaces an order with administrator import contributions", async () => {
    const snapshot = await replaceOrderFromText(env.DB, {
      orderDate: baseInput.orderDate,
      text: "黄瓜火腿 -- 12 -- 3\n麻婆豆腐 -- 12 -- 2",
      now: baseInput.now,
    });

    expect(snapshot.totalQuantity).toBe(5);
    expect(snapshot.dishes).toEqual([
      expect.objectContaining({
        name: "黄瓜火腿",
        priceCents: 1200,
        quantity: 3,
        contributors: [{
          deviceId: ADMIN_IMPORT_DEVICE_ID,
          displayName: ADMIN_IMPORT_DISPLAY_NAME,
          quantity: 3,
        }],
      }),
      expect.objectContaining({
        name: "麻婆豆腐",
        priceCents: 1200,
        quantity: 2,
        contributors: [{
          deviceId: ADMIN_IMPORT_DEVICE_ID,
          displayName: ADMIN_IMPORT_DISPLAY_NAME,
          quantity: 2,
        }],
      }),
    ]);
  });

  it("rejects invalid replacement text without writes", async () => {
    await expect(replaceOrderFromText(env.DB, {
      orderDate: baseInput.orderDate,
      text: "无效格式",
      now: baseInput.now,
    })).rejects.toMatchObject({ status: 400, code: "invalid_order_text" } satisfies Partial<HttpError>);

    expect(await getOrderSnapshot(env.DB, baseInput.orderDate)).toMatchObject({ revision: 0, dishes: [] });
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM menu_items").first<{ count: number }>()).toMatchObject({ count: 5 });
  });

  it("creates a missing menu dish during order import and increments both revisions", async () => {
    const snapshot = await replaceOrderFromText(env.DB, {
      orderDate: baseInput.orderDate,
      text: "新菜 -- 18 -- 2",
      now: baseInput.now,
    });

    expect(snapshot.revision).toBe(1);
    expect(await env.DB.prepare("SELECT price_cents, active FROM menu_items WHERE name = '新菜'").first())
      .toMatchObject({ price_cents: 1800, active: 1 });
    expect(await menuRevision()).toBe(1);
  });

  it("keeps an active menu price while importing the supplied daily snapshot price", async () => {
    await replaceOrderFromText(env.DB, {
      orderDate: baseInput.orderDate,
      text: "酸菜鱼 -- 88 -- 2",
      now: baseInput.now,
    });

    expect(await env.DB.prepare("SELECT price_cents FROM menu_items WHERE id = ?").bind(baseInput.menuItemId).first())
      .toMatchObject({ price_cents: 6800 });
    expect(await getOrderSnapshot(env.DB, baseInput.orderDate)).toMatchObject({
      totalCents: 17_600,
      dishes: [expect.objectContaining({ name: "酸菜鱼", priceCents: 8800, quantity: 2 })],
    });
    expect(await menuRevision()).toBe(0);
  });

  it("reactivates an inactive matching menu dish during replacement", async () => {
    await env.DB.prepare("UPDATE menu_items SET active = 0 WHERE id = ?").bind(baseInput.menuItemId).run();

    const snapshot = await replaceOrderFromText(env.DB, {
      orderDate: baseInput.orderDate,
      text: "酸菜鱼 -- 88 -- 2",
      now: baseInput.now,
    });

    expect(snapshot.revision).toBe(1);
    expect(await env.DB.prepare("SELECT price_cents, active FROM menu_items WHERE id = ?").bind(baseInput.menuItemId).first())
      .toMatchObject({ price_cents: 8800, active: 1 });
    expect(await menuRevision()).toBe(1);
  });

  it("adds an administrator dish, deletes every contributor for that dish, and clears snapshots", async () => {
    const added = await upsertAdminOrderItem(env.DB, {
      orderDate: baseInput.orderDate,
      name: "新菜",
      priceCents: 1800,
      quantity: 2,
      now: baseInput.now,
    });
    const menuItemId = added.dishes[0].menuItemId;
    await adjustContribution(env.DB, {
      ...baseInput,
      menuItemId,
      operationId: "other-device-new-dish",
      deviceId: "device-b",
      displayName: "李四",
    });

    const deleted = await deleteOrderItem(env.DB, {
      orderDate: baseInput.orderDate,
      menuItemId,
      now: "2026-07-30T10:01:00.000Z",
    });
    expect(deleted.dishes).toEqual([]);
    expect(await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM order_contributions WHERE order_date = ? AND menu_item_id = ?",
    ).bind(baseInput.orderDate, menuItemId).first()).toMatchObject({ count: 0 });
    expect(await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM order_items WHERE order_date = ? AND menu_item_id = ?",
    ).bind(baseInput.orderDate, menuItemId).first()).toMatchObject({ count: 0 });

    await upsertAdminOrderItem(env.DB, {
      orderDate: baseInput.orderDate,
      name: "另一道菜",
      priceCents: 2400,
      quantity: 1,
      now: "2026-07-30T10:02:00.000Z",
    });
    const cleared = await clearOrder(env.DB, { orderDate: baseInput.orderDate, now: "2026-07-30T10:03:00.000Z" });
    expect(cleared.dishes).toEqual([]);
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM order_contributions WHERE order_date = ?").bind(baseInput.orderDate).first())
      .toMatchObject({ count: 0 });
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM order_items WHERE order_date = ?").bind(baseInput.orderDate).first())
      .toMatchObject({ count: 0 });
  });

  it("increments clear-order revision exactly once", async () => {
    await upsertAdminOrderItem(env.DB, {
      orderDate: baseInput.orderDate,
      name: "新菜",
      priceCents: 1800,
      quantity: 2,
      now: baseInput.now,
    });
    const before = await getOrderSnapshot(env.DB, baseInput.orderDate);

    const cleared = await clearOrder(env.DB, { orderDate: baseInput.orderDate, now: "2026-07-30T10:01:00.000Z" });

    expect(cleared.revision).toBe(before.revision + 1);
    expect(cleared.dishes).toEqual([]);
  });

  it("rejects administrator writes on a locked order without changing data or revisions", async () => {
    await upsertAdminOrderItem(env.DB, {
      orderDate: baseInput.orderDate,
      name: "已点菜",
      priceCents: 1800,
      quantity: 2,
      now: baseInput.now,
    });
    const existing = await getOrderSnapshot(env.DB, baseInput.orderDate);
    const menuRevisionBefore = await menuRevision();
    await setOrderLocked(env.DB, { orderDate: baseInput.orderDate, locked: true, now: "2026-07-30T10:01:00.000Z" });
    const locked = await getOrderSnapshot(env.DB, baseInput.orderDate);
    const menuItemId = locked.dishes[0].menuItemId;

    const lockedWrites = [
      replaceOrderFromText(env.DB, { orderDate: baseInput.orderDate, text: "新菜 -- 18 -- 2", now: "2026-07-30T10:02:00.000Z" }),
      upsertAdminOrderItem(env.DB, { orderDate: baseInput.orderDate, name: "新菜", priceCents: 1800, quantity: 2, now: "2026-07-30T10:02:00.000Z" }),
      deleteOrderItem(env.DB, { orderDate: baseInput.orderDate, menuItemId, now: "2026-07-30T10:02:00.000Z" }),
      clearOrder(env.DB, { orderDate: baseInput.orderDate, now: "2026-07-30T10:02:00.000Z" }),
    ];
    for (const write of lockedWrites) {
      await expect(write).rejects.toMatchObject({ status: 423, code: "order_locked" } satisfies Partial<HttpError>);
    }

    expect(await getOrderSnapshot(env.DB, baseInput.orderDate)).toEqual(locked);
    expect(await menuRevision()).toBe(menuRevisionBefore);
    expect(existing.dishes).toEqual(locked.dishes);
  });

  it("sets administrator contribution quantities with snapshots and removes an empty dish at zero", async () => {
    const snapshot = await setAdminContribution(env.DB, {
      orderDate: baseInput.orderDate,
      menuItemId: baseInput.menuItemId,
      deviceId: "device-c",
      displayName: "王五",
      quantity: 2,
      now: baseInput.now,
    });
    expect(snapshot.dishes).toEqual([expect.objectContaining({
      menuItemId: baseInput.menuItemId,
      contributors: [{ deviceId: "device-c", displayName: "王五", quantity: 2 }],
    })]);

    const empty = await setAdminContribution(env.DB, {
      orderDate: baseInput.orderDate,
      menuItemId: baseInput.menuItemId,
      deviceId: "device-c",
      displayName: "王五",
      quantity: 0,
      now: "2026-07-30T10:01:00.000Z",
    });
    expect(empty.dishes).toEqual([]);
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM order_items WHERE order_date = ?").bind(baseInput.orderDate).first())
      .toMatchObject({ count: 0 });
  });

  it("checks a locked order before validating replacement text", async () => {
    await setOrderLocked(env.DB, { orderDate: baseInput.orderDate, locked: true, now: baseInput.now });
    const locked = await getOrderSnapshot(env.DB, baseInput.orderDate);
    const menuRevisionBefore = await menuRevision();

    for (const text of ["", "无效格式"]) {
      await expect(replaceOrderFromText(env.DB, {
        orderDate: baseInput.orderDate,
        text,
        now: "2026-07-30T10:01:00.000Z",
      })).rejects.toMatchObject({ status: 423, code: "order_locked" } satisfies Partial<HttpError>);
    }

    expect(await getOrderSnapshot(env.DB, baseInput.orderDate)).toEqual(locked);
    expect(await menuRevision()).toBe(menuRevisionBefore);
  });

  it("keeps an active same-name menu price while upserting its supplied daily price", async () => {
    const snapshot = await upsertAdminOrderItem(env.DB, {
      orderDate: baseInput.orderDate,
      name: "酸菜鱼",
      priceCents: 8800,
      quantity: 2,
      now: baseInput.now,
    });

    expect(snapshot.revision).toBe(1);
    expect(snapshot.dishes).toEqual([expect.objectContaining({
      menuItemId: baseInput.menuItemId,
      priceCents: 8800,
      quantity: 2,
    })]);
    expect(await env.DB.prepare("SELECT price_cents, active FROM menu_items WHERE id = ?").bind(baseInput.menuItemId).first())
      .toMatchObject({ price_cents: 6800, active: 1 });
    expect(await menuRevision()).toBe(0);
  });

  it("reactivates an inactive same-name menu item while upserting its supplied price", async () => {
    await env.DB.prepare("UPDATE menu_items SET active = 0 WHERE id = ?").bind(baseInput.menuItemId).run();

    const snapshot = await upsertAdminOrderItem(env.DB, {
      orderDate: baseInput.orderDate,
      name: "酸菜鱼",
      priceCents: 8800,
      quantity: 2,
      now: baseInput.now,
    });

    expect(snapshot.revision).toBe(1);
    expect(snapshot.dishes).toEqual([expect.objectContaining({
      menuItemId: baseInput.menuItemId,
      priceCents: 8800,
      quantity: 2,
    })]);
    expect(await env.DB.prepare("SELECT price_cents, active FROM menu_items WHERE id = ?").bind(baseInput.menuItemId).first())
      .toMatchObject({ price_cents: 8800, active: 1 });
    expect(await menuRevision()).toBe(1);
  });

  it("does not revise or log when deleting a missing order snapshot", async () => {
    await setOrderLocked(env.DB, { orderDate: baseInput.orderDate, locked: false, now: baseInput.now });
    const before = await getOrderSnapshot(env.DB, baseInput.orderDate);
    const deleteLogCount = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM activity_log WHERE action = 'delete_order_item'",
    ).first<{ count: number }>();

    const snapshot = await deleteOrderItem(env.DB, {
      orderDate: baseInput.orderDate,
      menuItemId: baseInput.menuItemId,
      now: "2026-07-30T10:01:00.000Z",
    });

    expect(snapshot).toEqual(before);
    expect(await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM activity_log WHERE action = 'delete_order_item'",
    ).first()).toMatchObject({ count: deleteLogCount?.count ?? 0 });
  });

  it("retains another contributor and its snapshot when one admin contribution is set to zero", async () => {
    await setAdminContribution(env.DB, {
      orderDate: baseInput.orderDate,
      menuItemId: baseInput.menuItemId,
      deviceId: "device-a",
      displayName: "张三",
      quantity: 2,
      now: baseInput.now,
    });
    await setAdminContribution(env.DB, {
      orderDate: baseInput.orderDate,
      menuItemId: baseInput.menuItemId,
      deviceId: "device-b",
      displayName: "李四",
      quantity: 3,
      now: "2026-07-30T10:01:00.000Z",
    });

    const snapshot = await setAdminContribution(env.DB, {
      orderDate: baseInput.orderDate,
      menuItemId: baseInput.menuItemId,
      deviceId: "device-a",
      displayName: "张三",
      quantity: 0,
      now: "2026-07-30T10:02:00.000Z",
    });

    expect(snapshot.dishes).toEqual([expect.objectContaining({
      menuItemId: baseInput.menuItemId,
      quantity: 3,
      contributors: [{ deviceId: "device-b", displayName: "李四", quantity: 3 }],
    })]);
    expect(await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM order_items WHERE order_date = ? AND menu_item_id = ?",
    ).bind(baseInput.orderDate, baseInput.menuItemId).first()).toMatchObject({ count: 1 });
  });


  it("rejects administrator batches when the order becomes locked after preflight without side effects", async () => {
    const replaceDate = "2026-07-28";
    await setOrderLocked(env.DB, { orderDate: replaceDate, locked: false, now: baseInput.now });
    const replaceMenuRevision = await menuRevision();
    const replaceDb = lockImmediatelyBeforeBatch(replaceDate);
    await expect(replaceOrderFromText(replaceDb, {
      orderDate: replaceDate,
      text: "竞态导入菜 -- 18 -- 2",
      now: "2026-07-30T10:01:00.000Z",
    })).rejects.toMatchObject({ status: 423, code: "order_locked" } satisfies Partial<HttpError>);
    expect(await getOrderSnapshot(env.DB, replaceDate)).toMatchObject({ locked: true, revision: 1, dishes: [] });
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM menu_items WHERE name = '竞态导入菜'").first())
      .toMatchObject({ count: 0 });
    expect(await menuRevision()).toBe(replaceMenuRevision);
    expect(await activityCount(replaceDate, "replace_order")).toBe(0);

    const upsertDate = "2026-07-29";
    await setOrderLocked(env.DB, { orderDate: upsertDate, locked: false, now: baseInput.now });
    const upsertMenuRevision = await menuRevision();
    await expect(upsertAdminOrderItem(lockImmediatelyBeforeBatch(upsertDate), {
      orderDate: upsertDate,
      name: "竞态新增菜",
      priceCents: 1800,
      quantity: 2,
      now: "2026-07-30T10:01:00.000Z",
    })).rejects.toMatchObject({ status: 423, code: "order_locked" } satisfies Partial<HttpError>);
    expect(await getOrderSnapshot(env.DB, upsertDate)).toMatchObject({ locked: true, revision: 1, dishes: [] });
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM menu_items WHERE name = '竞态新增菜'").first())
      .toMatchObject({ count: 0 });
    expect(await menuRevision()).toBe(upsertMenuRevision);
    expect(await activityCount(upsertDate, "upsert_admin_order_item")).toBe(0);

    const clearDate = "2026-07-27";
    await upsertAdminOrderItem(env.DB, {
      orderDate: clearDate,
      name: "待清空菜",
      priceCents: 1800,
      quantity: 2,
      now: baseInput.now,
    });
    await env.DB.prepare("UPDATE daily_orders SET locked = 0 WHERE order_date = ?").bind(clearDate).run();
    const beforeClear = await getOrderSnapshot(env.DB, clearDate);
    const clearMenuRevision = await menuRevision();
    await expect(clearOrder(lockImmediatelyBeforeBatch(clearDate), {
      orderDate: clearDate,
      now: "2026-07-30T10:01:00.000Z",
    })).rejects.toMatchObject({ status: 423, code: "order_locked" } satisfies Partial<HttpError>);
    expect(await getOrderSnapshot(env.DB, clearDate)).toEqual({ ...beforeClear, locked: true });
    expect(await menuRevision()).toBe(clearMenuRevision);
    expect(await activityCount(clearDate, "clear_order")).toBe(0);
  });

  it("deletes a concurrently targeted order snapshot only once", async () => {
    const created = await upsertAdminOrderItem(env.DB, {
      orderDate: baseInput.orderDate,
      name: "并发删除菜",
      priceCents: 1800,
      quantity: 2,
      now: baseInput.now,
    });
    const menuItemId = created.dishes[0].menuItemId;
    const before = await getOrderSnapshot(env.DB, baseInput.orderDate);

    await Promise.all([
      deleteOrderItem(env.DB, { orderDate: baseInput.orderDate, menuItemId, now: "2026-07-30T10:01:00.000Z" }),
      deleteOrderItem(env.DB, { orderDate: baseInput.orderDate, menuItemId, now: "2026-07-30T10:01:00.000Z" }),
    ]);

    expect(await getOrderSnapshot(env.DB, baseInput.orderDate)).toMatchObject({
      revision: before.revision + 1,
      dishes: [],
    });
    expect(await activityCount(baseInput.orderDate, "delete_order_item")).toBe(1);
  });

  it("records the resolved menu item id in administrator upsert activity details", async () => {
    const snapshot = await upsertAdminOrderItem(env.DB, {
      orderDate: baseInput.orderDate,
      name: "审计新增菜",
      priceCents: 1800,
      quantity: 2,
      now: baseInput.now,
    });
    const activity = await env.DB.prepare(
      "SELECT details_json FROM activity_log WHERE order_date = ? AND action = 'upsert_admin_order_item'",
    ).bind(baseInput.orderDate).first<{ details_json: string }>();

    expect(JSON.parse(activity?.details_json ?? "{}")).toMatchObject({
      menuItemId: snapshot.dishes[0].menuItemId,
      name: "审计新增菜",
      priceCents: 1800,
      quantity: 2,
    });
  });

  it("handles concurrent same-name imports and upserts with one live menu item and date-specific snapshots", async () => {
    await Promise.all([
      replaceOrderFromText(env.DB, {
        orderDate: "2026-07-29",
        text: "并发同名菜 -- 18 -- 2",
        now: baseInput.now,
      }),
      upsertAdminOrderItem(env.DB, {
        orderDate: "2026-07-28",
        name: "并发同名菜",
        priceCents: 1900,
        quantity: 3,
        now: "2026-07-30T10:01:00.000Z",
      }),
    ]);

    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM menu_items WHERE name = '并发同名菜'").first())
      .toMatchObject({ count: 1 });
    expect(await env.DB.prepare("SELECT active FROM menu_items WHERE name = '并发同名菜'").first())
      .toMatchObject({ active: 1 });
    expect(await getOrderSnapshot(env.DB, "2026-07-29")).toMatchObject({
      totalQuantity: 2,
      dishes: [expect.objectContaining({ name: "并发同名菜", priceCents: 1800 })],
    });
    expect(await getOrderSnapshot(env.DB, "2026-07-28")).toMatchObject({
      totalQuantity: 3,
      dishes: [expect.objectContaining({ name: "并发同名菜", priceCents: 1900 })],
    });
  });

});
