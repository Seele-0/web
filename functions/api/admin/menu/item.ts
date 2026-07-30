import { verifyAdminRequest } from "../../../_lib/admin-session";
import { requireIdentifier, requireMenuItemName, requirePriceCents } from "../../../_lib/admin-input";
import type { Env } from "../../../_lib/env";
import { errorResponse, json, readJson } from "../../../_lib/http";
import { deleteMenuItem, upsertMenuItem } from "../../../_lib/menu-repository";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await verifyAdminRequest(request, env);
    const input = await readJson<{ name?: unknown; priceCents?: unknown }>(request);
    const name = requireMenuItemName(input.name);
    const priceCents = requirePriceCents(input.priceCents);
    return json(await upsertMenuItem(env.DB, { name, priceCents, now: new Date().toISOString() }));
  } catch (error) {
    return errorResponse(error);
  }
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  try {
    await verifyAdminRequest(request, env);
    const input = await readJson<{ menuItemId?: unknown }>(request);
    const menuItemId = requireIdentifier(input.menuItemId, "invalid_menu_item_id", "菜品标识符无效");
    await deleteMenuItem(env.DB, { menuItemId, now: new Date().toISOString() });
    return json({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
};
