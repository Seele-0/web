import type { Env } from "../../_lib/env";
import { errorResponse, json, readJson } from "../../_lib/http";
import { adjustContribution } from "../../_lib/order-repository";
import { parseAdjustRequest } from "../../_lib/validation";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const validated = parseAdjustRequest(await readJson<unknown>(request));
    const snapshot = await adjustContribution(env.DB, { ...validated, now: new Date().toISOString() });
    return json(snapshot, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
};
