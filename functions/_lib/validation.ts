import { getShanghaiBusinessDate } from "./date";
import { HttpError } from "./http";

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type AdjustRequest = {
  operationId: string;
  orderDate: string;
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
    menuItemId: identifier(value.menuItemId, "menuItemId"),
    deviceId: identifier(value.deviceId, "deviceId"),
    displayName,
    delta: value.delta,
  };
}
