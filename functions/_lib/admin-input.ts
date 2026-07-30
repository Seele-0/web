import { HttpError } from "./http";

const ORDER_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export function requireOrderDate(value: unknown): string {
  if (typeof value !== "string" || !ORDER_DATE_PATTERN.test(value)) {
    throw new HttpError(400, "invalid_date", "订单日期格式无效");
  }
  return value;
}

export function requireIdentifier(value: unknown, code = "invalid_identifier", message = "标识符无效"): string {
  if (typeof value !== "string" || !IDENTIFIER_PATTERN.test(value)) {
    throw new HttpError(400, code, message);
  }
  return value;
}

export function requireMenuItemName(value: unknown, code = "invalid_menu_item_name"): string {
  const name = typeof value === "string" ? value.trim() : "";
  if (name.length < 1 || name.length > 80) {
    throw new HttpError(400, code, "菜品名称长度必须为 1 到 80 个字符");
  }
  return name;
}

export function requirePriceCents(value: unknown, code = "invalid_menu_item_price"): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 10_000_000) {
    throw new HttpError(400, code, "菜品价格必须为 1 到 10000000 分的整数");
  }
  return value;
}

export function requireQuantity(value: unknown, code = "invalid_order_item_quantity"): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 999) {
    throw new HttpError(400, code, "菜品数量必须为 1 到 999 的整数");
  }
  return value;
}
