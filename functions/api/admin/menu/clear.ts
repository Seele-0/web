import { verifyAdminRequest } from "../../../_lib/admin-session";
import type { Env } from "../../../_lib/env";
import { errorResponse, json, readJson } from "../../../_lib/http";
import { clearMenu } from "../../../_lib/menu-repository";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await verifyAdminRequest(request, env);
    await readJson<Record<string, never>>(request);
    await clearMenu(env.DB, { now: new Date().toISOString() });
    return json({ cleared: true });
  } catch (error) {
    return errorResponse(error);
  }
};
