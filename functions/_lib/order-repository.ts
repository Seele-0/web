import { HttpError } from "./http";

export type AdjustInput = {
  operationId: string;
  orderDate: string;
  menuItemId: string;
  deviceId: string;
  displayName: string;
  delta: 1 | -1;
  now: string;
};

export type ShareCountInput = {
  operationId: string;
  orderDate: string;
  deviceId: string;
  displayName: string;
  shareCount: number;
  now: string;
};

export type AdminClearInput = {
  orderDate: string;
  deviceId?: string;
  displayName?: string;
  now: string;
};

export type AdminLockInput = AdminClearInput & { locked: boolean };

export type OrderSnapshot = {
  orderDate: string;
  shareCount: number;
  revision: number;
  locked: boolean;
  totalQuantity: number;
  totalCents: number;
  dishes: Array<{
    menuItemId: string;
    name: string;
    priceCents: number;
    quantity: number;
    subtotalCents: number;
    contributors: Array<{ deviceId: string; displayName: string; quantity: number }>;
  }>;
};

type OrderRow = { share_count: number; revision: number; locked: number };
type ContributionRow = {
  menu_item_id: string;
  name: string;
  price_cents: number;
  device_id: string;
  display_name: string;
  quantity: number;
  sort_order: number;
};

async function operationExists(db: D1Database, operationId: string): Promise<boolean> {
  return Boolean(
    await db.prepare("SELECT operation_id FROM operations WHERE operation_id = ?").bind(operationId).first(),
  );
}

async function getOrderRow(db: D1Database, orderDate: string): Promise<OrderRow | null> {
  return db
    .prepare("SELECT share_count, revision, locked FROM daily_orders WHERE order_date = ?")
    .bind(orderDate)
    .first<OrderRow>();
}

function assertUnlocked(order: OrderRow | null): void {
  if (order?.locked) {
    throw new HttpError(423, "order_locked", "订单已锁定");
  }
}

export async function adjustContribution(db: D1Database, input: AdjustInput): Promise<OrderSnapshot> {
  if (await operationExists(db, input.operationId)) {
    return getOrderSnapshot(db, input.orderDate);
  }

  assertUnlocked(await getOrderRow(db, input.orderDate));
  const item = await db
    .prepare("SELECT id FROM menu_items WHERE id = ? AND active = 1")
    .bind(input.menuItemId)
    .first();
  if (!item) throw new HttpError(404, "menu_item_not_found", "菜品不存在或已停用");

  if (input.delta === -1) {
    const current = await db
      .prepare(
        "SELECT quantity FROM order_contributions WHERE order_date = ? AND menu_item_id = ? AND device_id = ?",
      )
      .bind(input.orderDate, input.menuItemId, input.deviceId)
      .first<{ quantity: number }>();
    if (!current || current.quantity <= 0) {
      throw new HttpError(409, "quantity_below_zero", "当前设备没有可减少的该菜品");
    }
  }

  const statements = [
    db
      .prepare(
        "INSERT INTO daily_orders (order_date, share_count, revision, locked, updated_at) VALUES (?, 1, 0, 0, ?) ON CONFLICT(order_date) DO NOTHING",
      )
      .bind(input.orderDate, input.now),
    db
      .prepare(
        "INSERT INTO operations (operation_id, order_date, device_id, operation_type, payload_json, created_at) VALUES (?, ?, ?, 'adjust', ?, ?)",
      )
      .bind(
        input.operationId,
        input.orderDate,
        input.deviceId,
        JSON.stringify({ menuItemId: input.menuItemId, delta: input.delta }),
        input.now,
      ),
    db
      .prepare(
        `INSERT INTO order_items
          (order_date, menu_item_id, name, price_cents, sort_order, created_at, updated_at)
         SELECT ?, id, name, price_cents, sort_order, ?, ?
         FROM menu_items
         WHERE id = ?
         ON CONFLICT(order_date, menu_item_id) DO NOTHING`,
      )
      .bind(input.orderDate, input.now, input.now, input.menuItemId),
    db
      .prepare(
        `INSERT INTO order_contributions
          (order_date, menu_item_id, device_id, display_name, quantity, updated_at)
         VALUES (?, ?, ?, ?, CASE WHEN ? = 1 THEN 1 ELSE 0 END, ?)
         ON CONFLICT(order_date, menu_item_id, device_id)
         DO UPDATE SET
           display_name = excluded.display_name,
           quantity = order_contributions.quantity + ?,
           updated_at = excluded.updated_at
         WHERE order_contributions.quantity + ? >= 0`,
      )
      .bind(
        input.orderDate,
        input.menuItemId,
        input.deviceId,
        input.displayName,
        input.delta,
        input.now,
        input.delta,
        input.delta,
      ),
    db
      .prepare("UPDATE daily_orders SET revision = revision + 1, updated_at = ? WHERE order_date = ?")
      .bind(input.now, input.orderDate),
    db
      .prepare(
        "INSERT INTO activity_log (order_date, device_id, display_name, action, details_json, created_at) VALUES (?, ?, ?, 'adjust_contribution', ?, ?)",
      )
      .bind(
        input.orderDate,
        input.deviceId,
        input.displayName,
        JSON.stringify({ menuItemId: input.menuItemId, delta: input.delta }),
        input.now,
      ),
  ];

  try {
    await db.batch(statements);
  } catch (error) {
    if (await operationExists(db, input.operationId)) {
      return getOrderSnapshot(db, input.orderDate);
    }
    throw error;
  }
  return getOrderSnapshot(db, input.orderDate);
}

export async function setShareCount(db: D1Database, input: ShareCountInput): Promise<OrderSnapshot> {
  if (!Number.isInteger(input.shareCount) || input.shareCount < 1 || input.shareCount > 100) {
    throw new HttpError(400, "invalid_share_count", "均摊人数必须为 1 到 100");
  }
  if (await operationExists(db, input.operationId)) return getOrderSnapshot(db, input.orderDate);
  assertUnlocked(await getOrderRow(db, input.orderDate));

  await db.batch([
    db
      .prepare(
        "INSERT INTO daily_orders (order_date, share_count, revision, locked, updated_at) VALUES (?, 1, 0, 0, ?) ON CONFLICT(order_date) DO NOTHING",
      )
      .bind(input.orderDate, input.now),
    db
      .prepare(
        "INSERT INTO operations (operation_id, order_date, device_id, operation_type, payload_json, created_at) VALUES (?, ?, ?, 'share_count', ?, ?)",
      )
      .bind(input.operationId, input.orderDate, input.deviceId, JSON.stringify({ shareCount: input.shareCount }), input.now),
    db
      .prepare("UPDATE daily_orders SET share_count = ?, revision = revision + 1, updated_at = ? WHERE order_date = ?")
      .bind(input.shareCount, input.now, input.orderDate),
    db
      .prepare(
        "INSERT INTO activity_log (order_date, device_id, display_name, action, details_json, created_at) VALUES (?, ?, ?, 'set_share_count', ?, ?)",
      )
      .bind(input.orderDate, input.deviceId, input.displayName, JSON.stringify({ shareCount: input.shareCount }), input.now),
  ]);
  return getOrderSnapshot(db, input.orderDate);
}

export async function getOrderSnapshot(db: D1Database, orderDate: string): Promise<OrderSnapshot> {
  const order = await getOrderRow(db, orderDate);
  const rows = await db
    .prepare(
      `SELECT c.menu_item_id, i.name, i.price_cents, i.sort_order,
              c.device_id, c.display_name, c.quantity
       FROM order_contributions c
       JOIN order_items i
         ON i.order_date = c.order_date AND i.menu_item_id = c.menu_item_id
       WHERE c.order_date = ? AND c.quantity > 0
       ORDER BY i.sort_order, c.device_id`,
    )
    .bind(orderDate)
    .all<ContributionRow>();

  const dishMap = new Map<string, OrderSnapshot["dishes"][number]>();
  for (const row of rows.results) {
    let dish = dishMap.get(row.menu_item_id);
    if (!dish) {
      dish = {
        menuItemId: row.menu_item_id,
        name: row.name,
        priceCents: row.price_cents,
        quantity: 0,
        subtotalCents: 0,
        contributors: [],
      };
      dishMap.set(row.menu_item_id, dish);
    }
    dish.quantity += row.quantity;
    dish.subtotalCents += row.price_cents * row.quantity;
    dish.contributors.push({
      deviceId: row.device_id,
      displayName: row.display_name,
      quantity: row.quantity,
    });
  }
  const dishes = [...dishMap.values()];
  return {
    orderDate,
    shareCount: order?.share_count ?? 1,
    revision: order?.revision ?? 0,
    locked: Boolean(order?.locked),
    totalQuantity: dishes.reduce((sum, dish) => sum + dish.quantity, 0),
    totalCents: dishes.reduce((sum, dish) => sum + dish.subtotalCents, 0),
    dishes,
  };
}

export async function clearOrder(db: D1Database, input: AdminClearInput): Promise<void> {
  await db.batch([
    db
      .prepare(
        "INSERT INTO daily_orders (order_date, share_count, revision, locked, updated_at) VALUES (?, 1, 0, 0, ?) ON CONFLICT(order_date) DO NOTHING",
      )
      .bind(input.orderDate, input.now),
    db.prepare("DELETE FROM order_contributions WHERE order_date = ?").bind(input.orderDate),
    db
      .prepare("UPDATE daily_orders SET revision = revision + 1, updated_at = ? WHERE order_date = ?")
      .bind(input.now, input.orderDate),
    db
      .prepare(
        "INSERT INTO activity_log (order_date, device_id, display_name, action, details_json, created_at) VALUES (?, ?, ?, 'clear_order', '{}', ?)",
      )
      .bind(input.orderDate, input.deviceId ?? null, input.displayName ?? null, input.now),
  ]);
}

export async function setOrderLocked(db: D1Database, input: AdminLockInput): Promise<void> {
  await db.batch([
    db
      .prepare(
        "INSERT INTO daily_orders (order_date, share_count, revision, locked, updated_at) VALUES (?, 1, 0, 0, ?) ON CONFLICT(order_date) DO NOTHING",
      )
      .bind(input.orderDate, input.now),
    db
      .prepare("UPDATE daily_orders SET locked = ?, revision = revision + 1, updated_at = ? WHERE order_date = ?")
      .bind(input.locked ? 1 : 0, input.now, input.orderDate),
    db
      .prepare(
        "INSERT INTO activity_log (order_date, device_id, display_name, action, details_json, created_at) VALUES (?, ?, ?, 'set_order_locked', ?, ?)",
      )
      .bind(
        input.orderDate,
        input.deviceId ?? null,
        input.displayName ?? null,
        JSON.stringify({ locked: input.locked }),
        input.now,
      ),
  ]);
}
