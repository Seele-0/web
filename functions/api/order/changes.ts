import { runAutomaticLockFallback } from "../../_lib/automatic-lock";
import type { Env } from "../../_lib/env";
import { errorResponse, HttpError, json } from "../../_lib/http";
import { getMenuConfiguration } from "../../_lib/menu-repository";
import { getOrderSnapshot, resolveOrderStorageId } from "../../_lib/order-repository";
import { getSyncRevisions } from "../../_lib/sync-repository";
import { isMealPeriod } from "../../../src/domain/meal-period";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await runAutomaticLockFallback(env.DB);
    const url = new URL(request.url);
    const orderDate = url.searchParams.get("date") ?? "";
    const mealPeriod = url.searchParams.get("mealPeriod") ?? "lunch";
    const since = Number(url.searchParams.get("since"));
    const configurationSinceParam = url.searchParams.get("configurationSince");
    const configurationSince = configurationSinceParam === null ? 0 : Number(configurationSinceParam);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(orderDate) || !isMealPeriod(mealPeriod) || !Number.isInteger(since) || since < 0 || !Number.isInteger(configurationSince) || configurationSince < 0) throw new HttpError(400, "invalid_poll_request", "轮询参数无效");
    const storageId = await resolveOrderStorageId(env.DB, orderDate, mealPeriod);
    const revisions = await getSyncRevisions(env.DB, storageId);
    const orderChanged = revisions.revision !== since;
    const configurationChanged = revisions.configurationRevision !== configurationSince;
    if (!orderChanged && !configurationChanged) return json({ changed: false, revision: revisions.revision, configurationRevision: revisions.configurationRevision }, { headers: { "Cache-Control": "no-store" } });
    const [order, configuration] = await Promise.all([orderChanged ? getOrderSnapshot(env.DB, orderDate, mealPeriod) : Promise.resolve(undefined), configurationChanged ? getMenuConfiguration(env.DB) : Promise.resolve(undefined)]);
    return json({ changed: Boolean(order), revision: order?.revision ?? revisions.revision, ...(order ? { order } : {}), configurationRevision: configuration?.configurationRevision ?? revisions.configurationRevision, ...(configuration ? { configuration: { restaurantName: configuration.restaurantName, menu: configuration.menu } } : {}) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
};
