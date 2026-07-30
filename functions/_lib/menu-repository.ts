import { parseMenuImportText } from "../../src/domain/import-text";
import { getShanghaiBusinessDate } from "./date";
import { HttpError } from "./http";

type MenuRow = { id: string; name: string; price_cents: number; sort_order: number };

type ExistingMenuRow = MenuRow & { active: number };

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

async function getNextSortOrder(db: D1Database): Promise<number> {
  const row = await db.prepare(
    "SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_sort_order FROM menu_items",
  ).first<{ next_sort_order: number }>();
  return row?.next_sort_order ?? 1;
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

  const statements: D1PreparedStatement[] = [
    db.prepare("UPDATE menu_items SET active = 0, updated_at = ?").bind(now),
  ];
  for (const [index, item] of parsed.items.entries()) {
    statements.push(
      db.prepare(
        `INSERT INTO menu_items (id, name, price_cents, sort_order, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, ?, ?)
         ON CONFLICT(name) DO UPDATE SET
           price_cents = excluded.price_cents,
           sort_order = excluded.sort_order,
           active = 1,
           updated_at = excluded.updated_at`,
      ).bind(
        `dish-${crypto.randomUUID()}`,
        item.name,
        item.priceCents,
        index + 1,
        now,
        now,
      ),
    );
  }
  statements.push(
    menuRevisionStatement(db, now),
    activityStatement(db, "replace_menu", { itemCount: parsed.items.length }, now),
  );
  await db.batch(statements);
  return parsed;
}

export async function upsertMenuItem(
  db: D1Database,
  input: MenuWriteInput,
): Promise<MenuItemRecord> {
  const { name, priceCents } = validateMenuWriteInput(input);
  const existing = await db.prepare(
    "SELECT id, name, price_cents, sort_order, active FROM menu_items WHERE name = ?",
  ).bind(name).first<ExistingMenuRow>();
  const record: MenuItemRecord = existing
    ? { id: existing.id, name, priceCents, sortOrder: existing.sort_order }
    : {
        id: `dish-${crypto.randomUUID()}`,
        name,
        priceCents,
        sortOrder: await getNextSortOrder(db),
      };

  await db.batch([
    db.prepare(
      `INSERT INTO menu_items (id, name, price_cents, sort_order, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?)
       ON CONFLICT(name) DO UPDATE SET
         price_cents = excluded.price_cents,
         active = 1,
         updated_at = excluded.updated_at`,
    ).bind(
      record.id,
      record.name,
      record.priceCents,
      record.sortOrder,
      input.now,
      input.now,
    ),
    menuRevisionStatement(db, input.now),
    activityStatement(db, "upsert_menu_item", {
      menuItemId: record.id,
      name: record.name,
      priceCents: record.priceCents,
    }, input.now),
  ]);

  return record;
}

export async function deleteMenuItem(
  db: D1Database,
  input: MenuDeleteInput,
): Promise<void> {
  const existing = await db.prepare(
    "SELECT id, name, price_cents, sort_order, active FROM menu_items WHERE id = ? AND active = 1",
  ).bind(input.menuItemId).first<ExistingMenuRow>();
  if (!existing) {
    throw new HttpError(404, "menu_item_not_found", "菜品不存在");
  }

  await db.batch([
    db.prepare(
      "UPDATE menu_items SET active = 0, updated_at = ? WHERE id = ? AND active = 1",
    ).bind(input.now, input.menuItemId),
    menuRevisionStatement(db, input.now),
    activityStatement(db, "delete_menu_item", {
      menuItemId: existing.id,
      name: existing.name,
    }, input.now),
  ]);
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
    .flatMap((source) => {
      const trimmed = source.trim();
      if (!trimmed || /^#{1,6}(?:\s|$)/.test(trimmed)) return [];
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
        return [];
      }
      return columns.length === 2 ? [`${columns[0]} -- ${columns[1]}`] : [source];
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
