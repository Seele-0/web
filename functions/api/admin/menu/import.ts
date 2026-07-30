import { verifyAdminRequest } from "../../../_lib/admin-session";
import type { Env } from "../../../_lib/env";
import { errorResponse, json, readJson } from "../../../_lib/http";
import { importMenuMarkdown } from "../../../_lib/menu-repository";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await verifyAdminRequest(request, env);
    const input = await readJson<{ markdown?: unknown }>(request, 100_000);
    if (typeof input.markdown !== "string") throw new Error("Invalid markdown");
    const result = await importMenuMarkdown(env.DB, input.markdown, new Date().toISOString());
    return json(result);
  } catch (error) { return errorResponse(error); }
};
