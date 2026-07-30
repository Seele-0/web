import { runAutomaticLockFallback } from "../../_lib/automatic-lock";
import type { Env } from "../../_lib/env";
import { errorResponse, json, readJson } from "../../_lib/http";
import { setShareCount } from "../../_lib/order-repository";
import { parseShareCountRequest } from "../../_lib/validation";

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await runAutomaticLockFallback(env.DB);
    const validated = parseShareCountRequest(await readJson<unknown>(request));
    const snapshot = await setShareCount(env.DB, { ...validated, now: new Date().toISOString() });
    return json(snapshot, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
};
