import { getShanghaiBusinessDate } from "./date";
import { HttpError } from "./http";
import { isMealPeriod, type MealPeriod } from "../../src/domain/meal-period";

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type AdjustRequest = {
  operationId: string;
  orderDate: string;
  mealPeriod: MealPeriod;
  menuItemId: string;
  deviceId: string;
  displayName: string;
  delta: 1 | -1;
};

function objectValue(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new HttpError(400, "invalid_request", "请求内容格式无效");
  }
  return input as Record<string, unknown>;
}

function identifier(value: unknown, field: string): string {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) {
    throw new HttpError(400, "invalid_identifier", `${field} 格式无效`);
  }
  return value;
}

export function parseAdjustRequest(input: unknown, today = getShanghaiBusinessDate()): AdjustRequest {
  const value = objectValue(input);
  const orderDate = typeof value.orderDate === "string" ? value.orderDate : "";
  const mealPeriod = value.mealPeriod === undefined ? "lunch" : value.mealPeriod;
  if (!isMealPeriod(mealPeriod)) {
    throw new HttpError(400, "invalid_meal_period", "点餐时段无效");
  }
  if (!DATE_PATTERN.test(orderDate)) {
    throw new HttpError(400, "invalid_date", "订单日期格式无效");
  }
  if (orderDate !== today) {
    throw new HttpError(403, "historical_order_read_only", "普通用户只能修改当天订单");
  }
  if (value.delta !== 1 && value.delta !== -1) {
    throw new HttpError(400, "invalid_delta", "单次调整只能为 +1 或 -1");
  }
  const displayName = typeof value.displayName === "string" ? value.displayName.trim() : "";
  if (displayName.length < 1 || displayName.length > 30) {
    throw new HttpError(400, "invalid_display_name", "姓名长度必须为 1 到 30 个字符");
  }

  return {
    operationId: identifier(value.operationId, "operationId"),
    orderDate,
    mealPeriod,
    menuItemId: identifier(value.menuItemId, "menuItemId"),
    deviceId: identifier(value.deviceId, "deviceId"),
    displayName,
    delta: value.delta,
  };
}


export type ShareCountRequest = {
  operationId: string;
  orderDate: string;
  mealPeriod: MealPeriod;
  deviceId: string;
  displayName: string;
  shareCount: number;
};

export function parseShareCountRequest(input: unknown, today = getShanghaiBusinessDate()): ShareCountRequest {
  const value = objectValue(input);
  const orderDate = typeof value.orderDate === "string" ? value.orderDate : "";
  const mealPeriod = value.mealPeriod === undefined ? "lunch" : value.mealPeriod;
  if (!isMealPeriod(mealPeriod)) {
    throw new HttpError(400, "invalid_meal_period", "点餐时段无效");
  }
  if (!DATE_PATTERN.test(orderDate)) {
    throw new HttpError(400, "invalid_date", "订单日期格式无效");
  }
  if (orderDate !== today) {
    throw new HttpError(403, "historical_order_read_only", "普通用户只能修改当天订单");
  }
  if (!Number.isInteger(value.shareCount) || (value.shareCount as number) < 1 || (value.shareCount as number) > 100) {
    throw new HttpError(400, "invalid_share_count", "均摊人数必须为 1 到 100");
  }
  const displayName = typeof value.displayName === "string" ? value.displayName.trim() : "";
  if (displayName.length < 1 || displayName.length > 30) {
    throw new HttpError(400, "invalid_display_name", "姓名长度必须为 1 到 30 个字符");
  }
  return {
    operationId: identifier(value.operationId, "operationId"),
    orderDate,
    mealPeriod,
    deviceId: identifier(value.deviceId, "deviceId"),
    displayName,
    shareCount: value.shareCount as number,
  };
}
