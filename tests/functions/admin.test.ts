import { env } from "cloudflare:test";
import { onRequestPost as login } from "../../functions/api/admin/login";
import { onRequestPost as importMenu } from "../../functions/api/admin/menu/import";
import { onRequestPut as renameRestaurant } from "../../functions/api/admin/settings/restaurant-name";
import { onRequestPut as lockOrder } from "../../functions/api/admin/order/lock";
import { onRequestPost as clearOrderRoute } from "../../functions/api/admin/order/clear";
import { onRequestPut as correctContribution } from "../../functions/api/admin/order/contribution";
import { verifyAdminRequest } from "../../functions/_lib/admin-session";
import { adjustContribution, getOrderSnapshot } from "../../functions/_lib/order-repository";

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

  it("requires authentication for menu import", async () => {
    const response = await importMenu(context(jsonRequest("/api/admin/menu/import", "POST", { markdown: "- 新菜 | 10" })));
    expect(response.status).toBe(401);
  });

  it("upserts imported dishes and deactivates absent dishes", async () => {
    const { cookie } = await adminCookie();
    const response = await importMenu(context(jsonRequest("/api/admin/menu/import", "POST", {
      markdown: "- 酸菜鱼 | 72\n- 新菜 | 10",
    }, cookie)));
    expect(response.status).toBe(200);
    const rows = await env.DB.prepare("SELECT name, price_cents, active FROM menu_items ORDER BY name").all<any>();
    expect(rows.results.find((row) => row.name === "酸菜鱼")).toMatchObject({ price_cents: 7200, active: 1 });
    expect(rows.results.find((row) => row.name === "新菜")).toMatchObject({ price_cents: 1000, active: 1 });
    expect(rows.results.find((row) => row.name === "米饭")).toMatchObject({ active: 0 });
  });

  it("renames the restaurant and locks the order", async () => {
    const { cookie } = await adminCookie();
    expect((await renameRestaurant(context(jsonRequest("/api/admin/settings/restaurant-name", "PUT", { restaurantName: "暖味小馆" }, cookie)))).status).toBe(200);
    expect((await lockOrder(context(jsonRequest("/api/admin/order/lock", "PUT", { orderDate: "2026-07-30", locked: true }, cookie)))).status).toBe(200);
    expect((await env.DB.prepare("SELECT value FROM settings WHERE key = 'restaurant_name'").first<any>())?.value).toBe("暖味小馆");
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
    expect((await env.DB.prepare("SELECT COUNT(*) AS count FROM activity_log").first<any>())!.count).toBeGreaterThan(0);
  });

  it("requires a historical order to be unlocked before correcting a contribution", async () => {
    const { cookie } = await adminCookie();
    await lockOrder(context(jsonRequest("/api/admin/order/lock", "PUT", { orderDate: "2026-07-29", locked: true }, cookie)));

    const correction = await correctContribution(context(jsonRequest("/api/admin/order/contribution", "PUT", {
      orderDate: "2026-07-29", menuItemId: "dish-suan-cai-yu", deviceId: "device-a", displayName: "张三", quantity: 2,
    }, cookie)));

    expect(correction.status).toBe(409);
    expect(await correction.json()).toMatchObject({ error: { code: "order_locked" } });
  });
});
