import { parseOrderImportText } from "../../src/domain/import-text";
import { HttpError } from "./http";

export const ADMIN_IMPORT_DEVICE_ID = "admin-import";
export const ADMIN_IMPORT_DISPLAY_NAME = "管理员导入";

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
export type ReplaceOrderInput = { orderDate: string; text: string; now: string };
export type AdminOrderItemInput = {
  orderDate: string;
  name: string;
  priceCents: number;
  quantity: number;
  now: string;
};
export type DeleteOrderItemInput = { orderDate: string; menuItemId: string; now: string };
export type AdminContributionInput = {
  orderDate: string;
  menuItemId: string;
  deviceId: string;
  displayName: string;
  quantity: number;
  now: string;
};

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

export type AdminOrderRepositoryOperations = {
  replaceOrderFromText(db: D1Database, input: ReplaceOrderInput): Promise<OrderSnapshot>;
  upsertAdminOrderItem(db: D1Database, input: AdminOrderItemInput): Promise<OrderSnapshot>;
  deleteOrderItem(db: D1Database, input: DeleteOrderItemInput): Promise<OrderSnapshot>;
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
const MIN_PRICE_CENTS = 1;
const MAX_PRICE_CENTS = 10_000_000;

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

function ensureOrderStatement(db: D1Database, orderDate: string, now: string): D1PreparedStatement {
  return db
    .prepare(
      "INSERT INTO daily_orders (order_date, share_count, revision, locked, updated_at) VALUES (?, 1, 0, 0, ?) ON CONFLICT(order_date) DO NOTHING",
    )
    .bind(orderDate, now);
}

const ORDER_UNLOCKED_GUARD = "EXISTS (SELECT 1 FROM daily_orders WHERE order_date = ? AND locked = 0)";

function orderLockStatusStatement(db: D1Database, orderDate: string): D1PreparedStatement {
  return db.prepare("SELECT locked FROM daily_orders WHERE order_date = ?").bind(orderDate);
}

function assertBatchRemainedUnlocked(results: Array<{ results?: unknown[] }>): void {
  const row = results.at(-1)?.results?.[0] as { locked?: number } | undefined;
  if (row?.locked) throw new HttpError(423, "order_locked", "订单已锁定");
}

function conditionalMenuRevisionStatement(
  db: D1Database,
  orderDate: string,
  now: string,
): D1PreparedStatement {
  return db.prepare(
    `INSERT INTO settings (key, value, updated_at)
     SELECT 'menu_revision', '1', ?
     WHERE changes() > 0 AND ${ORDER_UNLOCKED_GUARD}
     ON CONFLICT(key) DO UPDATE SET
       value = CAST(CAST(settings.value AS INTEGER) + 1 AS TEXT),
       updated_at = excluded.updated_at`,
  ).bind(now, orderDate);
}

function serializedAdminMenuItems(items: Array<{ name: string; priceCents: number }>): string {
  return JSON.stringify(items.map((item, index) => ({
    id: `dish-${crypto.randomUUID()}`,
    name: item.name,
    priceCents: item.priceCents,
    sortOffset: index + 1,
  })));
}

function insertOrReactivateMenuItemsStatement(
  db: D1Database,
  orderDate: string,
  serializedItems: string,
  now: string,
): D1PreparedStatement {
  return db.prepare(
    `WITH input AS (
       SELECT json_extract(value, '$.id') AS id,
              json_extract(value, '$.name') AS name,
              CAST(json_extract(value, '$.priceCents') AS INTEGER) AS price_cents,
              CAST(json_extract(value, '$.sortOffset') AS INTEGER) AS sort_offset
       FROM json_each(?)
     ), sort_base AS (
       SELECT COALESCE(MAX(sort_order), 0) AS maximum_sort_order FROM menu_items
     )
     INSERT INTO menu_items (id, name, price_cents, sort_order, active, created_at, updated_at)
     SELECT input.id, input.name, input.price_cents,
            sort_base.maximum_sort_order + input.sort_offset,
            1, ?, ?
     FROM input CROSS JOIN sort_base
     WHERE ${ORDER_UNLOCKED_GUARD}
     ON CONFLICT(name) DO UPDATE SET
       price_cents = excluded.price_cents,
       active = 1,
       updated_at = excluded.updated_at
     WHERE menu_items.active = 0`,
  ).bind(serializedItems, now, now, orderDate);
}

function validateAdminOrderItem(input: AdminOrderItemInput): { name: string; priceCents: number; quantity: number } {
  const name = input.name.trim();
  if (name.length < 1 || name.length > 80) {
    throw new HttpError(400, "invalid_order_item_name", "菜品名称长度必须为 1 到 80 个字符");
  }
  if (!Number.isInteger(input.priceCents) || input.priceCents < MIN_PRICE_CENTS || input.priceCents > MAX_PRICE_CENTS) {
    throw new HttpError(400, "invalid_order_item_price", "菜品价格必须为 1 到 10000000 分的整数");
  }
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 999) {
    throw new HttpError(400, "invalid_order_item_quantity", "菜品数量必须为 1 到 999 的整数");
  }
  return { name, priceCents: input.priceCents, quantity: input.quantity };
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
    ensureOrderStatement(db, input.orderDate, input.now),
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
           updated_at = excluded.updated_at`,
      )
      .bind(
        input.orderDate,
        input.menuItemId,
        input.deviceId,
        input.displayName,
        input.delta,
        input.now,
        input.delta,
      ),
    db
      .prepare(
        "DELETE FROM order_contributions WHERE order_date = ? AND menu_item_id = ? AND device_id = ? AND quantity <= 0",
      )
      .bind(input.orderDate, input.menuItemId, input.deviceId),
    db
      .prepare(
        "UPDATE daily_orders SET revision = revision + 1, updated_at = ? WHERE order_date = ?",
      )
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
  await db.batch(statements);
  return getOrderSnapshot(db, input.orderDate);
}

export async function setShareCount(db: D1Database, input: ShareCountInput): Promise<OrderSnapshot> {
  if (!Number.isInteger(input.shareCount) || input.shareCount < 1 || input.shareCount > 100) {
    throw new HttpError(400, "invalid_share_count", "份数必须为 1 到 100 的整数");
  }
  if (await operationExists(db, input.operationId)) return getOrderSnapshot(db, input.orderDate);
  assertUnlocked(await getOrderRow(db, input.orderDate));

  await db.batch([
    ensureOrderStatement(db, input.orderDate, input.now),
    db
      .prepare(
        "INSERT INTO operations (operation_id, order_date, device_id, operation_type, payload_json, created_at) VALUES (?, ?, ?, 'share_count', ?, ?)",
      )
      .bind(input.operationId, input.orderDate, input.deviceId, JSON.stringify({ shareCount: input.shareCount }), input.now),
    db.prepare("UPDATE daily_orders SET share_count = ?, revision = revision + 1, updated_at = ? WHERE order_date = ?")
      .bind(input.shareCount, input.now, input.orderDate),
    db
      .prepare(
        "INSERT INTO activity_log (order_date, device_id, display_name, action, details_json, created_at) VALUES (?, ?, ?, 'set_share_count', ?, ?)",
      )
      .bind(input.orderDate, input.deviceId, input.displayName, JSON.stringify({ shareCount: input.shareCount }), input.now),
  ]);
  return getOrderSnapshot(db, input.orderDate);
}

export async function replaceOrderFromText(db: D1Database, input: ReplaceOrderInput): Promise<OrderSnapshot> {
  assertUnlocked(await getOrderRow(db, input.orderDate));
  const parsed = parseOrderImportText(input.text);
  if (parsed.errors.length > 0 || parsed.items.length === 0) {
    throw new HttpError(400, "invalid_order_text", parsed.errors[0]?.message ?? "订单不能为空");
  }
  if (parsed.items.some((item) => item.name.length > 80)) {
    throw new HttpError(400, "invalid_order_text", "菜品名称长度必须为 1 到 80 个字符");
  }

  const serializedItems = serializedAdminMenuItems(parsed.items);
  const results = await db.batch([
    ensureOrderStatement(db, input.orderDate, input.now),
    db.prepare(`DELETE FROM order_contributions WHERE order_date = ? AND ${ORDER_UNLOCKED_GUARD}`)
      .bind(input.orderDate, input.orderDate),
    db.prepare(`DELETE FROM order_items WHERE order_date = ? AND ${ORDER_UNLOCKED_GUARD}`)
      .bind(input.orderDate, input.orderDate),
    insertOrReactivateMenuItemsStatement(db, input.orderDate, serializedItems, input.now),
    conditionalMenuRevisionStatement(db, input.orderDate, input.now),
    db.prepare(
      `INSERT INTO order_items
        (order_date, menu_item_id, name, price_cents, sort_order, created_at, updated_at)
       SELECT ?, m.id, json_extract(value, '$.name'),
              CAST(json_extract(value, '$.priceCents') AS INTEGER),
              CAST(json_extract(value, '$.sortOffset') AS INTEGER), ?, ?
       FROM json_each(?)
       JOIN menu_items m ON m.name = json_extract(value, '$.name')
       WHERE ${ORDER_UNLOCKED_GUARD}`,
    ).bind(input.orderDate, input.now, input.now, serializedItems, input.orderDate),
    db.prepare(
      `INSERT INTO order_contributions
        (order_date, menu_item_id, device_id, display_name, quantity, updated_at)
       SELECT ?, m.id, ?, ?, CAST(json_extract(value, '$.quantity') AS INTEGER), ?
       FROM json_each(?)
       JOIN menu_items m ON m.name = json_extract(value, '$.name')
       WHERE ${ORDER_UNLOCKED_GUARD}`,
    ).bind(
      input.orderDate,
      ADMIN_IMPORT_DEVICE_ID,
      ADMIN_IMPORT_DISPLAY_NAME,
      input.now,
      JSON.stringify(parsed.items),
      input.orderDate,
    ),
    db.prepare(
      `UPDATE daily_orders SET revision = revision + 1, updated_at = ?
       WHERE order_date = ? AND ${ORDER_UNLOCKED_GUARD}`,
    ).bind(input.now, input.orderDate, input.orderDate),
    db.prepare(
      `INSERT INTO activity_log (order_date, device_id, display_name, action, details_json, created_at)
       SELECT ?, ?, ?, 'replace_order', ?, ?
       WHERE ${ORDER_UNLOCKED_GUARD}`,
    ).bind(
      input.orderDate,
      ADMIN_IMPORT_DEVICE_ID,
      ADMIN_IMPORT_DISPLAY_NAME,
      JSON.stringify({ itemCount: parsed.items.length }),
      input.now,
      input.orderDate,
    ),
    orderLockStatusStatement(db, input.orderDate),
  ]);
  assertBatchRemainedUnlocked(results);
  return getOrderSnapshot(db, input.orderDate);
}

export async function upsertAdminOrderItem(db: D1Database, input: AdminOrderItemInput): Promise<OrderSnapshot> {
  const { name, priceCents, quantity } = validateAdminOrderItem(input);
  assertUnlocked(await getOrderRow(db, input.orderDate));
  const serializedItems = serializedAdminMenuItems([{ name, priceCents }]);
  const results = await db.batch([
    ensureOrderStatement(db, input.orderDate, input.now),
    insertOrReactivateMenuItemsStatement(db, input.orderDate, serializedItems, input.now),
    conditionalMenuRevisionStatement(db, input.orderDate, input.now),
    db.prepare(
      `INSERT INTO order_items
        (order_date, menu_item_id, name, price_cents, sort_order, created_at, updated_at)
       SELECT ?, m.id, json_extract(value, '$.name'),
              CAST(json_extract(value, '$.priceCents') AS INTEGER), m.sort_order, ?, ?
       FROM json_each(?)
       JOIN menu_items m ON m.name = json_extract(value, '$.name')
       WHERE ${ORDER_UNLOCKED_GUARD}
       ON CONFLICT(order_date, menu_item_id) DO UPDATE SET
         name = excluded.name,
         price_cents = excluded.price_cents,
         sort_order = excluded.sort_order,
         updated_at = excluded.updated_at`,
    ).bind(input.orderDate, input.now, input.now, serializedItems, input.orderDate),
    db.prepare(
      `INSERT INTO order_contributions
        (order_date, menu_item_id, device_id, display_name, quantity, updated_at)
       SELECT ?, m.id, ?, ?, ?, ?
       FROM json_each(?)
       JOIN menu_items m ON m.name = json_extract(value, '$.name')
       WHERE ${ORDER_UNLOCKED_GUARD}
       ON CONFLICT(order_date, menu_item_id, device_id) DO UPDATE SET
         display_name = excluded.display_name,
         quantity = excluded.quantity,
         updated_at = excluded.updated_at`,
    ).bind(
      input.orderDate,
      ADMIN_IMPORT_DEVICE_ID,
      ADMIN_IMPORT_DISPLAY_NAME,
      quantity,
      input.now,
      serializedItems,
      input.orderDate,
    ),
    db.prepare(
      `UPDATE daily_orders SET revision = revision + 1, updated_at = ?
       WHERE order_date = ? AND ${ORDER_UNLOCKED_GUARD}`,
    ).bind(input.now, input.orderDate, input.orderDate),
    db.prepare(
      `INSERT INTO activity_log (order_date, device_id, display_name, action, details_json, created_at)
       SELECT ?, ?, ?, 'upsert_admin_order_item', ?, ?
       WHERE ${ORDER_UNLOCKED_GUARD}`,
    ).bind(
      input.orderDate,
      ADMIN_IMPORT_DEVICE_ID,
      ADMIN_IMPORT_DISPLAY_NAME,
      JSON.stringify({ name, priceCents, quantity }),
      input.now,
      input.orderDate,
    ),
    orderLockStatusStatement(db, input.orderDate),
  ]);
  assertBatchRemainedUnlocked(results);
  return getOrderSnapshot(db, input.orderDate);
}

export async function deleteOrderItem(db: D1Database, input: DeleteOrderItemInput): Promise<OrderSnapshot> {
  assertUnlocked(await getOrderRow(db, input.orderDate));
  const results = await db.batch([
    db.prepare(
      `DELETE FROM order_contributions
       WHERE order_date = ? AND menu_item_id = ? AND ${ORDER_UNLOCKED_GUARD}`,
    ).bind(input.orderDate, input.menuItemId, input.orderDate),
    db.prepare(
      `DELETE FROM order_items
       WHERE order_date = ? AND menu_item_id = ? AND ${ORDER_UNLOCKED_GUARD}`,
    ).bind(input.orderDate, input.menuItemId, input.orderDate),
    db.prepare(
      `UPDATE daily_orders SET revision = revision + 1, updated_at = ?
       WHERE order_date = ? AND changes() > 0 AND ${ORDER_UNLOCKED_GUARD}`,
    ).bind(input.now, input.orderDate, input.orderDate),
    db.prepare(
      `INSERT INTO activity_log (order_date, action, details_json, created_at)
       SELECT ?, 'delete_order_item', json_object('menuItemId', ?), ?
       WHERE changes() > 0 AND ${ORDER_UNLOCKED_GUARD}`,
    ).bind(input.orderDate, input.menuItemId, input.now, input.orderDate),
    orderLockStatusStatement(db, input.orderDate),
  ]);
  assertBatchRemainedUnlocked(results);
  return getOrderSnapshot(db, input.orderDate);
}

export async function setAdminContribution(db: D1Database, input: AdminContributionInput): Promise<OrderSnapshot> {
  const displayName = input.displayName.trim();
  if (!input.menuItemId || !input.deviceId || displayName.length < 1 || displayName.length > 30
    || !Number.isInteger(input.quantity) || input.quantity < 0 || input.quantity > 999) {
    throw new HttpError(400, "invalid_contribution", "贡献修正参数无效");
  }
  assertUnlocked(await getOrderRow(db, input.orderDate));
  const menuItem = await db.prepare("SELECT id FROM menu_items WHERE id = ?").bind(input.menuItemId).first();
  if (!menuItem) throw new HttpError(404, "menu_item_not_found", "菜品不存在");

  const results = await db.batch([
    ensureOrderStatement(db, input.orderDate, input.now),
    db.prepare(
      `INSERT INTO order_items
        (order_date, menu_item_id, name, price_cents, sort_order, created_at, updated_at)
       SELECT ?, id, name, price_cents, sort_order, ?, ?
       FROM menu_items
       WHERE id = ? AND ${ORDER_UNLOCKED_GUARD}
       ON CONFLICT(order_date, menu_item_id) DO NOTHING`,
    ).bind(input.orderDate, input.now, input.now, input.menuItemId, input.orderDate),
    db.prepare(
      `DELETE FROM order_contributions
       WHERE order_date = ? AND menu_item_id = ? AND device_id = ? AND ?
         AND ${ORDER_UNLOCKED_GUARD}`,
    ).bind(input.orderDate, input.menuItemId, input.deviceId, input.quantity === 0 ? 1 : 0, input.orderDate),
    db.prepare(
      `INSERT INTO order_contributions (order_date, menu_item_id, device_id, display_name, quantity, updated_at)
       SELECT ?, ?, ?, ?, ?, ?
       WHERE ? AND ${ORDER_UNLOCKED_GUARD}
       ON CONFLICT(order_date, menu_item_id, device_id) DO UPDATE SET
         display_name = excluded.display_name,
         quantity = excluded.quantity,
         updated_at = excluded.updated_at`,
    ).bind(
      input.orderDate,
      input.menuItemId,
      input.deviceId,
      displayName,
      input.quantity,
      input.now,
      input.quantity > 0 ? 1 : 0,
      input.orderDate,
    ),
    db.prepare(
      `DELETE FROM order_items
       WHERE order_date = ? AND menu_item_id = ? AND ${ORDER_UNLOCKED_GUARD}
         AND NOT EXISTS (
           SELECT 1 FROM order_contributions
           WHERE order_date = ? AND menu_item_id = ?
         )`,
    ).bind(input.orderDate, input.menuItemId, input.orderDate, input.orderDate, input.menuItemId),
    db.prepare(
      `UPDATE daily_orders SET revision = revision + 1, updated_at = ?
       WHERE order_date = ? AND ${ORDER_UNLOCKED_GUARD}`,
    ).bind(input.now, input.orderDate, input.orderDate),
    db.prepare(
      `INSERT INTO activity_log (order_date, device_id, display_name, action, details_json, created_at)
       SELECT ?, ?, ?, 'admin_correct_contribution', ?, ?
       WHERE ${ORDER_UNLOCKED_GUARD}`,
    ).bind(
      input.orderDate,
      input.deviceId,
      displayName,
      JSON.stringify({ menuItemId: input.menuItemId, quantity: input.quantity }),
      input.now,
      input.orderDate,
    ),
    orderLockStatusStatement(db, input.orderDate),
  ]);
  assertBatchRemainedUnlocked(results);
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

export async function clearOrder(db: D1Database, input: AdminClearInput): Promise<OrderSnapshot> {
  assertUnlocked(await getOrderRow(db, input.orderDate));
  const results = await db.batch([
    ensureOrderStatement(db, input.orderDate, input.now),
    db.prepare(`DELETE FROM order_contributions WHERE order_date = ? AND ${ORDER_UNLOCKED_GUARD}`)
      .bind(input.orderDate, input.orderDate),
    db.prepare(`DELETE FROM order_items WHERE order_date = ? AND ${ORDER_UNLOCKED_GUARD}`)
      .bind(input.orderDate, input.orderDate),
    db.prepare(
      `UPDATE daily_orders SET revision = revision + 1, updated_at = ?
       WHERE order_date = ? AND ${ORDER_UNLOCKED_GUARD}`,
    ).bind(input.now, input.orderDate, input.orderDate),
    db.prepare(
      `INSERT INTO activity_log (order_date, device_id, display_name, action, details_json, created_at)
       SELECT ?, ?, ?, 'clear_order', '{}', ?
       WHERE ${ORDER_UNLOCKED_GUARD}`,
    ).bind(input.orderDate, input.deviceId ?? null, input.displayName ?? null, input.now, input.orderDate),
    orderLockStatusStatement(db, input.orderDate),
  ]);
  assertBatchRemainedUnlocked(results);
  return getOrderSnapshot(db, input.orderDate);
}

export async function setOrderLocked(db: D1Database, input: AdminLockInput): Promise<void> {
  await db.batch([
    ensureOrderStatement(db, input.orderDate, input.now),
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
