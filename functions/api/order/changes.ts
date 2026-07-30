import type { Env } from "../../_lib/env";
import { errorResponse, HttpError, json } from "../../_lib/http";
import { getOrderSnapshot } from "../../_lib/order-repository";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const url = new URL(request.url);
    const orderDate = url.searchParams.get("date") ?? "";
    const since = Number(url.searchParams.get("since"));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(orderDate) || !Number.isInteger(since) || since < 0) {
      throw new HttpError(400, "invalid_poll_request", "轮询参数无效");
    }
    const snapshot = await getOrderSnapshot(env.DB, orderDate);
    return json(
      snapshot.revision === since
        ? { changed: false, revision: snapshot.revision }
        : { changed: true, revision: snapshot.revision, order: snapshot },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
};
