import { env } from "cloudflare:test";
import { onRequestPost as login } from "../../functions/api/admin/login";
import { onRequestPost as importMenu } from "../../functions/api/admin/menu/import";
import { onRequestPost as menuItemPost, onRequestDelete as menuItemDelete } from "../../functions/api/admin/menu/item";
import { onRequestPost as clearMenu } from "../../functions/api/admin/menu/clear";
import { onRequestPut as renameRestaurant } from "../../functions/api/admin/settings/restaurant-name";
import { onRequestPost as importOrder } from "../../functions/api/admin/order/import";
import { onRequestPost as orderItemPost, onRequestDelete as orderItemDelete } from "../../functions/api/admin/order/item";
import { onRequestPut as lockOrder } from "../../functions/api/admin/order/lock";
import { onRequestPost as clearOrderRoute } from "../../functions/api/admin/order/clear";
import { onRequestPut as correctContribution } from "../../functions/api/admin/order/contribution";
import { verifyAdminRequest } from "../../functions/_lib/admin-session";
import { getOrderSnapshot } from "../../functions/_lib/order-repository";

function context(request: Request, params: Record<string, string> = {}) {
  return { request, env, params } as any;
}

function jsonRequest(path: string, method: string, body: unknown, cookie?: string) {
  const headers = new Headers({ "content-type": "application/json" });
  if (cookie) headers.set("cookie", cookie);
  return new Request(`https://example.test${path}`, { method, headers, body: JSON.stringify(body) });
}

async function adminCookie() {
  const response = await login(context(jsonRequest("/api/admin/login", "POST", { password: env.ADMIN_PASSWORD })));
  const setCookie = response.headers.get("set-cookie")!;
  return { response, cookie: setCookie.split(";")[0], setCookie };
}

async function activeMenuId(name: string) {
  return (await env.DB.prepare("SELECT id FROM menu_items WHERE name = ? AND active = 1").bind(name).first<{ id: string }>())!.id;
}

describe("administrator APIs", () => {
  it("rejects invalid login and issues a secure four-hour cookie for valid login", async () => {
    expect((await login(context(jsonRequest("/api/admin/login", "POST", { password: "wrong" })))).status).toBe(401);
    const { response, cookie, setCookie } = await adminCookie();
    expect(response.status).toBe(200);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Max-Age=14400");
    await expect(verifyAdminRequest(new Request("https://example.test", { headers: { cookie } }), env)).resolves.toBeDefined();
    await expect(verifyAdminRequest(new Request("https://example.test", { headers: { cookie: `${cookie}x` } }), env)).rejects.toMatchObject({ status: 401 });
  });

  it("requires authentication for every new administrative endpoint", async () => {
    const requests = await Promise.all([
      importMenu(context(jsonRequest("/api/admin/menu/import", "POST", { text: "新菜 -- 10" }))),
      menuItemPost(context(jsonRequest("/api/admin/menu/item", "POST", { name: "新菜", priceCents: 1000 }))),
      menuItemDelete(context(jsonRequest("/api/admin/menu/item", "DELETE", { menuItemId: "dish-mi-fan" }))),
      clearMenu(context(jsonRequest("/api/admin/menu/clear", "POST", {}))),
      importOrder(context(jsonRequest("/api/admin/order/import", "POST", { orderDate: "2026-07-30", text: "新菜 -- 10 -- 1" }))),
      orderItemPost(context(jsonRequest("/api/admin/order/item", "POST", { orderDate: "2026-07-30", name: "新菜", priceCents: 1000, quantity: 1 }))),
      orderItemDelete(context(jsonRequest("/api/admin/order/item", "DELETE", { orderDate: "2026-07-30", menuItemId: "dish-mi-fan" }))),
      clearOrderRoute(context(jsonRequest("/api/admin/order/clear", "POST", { orderDate: "2026-07-30" }))),
    ]);
    expect(requests.map((response) => response.status)).toEqual(Array(8).fill(401));
  });

  it("replaces menu text, adds and deletes individual dishes, and clears the menu", async () => {
    const { cookie } = await adminCookie();
    const imported = await importMenu(context(jsonRequest("/api/admin/menu/import", "POST", {
      text: "酸菜鱼 -- 72\n新菜 -- 10",
    }, cookie)));
    expect(imported.status).toBe(200);
    expect(await imported.json()).toMatchObject({ items: [{ name: "酸菜鱼", priceCents: 7200 }, { name: "新菜", priceCents: 1000 }], errors: [] });
    expect((await env.DB.prepare("SELECT active FROM menu_items WHERE name = '米饭'").first<{ active: number }>())?.active).toBe(0);

    const added = await menuItemPost(context(jsonRequest("/api/admin/menu/item", "POST", {
      name: "单加菜", priceCents: 1600,
    }, cookie)));
    expect(added.status).toBe(200);
    expect(await added.json()).toMatchObject({ name: "单加菜", priceCents: 1600 });

    const deleted = await menuItemDelete(context(jsonRequest("/api/admin/menu/item", "DELETE", {
      menuItemId: await activeMenuId("单加菜"),
    }, cookie)));
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toEqual({ deleted: true });

    const cleared = await clearMenu(context(jsonRequest("/api/admin/menu/clear", "POST", {}, cookie)));
    expect(cleared.status).toBe(200);
    expect(await cleared.json()).toEqual({ cleared: true });
    expect((await env.DB.prepare("SELECT COUNT(*) AS count FROM menu_items WHERE active = 1").first<{ count: number }>())?.count).toBe(0);
  });

  it("replaces orders, adds one item, deletes a whole dish, and clears orders", async () => {
    const { cookie } = await adminCookie();
    const imported = await importOrder(context(jsonRequest("/api/admin/order/import", "POST", {
      orderDate: "2026-07-30", text: "单加菜 -- 16 -- 3",
    }, cookie)));
    expect(imported.status).toBe(200);
    expect(await imported.json()).toMatchObject({ totalQuantity: 3, totalCents: 4800 });

    const added = await orderItemPost(context(jsonRequest("/api/admin/order/item", "POST", {
      orderDate: "2026-07-30", name: "酸菜鱼", priceCents: 7200, quantity: 2,
    }, cookie)));
    expect(added.status).toBe(200);
    expect(await added.json()).toMatchObject({ totalQuantity: 5, totalCents: 19200 });

    const deleted = await orderItemDelete(context(jsonRequest("/api/admin/order/item", "DELETE", {
      orderDate: "2026-07-30", menuItemId: await activeMenuId("单加菜"),
    }, cookie)));
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toMatchObject({ totalQuantity: 2, dishes: [{ name: "酸菜鱼", quantity: 2 }] });

    const cleared = await clearOrderRoute(context(jsonRequest("/api/admin/order/clear", "POST", { orderDate: "2026-07-30" }, cookie)));
    expect(cleared.status).toBe(200);
    expect(await cleared.json()).toMatchObject({ totalQuantity: 0, dishes: [] });
  });

  it("validates all new menu and order request bodies", async () => {
    const { cookie } = await adminCookie();
    const responses = await Promise.all([
      importMenu(context(jsonRequest("/api/admin/menu/import", "POST", { text: "错误菜 | 10" }, cookie))),
      menuItemPost(context(jsonRequest("/api/admin/menu/item", "POST", { name: "", priceCents: 1000 }, cookie))),
      menuItemDelete(context(jsonRequest("/api/admin/menu/item", "DELETE", { menuItemId: "" }, cookie))),
      importOrder(context(jsonRequest("/api/admin/order/import", "POST", { orderDate: "2026/07/30", text: "新菜 -- 10 -- 1" }, cookie))),
      orderItemPost(context(jsonRequest("/api/admin/order/item", "POST", { orderDate: "2026-07-30", name: "新菜", priceCents: 1000, quantity: 0 }, cookie))),
      orderItemDelete(context(jsonRequest("/api/admin/order/item", "DELETE", { orderDate: "2026-07-30", menuItemId: "" }, cookie))),
      clearOrderRoute(context(jsonRequest("/api/admin/order/clear", "POST", { orderDate: "2026/07/30" }, cookie))),
    ]);
    expect(responses.map((response) => response.status)).toEqual(Array(7).fill(400));
  });

  it("renames the restaurant and locks the order", async () => {
    const { cookie } = await adminCookie();
    expect((await renameRestaurant(context(jsonRequest("/api/admin/settings/restaurant-name", "PUT", { restaurantName: "暖味小馆" }, cookie)))).status).toBe(200);
    expect((await lockOrder(context(jsonRequest("/api/admin/order/lock", "PUT", { orderDate: "2026-07-30", locked: true }, cookie)))).status).toBe(200);
    expect((await env.DB.prepare("SELECT value FROM settings WHERE key = 'restaurant_name'").first<{ value: string }>())?.value).toBe("暖味小馆");
    expect((await getOrderSnapshot(env.DB, "2026-07-30")).locked).toBe(true);
  });

  it("corrects contributions and clears them without deleting audit records", async () => {
    const { cookie } = await adminCookie();
    const correction = await correctContribution(context(jsonRequest("/api/admin/order/contribution", "PUT", {
      orderDate: "2026-07-30", menuItemId: "dish-suan-cai-yu", deviceId: "device-a", displayName: "张三", quantity: 3,
    }, cookie)));
    expect(correction.status).toBe(200);
    expect((await getOrderSnapshot(env.DB, "2026-07-30")).totalQuantity).toBe(3);
    const clear = await clearOrderRoute(context(jsonRequest("/api/admin/order/clear", "POST", { orderDate: "2026-07-30" }, cookie)));
    expect(clear.status).toBe(200);
    expect((await getOrderSnapshot(env.DB, "2026-07-30")).totalQuantity).toBe(0);
    expect((await env.DB.prepare("SELECT COUNT(*) AS count FROM activity_log").first<{ count: number }>())!.count).toBeGreaterThan(0);
  });

  it("returns 423 for all locked order modifications", async () => {
    const { cookie } = await adminCookie();
    await lockOrder(context(jsonRequest("/api/admin/order/lock", "PUT", { orderDate: "2026-07-29", locked: true }, cookie)));
    const responses = await Promise.all([
      importOrder(context(jsonRequest("/api/admin/order/import", "POST", { orderDate: "2026-07-29", text: "酸菜鱼 -- 72 -- 1" }, cookie))),
      orderItemPost(context(jsonRequest("/api/admin/order/item", "POST", { orderDate: "2026-07-29", name: "新菜", priceCents: 1000, quantity: 1 }, cookie))),
      orderItemDelete(context(jsonRequest("/api/admin/order/item", "DELETE", { orderDate: "2026-07-29", menuItemId: "dish-suan-cai-yu" }, cookie))),
      clearOrderRoute(context(jsonRequest("/api/admin/order/clear", "POST", { orderDate: "2026-07-29" }, cookie))),
      correctContribution(context(jsonRequest("/api/admin/order/contribution", "PUT", {
        orderDate: "2026-07-29", menuItemId: "dish-suan-cai-yu", deviceId: "device-a", displayName: "张三", quantity: 2,
      }, cookie))),
    ]);
    expect(responses.map((response) => response.status)).toEqual(Array(5).fill(423));
    for (const response of responses) expect(await response.json()).toMatchObject({ error: { code: "order_locked" } });
  });
});
