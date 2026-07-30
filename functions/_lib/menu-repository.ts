import { parseMenuMarkdown } from "../../src/domain/menu-markdown";
import { getShanghaiBusinessDate } from "./date";
import { HttpError } from "./http";

export async function importMenuMarkdown(db: D1Database, markdown: string, now: string) {
  const parsed = parseMenuMarkdown(markdown);
  if (parsed.errors.length || parsed.items.length === 0) {
    throw new HttpError(400, "invalid_menu_markdown", parsed.errors[0]?.message ?? "菜单不能为空");
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
      ).bind(`dish-${crypto.randomUUID()}`, item.name, item.priceCents, index + 1, now, now),
    );
  }
  statements.push(
    db.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES ('menu_revision', '1', ?)
       ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(settings.value AS INTEGER) + 1 AS TEXT), updated_at = excluded.updated_at`,
    ).bind(now),
    db.prepare(
      "INSERT INTO activity_log (order_date, action, details_json, created_at) VALUES (?, 'import_menu', ?, ?)",
    ).bind(getShanghaiBusinessDate(new Date(now)), JSON.stringify({ itemCount: parsed.items.length }), now),
  );
  await db.batch(statements);
  return parsed;
}

export async function setRestaurantName(db: D1Database, restaurantName: string, now: string): Promise<void> {
  const value = restaurantName.trim();
  if (value.length < 1 || value.length > 80) throw new HttpError(400, "invalid_restaurant_name", "餐馆名称长度必须为 1 到 80 个字符");
  await db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES ('restaurant_name', ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).bind(value, now).run();
}
