import { env } from "cloudflare:test";
import { onRequestGet as bootstrap } from "../../functions/api/bootstrap";
import { onRequestGet as changes } from "../../functions/api/order/changes";
import { onRequestPost as adjust } from "../../functions/api/order/adjust";
import { onRequestGet as history } from "../../functions/api/history/index";
import { onRequestGet as historyDetail } from "../../functions/api/history/[date]";
import { getShanghaiBusinessDate } from "../../functions/_lib/date";

const today = getShanghaiBusinessDate();

function context(request: Request, params: Record<string, string> = {}) {
  return { request, env, params } as unknown as EventContext<Cloudflare.Env, string, Record<string, string>>;
}

function adjustRequest(operationId: string, orderDate = today) {
  return new Request("https://example.test/api/order/adjust", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      operationId,
      orderDate,
      menuItemId: "dish-suan-cai-yu",
      deviceId: "device-a",
      displayName: "张三",
      delta: 1,
    }),
  });
}

describe("order APIs", () => {
  it("bootstraps restaurant, active menu, and today's order", async () => {
    const response = await bootstrap(context(new Request("https://example.test/api/bootstrap")));
    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, any>;
    expect(body.restaurantName).toBe("今日点餐");
    expect(body.configurationRevision).toBe(0);
    expect(body.menu).toHaveLength(5);
    expect(body.order).toMatchObject({ orderDate: today, revision: 0 });
  });

  it("adjusts today's order idempotently", async () => {
    expect((await adjust(context(adjustRequest("api-op-1")))).status).toBe(200);
    const replay = await adjust(context(adjustRequest("api-op-1")));
    expect((await replay.json() as any).dishes[0].quantity).toBe(1);
  });

  it("returns unchanged polling state when revision matches", async () => {
    await adjust(context(adjustRequest("api-op-1")));
    const response = await changes(context(new Request(
      `https://example.test/api/order/changes?date=${today}&since=1&configurationSince=0`,
    )));
    expect(await response.json()).toEqual({ changed: false, revision: 1, configurationRevision: 0 });
  });

  it("returns updated menu configuration during polling", async () => {
    await env.DB.prepare(
      "INSERT INTO settings (key, value, updated_at) VALUES ('menu_revision', '2', CURRENT_TIMESTAMP)",
    ).run();
    const response = await changes(context(new Request(
      `https://example.test/api/order/changes?date=${today}&since=0&configurationSince=0`,
    )));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      changed: false,
      revision: 0,
      configurationRevision: 2,
      configuration: {
        restaurantName: "今日点餐",
        menu: expect.arrayContaining([expect.objectContaining({ name: "酸菜鱼" })]),
      },
    });
  });

  it("does not read contribution rows when polling revisions are unchanged", async () => {
    const preparedSql: string[] = [];
    const fakeDb = {
      prepare(sql: string) {
        preparedSql.push(sql);
        if (sql.includes("order_contributions")) throw new Error("full snapshot should not be queried");
        return {
          bind() { return this; },
          first: async () => ({ revision: 3, configuration_revision: 4 }),
          all: async () => ({ results: [] }),
        };
      },
    } as unknown as D1Database;
    const response = await changes({
      request: new Request(`https://example.test/api/order/changes?date=${today}&since=3&configurationSince=4`),
      env: { ...env, DB: fakeDb },
      params: {},
    } as unknown as EventContext<Cloudflare.Env, string, Record<string, string>>);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ changed: false, revision: 3, configurationRevision: 4 });
    expect(preparedSql.some((sql) => sql.includes("order_contributions"))).toBe(false);
  });

  it("rejects ordinary writes to a past date", async () => {
    const response = await adjust(context(adjustRequest("past-op", "2026-07-29")));
    expect(response.status).toBe(403);
  });

  it("returns history dates in descending order", async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO daily_orders (order_date, share_count, revision, locked, updated_at) VALUES ('2026-07-28', 1, 0, 0, CURRENT_TIMESTAMP)"),
      env.DB.prepare("INSERT INTO daily_orders (order_date, share_count, revision, locked, updated_at) VALUES ('2026-07-29', 1, 0, 0, CURRENT_TIMESTAMP)"),
    ]);
    const response = await history(context(new Request("https://example.test/api/history")));
    expect((await response.json() as any).dates.map((item: any) => item.orderDate)).toEqual([
      "2026-07-29",
      "2026-07-28",
    ]);
  });

  it("uses the ordered price snapshot for history totals and detail", async () => {
    expect((await adjust(context(adjustRequest("history-price-op")))).status).toBe(200);
    await env.DB.prepare(
      "UPDATE menu_items SET name = '新酸菜鱼', price_cents = 9900 WHERE id = 'dish-suan-cai-yu'",
    ).run();

    const listResponse = await history(context(new Request("https://example.test/api/history")));
    const listBody = await listResponse.json() as any;
    expect(listBody.dates).toContainEqual(expect.objectContaining({
      orderDate: today,
      totalQuantity: 1,
      totalCents: 6800,
    }));

    const detailResponse = await historyDetail(context(
      new Request(`https://example.test/api/history/${today}`),
      { date: today },
    ));
    expect(await detailResponse.json()).toMatchObject({
      totalCents: 6800,
      dishes: [{ name: "酸菜鱼", priceCents: 6800, subtotalCents: 6800 }],
    });
  });
});
