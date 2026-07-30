import { verifyAdminRequest } from "../../../_lib/admin-session";
import type { Env } from "../../../_lib/env";
import { errorResponse, HttpError, json, readJson } from "../../../_lib/http";
import { clearOrder, getOrderSnapshot } from "../../../_lib/order-repository";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await verifyAdminRequest(request, env);
    const input = await readJson<{ orderDate?: unknown }>(request);
    if (typeof input.orderDate !== "string") throw new HttpError(400, "invalid_date", "订单日期无效");
    await clearOrder(env.DB, { orderDate: input.orderDate, now: new Date().toISOString() });
    return json(await getOrderSnapshot(env.DB, input.orderDate));
  } catch (error) { return errorResponse(error); }
};
