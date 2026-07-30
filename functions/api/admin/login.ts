import { createAdminSessionCookie, passwordsMatch } from "../../_lib/admin-session";
import type { Env } from "../../_lib/env";
import { errorResponse, HttpError, json, readJson } from "../../_lib/http";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const input = await readJson<{ password?: unknown }>(request);
    if (typeof input.password !== "string" || !(await passwordsMatch(input.password, env.ADMIN_PASSWORD))) {
      throw new HttpError(401, "invalid_admin_password", "管理员密码错误");
    }
    const response = json({ authenticated: true });
    response.headers.set("Set-Cookie", await createAdminSessionCookie(env));
    return response;
  } catch (error) {
    return errorResponse(error);
  }
};
