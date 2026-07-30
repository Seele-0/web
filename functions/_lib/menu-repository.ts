import { parseMenuImportText } from "../../src/domain/import-text";
import { getShanghaiBusinessDate } from "./date";
import { HttpError } from "./http";

type MenuRow = { id: string; name: string; price_cents: number; sort_order: number };


export type MenuWriteInput = { name: string; priceCents: number; now: string };
export type MenuDeleteInput = { menuItemId: string; now: string };
export type MenuItemRecord = { id: string; name: string; priceCents: number; sortOrder: number };

export type MenuRepositoryOperations = {
  replaceMenuFromText: typeof replaceMenuFromText;
  upsertMenuItem: typeof upsertMenuItem;
  deleteMenuItem: typeof deleteMenuItem;
  clearMenu: typeof clearMenu;
};

export type MenuConfiguration = {
  restaurantName: string;
  menu: Array<{ id: string; name: string; priceCents: number; sortOrder: number; active: true }>;
  configurationRevision: number;
};

const MIN_PRICE_CENTS = 1;
const MAX_PRICE_CENTS = 10_000_000;

function validateMenuWriteInput(input: MenuWriteInput): { name: string; priceCents: number } {
  const name = input.name.trim();
  if (name.length < 1 || name.length > 80) {
    throw new HttpError(
      400,
      "invalid_menu_item_name",
      "菜品名称长度必须为 1 到 80 个字符",
    );
  }
  if (
    !Number.isInteger(input.priceCents)
    || input.priceCents < MIN_PRICE_CENTS
    || input.priceCents > MAX_PRICE_CENTS
  ) {
    throw new HttpError(
      400,
      "invalid_menu_item_price",
      "菜品价格必须为 1 到 10000000 分的整数",
    );
  }
  return { name, priceCents: input.priceCents };
}

function menuRevisionStatement(db: D1Database, now: string): D1PreparedStatement {
  return db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES ('menu_revision', '1', ?)
     ON CONFLICT(key) DO UPDATE SET
       value = CAST(CAST(settings.value AS INTEGER) + 1 AS TEXT),
       updated_at = excluded.updated_at`,
  ).bind(now);
}

function activityStatement(
  db: D1Database,
  action: string,
  details: Record<string, unknown>,
  now: string,
): D1PreparedStatement {
  return db.prepare(
    "INSERT INTO activity_log (order_date, action, details_json, created_at) VALUES (?, ?, ?, ?)",
  ).bind(
    getShanghaiBusinessDate(new Date(now)),
    action,
    JSON.stringify(details),
    now,
  );
}

export async function getMenuConfiguration(db: D1Database): Promise<MenuConfiguration> {
  const [settingsResult, menuResult] = await Promise.all([
    db.prepare(
      "SELECT key, value FROM settings WHERE key IN ('restaurant_name', 'menu_revision')",
    ).all<{ key: string; value: string }>(),
    db.prepare(
      "SELECT id, name, price_cents, sort_order FROM menu_items WHERE active = 1 ORDER BY sort_order, name",
    ).all<MenuRow>(),
  ]);
  const settings = new Map(settingsResult.results.map((row) => [row.key, row.value]));
  return {
    restaurantName: settings.get("restaurant_name") ?? "今日点餐",
    configurationRevision: Number(settings.get("menu_revision") ?? 0),
    menu: menuResult.results.map((item) => ({
      id: item.id,
      name: item.name,
      priceCents: item.price_cents,
      sortOrder: item.sort_order,
      active: true,
    })),
  };
}

export async function replaceMenuFromText(
  db: D1Database,
  text: string,
  now: string,
): Promise<ReturnType<typeof parseMenuImportText>> {
  const parsed = parseMenuImportText(text);
  if (parsed.errors.length > 0 || parsed.items.length === 0) {
    throw new HttpError(
      400,
      "invalid_menu_text",
      parsed.errors[0]?.message ?? "菜单不能为空",
    );
  }

  if (parsed.items.some((item) => item.name.length > 80)) {
    throw new HttpError(
      400,
      "invalid_menu_text",
      "菜品名称长度必须为 1 到 80 个字符",
    );
  }

  const serializedItems = JSON.stringify(parsed.items.map((item, index) => ({
    id: `dish-${crypto.randomUUID()}`,
    name: item.name,
    priceCents: item.priceCents,
    sortOrder: index + 1,
  })));
  await db.batch([
    db.prepare("UPDATE menu_items SET active = 0, updated_at = ?").bind(now),
    db.prepare(
      `INSERT INTO menu_items (id, name, price_cents, sort_order, active, created_at, updated_at)
       SELECT
         json_extract(value, '$.id'),
         json_extract(value, '$.name'),
         CAST(json_extract(value, '$.priceCents') AS INTEGER),
         CAST(json_extract(value, '$.sortOrder') AS INTEGER),
         1,
         ?,
         ?
       FROM json_each(?)
       WHERE true
       ON CONFLICT(name) DO UPDATE SET
         price_cents = excluded.price_cents,
         sort_order = excluded.sort_order,
         active = 1,
         updated_at = excluded.updated_at`,
    ).bind(now, now, serializedItems),
    menuRevisionStatement(db, now),
    activityStatement(db, "replace_menu", { itemCount: parsed.items.length }, now),
  ]);
  return parsed;
}

export async function upsertMenuItem(
  db: D1Database,
  input: MenuWriteInput,
): Promise<MenuItemRecord> {
  const { name, priceCents } = validateMenuWriteInput(input);
  const results = await db.batch<MenuRow>([
    db.prepare(
      `INSERT INTO menu_items (id, name, price_cents, sort_order, active, created_at, updated_at)
       SELECT ?, ?, ?, COALESCE(MAX(sort_order), 0) + 1, 1, ?, ?
       FROM menu_items
       WHERE true
       ON CONFLICT(name) DO UPDATE SET
         price_cents = excluded.price_cents,
         active = 1,
         updated_at = excluded.updated_at`,
    ).bind(`dish-${crypto.randomUUID()}`, name, priceCents, input.now, input.now),
    menuRevisionStatement(db, input.now),
    db.prepare(
      `INSERT INTO activity_log (order_date, action, details_json, created_at)
       SELECT ?, 'upsert_menu_item',
              json_object(
                'menuItemId', id,
                'name', name,
                'priceCents', price_cents
              ),
              ?
       FROM menu_items
       WHERE name = ?`,
    ).bind(getShanghaiBusinessDate(new Date(input.now)), input.now, name),
    db.prepare(
      "SELECT id, name, price_cents, sort_order FROM menu_items WHERE name = ?",
    ).bind(name),
  ]);
  const stored = results[3]?.results[0];
  if (!stored) {
    throw new Error("Upserted menu item could not be read");
  }

  return {
    id: stored.id,
    name: stored.name,
    priceCents: stored.price_cents,
    sortOrder: stored.sort_order,
  };
}

export async function deleteMenuItem(
  db: D1Database,
  input: MenuDeleteInput,
): Promise<void> {
  const results = await db.batch([
    db.prepare(
      "UPDATE menu_items SET active = 0, updated_at = ? WHERE id = ? AND active = 1",
    ).bind(input.now, input.menuItemId),
    db.prepare(
      `INSERT INTO settings (key, value, updated_at)
       SELECT 'menu_revision', '1', ?
       WHERE changes() = 1
       ON CONFLICT(key) DO UPDATE SET
         value = CAST(CAST(settings.value AS INTEGER) + 1 AS TEXT),
         updated_at = excluded.updated_at`,
    ).bind(input.now),
    db.prepare(
      `INSERT INTO activity_log (order_date, action, details_json, created_at)
       SELECT ?, 'delete_menu_item',
              json_object('menuItemId', id, 'name', name),
              ?
       FROM menu_items
       WHERE id = ? AND changes() = 1`,
    ).bind(
      getShanghaiBusinessDate(new Date(input.now)),
      input.now,
      input.menuItemId,
    ),
  ]);
  if (results[0]?.meta.changes !== 1) {
    throw new HttpError(404, "menu_item_not_found", "菜品不存在");
  }
}

export async function clearMenu(
  db: D1Database,
  input: { now: string },
): Promise<void> {
  const activeCount = await db.prepare(
    "SELECT COUNT(*) AS count FROM menu_items WHERE active = 1",
  ).first<{ count: number }>();

  await db.batch([
    db.prepare(
      "UPDATE menu_items SET active = 0, updated_at = ? WHERE active = 1",
    ).bind(input.now),
    menuRevisionStatement(db, input.now),
    activityStatement(db, "clear_menu", { itemCount: activeCount?.count ?? 0 }, input.now),
  ]);
}

function legacyMarkdownToImportText(markdown: string): string {
  return markdown
    .split(/\r?\n/)
    .map((source) => {
      const trimmed = source.trim();
      if (!trimmed || /^#{1,6}(?:\s|$)/.test(trimmed)) return "";
      const content = trimmed
        .replace(/^(?:[-+*]|\d+\.)\s*/, "")
        .replace(/^\|/, "")
        .replace(/\|$/, "");
      const columns = content.split("|").map((column) => column.trim());
      if (
        columns.length >= 2
        && (columns.every((column) => /^:?-{3,}:?$/.test(column))
          || (/菜品|名称/.test(columns[0]) && /价格|单价/.test(columns[1])))
      ) {
        return "";
      }
      return columns.length === 2 ? `${columns[0]} -- ${columns[1]}` : source;
    })
    .join("\n");
}

export async function importMenuMarkdown(db: D1Database, markdown: string, now: string) {
  return replaceMenuFromText(db, legacyMarkdownToImportText(markdown), now);
}

export async function setRestaurantName(db: D1Database, restaurantName: string, now: string): Promise<void> {
  const value = restaurantName.trim();
  if (value.length < 1 || value.length > 80) throw new HttpError(400, "invalid_restaurant_name", "餐馆名称长度必须为 1 到 80 个字符");
  await db.batch([
    db.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES ('restaurant_name', ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    ).bind(value, now),
    menuRevisionStatement(db, now),
  ]);
}
