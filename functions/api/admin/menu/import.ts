import { verifyAdminRequest } from "../../../_lib/admin-session";
import type { Env } from "../../../_lib/env";
import { errorResponse, HttpError, json, readJson } from "../../../_lib/http";
import { replaceMenuFromText } from "../../../_lib/menu-repository";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await verifyAdminRequest(request, env);
    const input = await readJson<{ text?: unknown }>(request, 100_000);
    if (typeof input.text !== "string") {
      throw new HttpError(400, "invalid_menu_text", "菜单文本格式无效");
    }
    return json(await replaceMenuFromText(env.DB, input.text, new Date().toISOString()));
  } catch (error) {
    return errorResponse(error);
  }
};
