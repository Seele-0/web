import { verifyAdminRequest } from "../../../_lib/admin-session";
import { requireOrderDate } from "../../../_lib/admin-input";
import type { Env } from "../../../_lib/env";
import { errorResponse, HttpError, json, readJson } from "../../../_lib/http";
import { replaceOrderFromText } from "../../../_lib/order-repository";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await verifyAdminRequest(request, env);
    const input = await readJson<{ orderDate?: unknown; text?: unknown }>(request, 100_000);
    const orderDate = requireOrderDate(input.orderDate);
    if (typeof input.text !== "string") {
      throw new HttpError(400, "invalid_order_text", "订单文本格式无效");
    }
    return json(await replaceOrderFromText(env.DB, { orderDate, text: input.text, now: new Date().toISOString() }));
  } catch (error) {
    return errorResponse(error);
  }
};
