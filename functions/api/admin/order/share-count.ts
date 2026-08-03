import { runAutomaticLockFallback } from "../../../_lib/automatic-lock";
import { verifyAdminRequest } from "../../../_lib/admin-session";
import { requireMealPeriod, requireOrderDate } from "../../../_lib/admin-input";
import type { Env } from "../../../_lib/env";
import { errorResponse, HttpError, json, readJson } from "../../../_lib/http";
import {
  ADMIN_IMPORT_DEVICE_ID,
  ADMIN_IMPORT_DISPLAY_NAME,
  setShareCount,
} from "../../../_lib/order-repository";

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await verifyAdminRequest(request, env);
    await runAutomaticLockFallback(env.DB);

    const input = await readJson<{ orderDate?: unknown; mealPeriod?: unknown; shareCount?: unknown }>(request);
    const orderDate = requireOrderDate(input.orderDate);
    const mealPeriod = requireMealPeriod(input.mealPeriod);
    if (
      typeof input.shareCount !== "number"
      || !Number.isInteger(input.shareCount)
      || input.shareCount < 1
      || input.shareCount > 100
    ) {
      throw new HttpError(400, "invalid_share_count", "人数必须为 1 到 100 的整数");
    }

    return json(await setShareCount(env.DB, {
      operationId: crypto.randomUUID(),
      orderDate,
      mealPeriod,
      deviceId: ADMIN_IMPORT_DEVICE_ID,
      displayName: ADMIN_IMPORT_DISPLAY_NAME,
      shareCount: input.shareCount,
      now: new Date().toISOString(),
    }));
  } catch (error) {
    return errorResponse(error);
  }
};
