import { verifyAdminRequest } from "../../../_lib/admin-session";
import type { Env } from "../../../_lib/env";
import { errorResponse, HttpError, json, readJson } from "../../../_lib/http";
import { getOrderSnapshot, setOrderLocked } from "../../../_lib/order-repository";

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await verifyAdminRequest(request, env);
    const input = await readJson<{ orderDate?: unknown; locked?: unknown }>(request);
    if (typeof input.orderDate !== "string" || typeof input.locked !== "boolean") throw new HttpError(400, "invalid_lock_request", "锁定参数无效");
    await setOrderLocked(env.DB, { orderDate: input.orderDate, locked: input.locked, now: new Date().toISOString() });
    return json(await getOrderSnapshot(env.DB, input.orderDate));
  } catch (error) { return errorResponse(error); }
};
