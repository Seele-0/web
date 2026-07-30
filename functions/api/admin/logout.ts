import { clearAdminSessionCookie } from "../../_lib/admin-session";
import type { Env } from "../../_lib/env";
import { json } from "../../_lib/http";

export const onRequestPost: PagesFunction<Env> = async () => {
  const response = json({ authenticated: false });
  response.headers.set("Set-Cookie", clearAdminSessionCookie());
  return response;
};
