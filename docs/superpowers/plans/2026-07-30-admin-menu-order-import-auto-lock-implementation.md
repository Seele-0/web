# Admin Menu/Order Import and Automatic Lock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add administrator menu and ordered-dish replacement/single-item management, immutable per-day dish price snapshots, and an idempotent 23:59 Asia/Shanghai automatic order lock.

**Architecture:** Keep parsing in a pure shared domain module, database behavior in focused repositories, and Pages routes as thin authenticated adapters. Persist per-order dish snapshots in D1, share one automatic-lock service between Pages request-time compensation and a separately deployed scheduled Worker, and split the administrator UI into focused menu and order panels.

**Tech Stack:** TypeScript 7, React 19, Cloudflare Pages Functions, Cloudflare Workers Cron Triggers, D1/SQLite, Vitest with Cloudflare Workers pool, Testing Library, Playwright, Wrangler 4.

---

## File map

### Create

- `src/domain/import-text.ts` — pure parsers for two-column menu text and three-column ordered-dish text.
- `src/domain/import-text.test.ts` — parser unit tests with exact line-number errors.
- `migrations/0003_order_items_and_automatic_locks.sql` — order snapshots, backfill, and automatic-lock execution records.
- `tests/functions/menu-repository.test.ts` — menu replacement and single-item repository coverage.
- `functions/_lib/automatic-lock.ts` — Shanghai cutoff calculation and idempotent automatic-lock database service.
- `tests/functions/automatic-lock.test.ts` — cutoff, idempotency, and manual-unlock behavior.
- `functions/api/admin/menu/item.ts` — authenticated single menu item add/update/delete endpoint.
- `functions/api/admin/menu/clear.ts` — authenticated menu clear endpoint.
- `functions/api/admin/order/import.ts` — authenticated ordered-dish batch replacement endpoint.
- `functions/api/admin/order/item.ts` — authenticated ordered-dish add/update/delete endpoint.
- `workers/auto-lock.ts` — scheduled Worker entry point.
- `wrangler.auto-lock.toml` — scheduled Worker deployment and D1 binding.
- `src/admin/OrderImportPanel.tsx` — three-column order import preview and confirmation.
- `src/admin/MenuManagementPanel.tsx` — menu import, single add/delete, and clear controls.
- `src/admin/OrderManagementPanel.tsx` — selected-date order import, single add/delete, clear, lock, and contribution correction controls.

### Modify

- `src/domain/menu-markdown.ts` — remove after all imports move to `import-text.ts`.
- `src/domain/menu-markdown.test.ts` — remove after replacement tests exist.
- `functions/_lib/menu-repository.ts` — use the new parser and add single-item/clear operations.
- `functions/_lib/order-repository.ts` — write/read order item snapshots and add admin order operations.
- `functions/_lib/date.ts` — expose Shanghai date/time helpers used by automatic locking.
- `functions/_lib/env.ts` — add a narrow `AutoLockEnv` type.
- `functions/api/admin/menu/import.ts` — accept `{ text }` and call menu replacement.
- `functions/api/admin/order/clear.ts` — enforce unlocked state and clear snapshots too.
- `functions/api/admin/order/contribution.ts` — delegate to repository and guarantee an order snapshot.
- `functions/api/bootstrap.ts` — run request-time automatic-lock compensation before reading state.
- `functions/api/order/adjust.ts` — run compensation before validating/writing.
- `functions/api/order/share-count.ts` — run compensation before validating/writing.
- `functions/api/order/changes.ts` — run compensation before revision comparison.
- `functions/api/history/index.ts` — calculate totals from `order_items`.
- `functions/api/history/[date].ts` — run compensation before loading history.
- `src/api/client.ts` — add menu/order administration request types and methods.
- `src/admin/MenuImportPanel.tsx` — use two-column text parser and new wording.
- `src/admin/AdminPage.tsx` — compose focused management panels and pass current menu.
- `src/app/AppRouter.tsx` — pass menu to `AdminPage`.
- `src/app/app.css` — styles for item rows, import summaries, and destructive confirmations.
- `tests/functions/schema.test.ts` — assert the new tables and backfill shape.
- `tests/functions/order-repository.test.ts` — snapshot immutability and admin order operations.
- `tests/functions/admin.test.ts` — authenticated API coverage for all new operations.
- `tests/functions/order-api.test.ts` — history totals and automatic-lock fallback coverage.
- `tests/ui/admin-page.test.tsx` — administrator menu/order workflows.
- `tests/ui/menu-page.test.tsx` — total quantity reflects administrator-imported contributions.
- `tests/e2e/ordering.spec.ts` — production-like menu/order import and cross-device synchronization.
- `tsconfig.json` — include `workers` in type checking.
- `package.json` — add scheduled Worker deployment script.
- `docs/deployment-cloudflare-pages.md` — document migration and Cron Worker deployment.

---

### Task 1: Replace Markdown parsing with explicit import-text parsers

**Files:**
- Create: `src/domain/import-text.ts`
- Create: `src/domain/import-text.test.ts`
- Delete after callers migrate: `src/domain/menu-markdown.ts`
- Delete after callers migrate: `src/domain/menu-markdown.test.ts`

- [ ] **Step 1: Write failing parser tests**

```ts
import { parseMenuImportText, parseOrderImportText } from "./import-text";

describe("parseMenuImportText", () => {
  it("parses two-column rows and preserves source lines", () => {
    expect(parseMenuImportText("黄瓜火腿 -- 12\n\n 麻婆豆腐 -- 12.50 ")).toEqual({
      items: [
        { name: "黄瓜火腿", priceCents: 1200, sourceLine: 1 },
        { name: "麻婆豆腐", priceCents: 1250, sourceLine: 3 },
      ],
      errors: [],
    });
  });

  it("reports exact column, duplicate-name, blank-name, and price errors", () => {
    const result = parseMenuImportText([
      "酸菜鱼 -- 68 -- 2",
      "酸菜鱼 -- 68",
      "酸菜鱼 -- 72",
      " -- 12",
      "坏价格 -- 12.345",
    ].join("\n"));
    expect(result.errors.map(({ sourceLine, message }) => [sourceLine, message])).toEqual([
      [1, "每行必须是：菜品名称 -- 价格"],
      [3, "菜品名称重复"],
      [4, "菜品名称不能为空"],
      [5, "价格格式无效"],
    ]);
  });
});

describe("parseOrderImportText", () => {
  it("parses name, price, and quantity", () => {
    expect(parseOrderImportText("黄瓜火腿 -- 12 -- 3\n麻婆豆腐--12--2")).toEqual({
      items: [
        { name: "黄瓜火腿", priceCents: 1200, quantity: 3, sourceLine: 1 },
        { name: "麻婆豆腐", priceCents: 1200, quantity: 2, sourceLine: 2 },
      ],
      errors: [],
    });
  });

  it.each(["0", "1.5", "1000", "数量"])("rejects quantity %s", (quantity) => {
    expect(parseOrderImportText(`酸菜鱼 -- 68 -- ${quantity}`).errors[0]).toMatchObject({
      sourceLine: 1,
      message: "数量必须是 1 到 999 的整数",
    });
  });
});
```

Add `零元菜 -- 0` to the menu error case and assert `价格格式无效`, so the parser enforces the approved strictly-positive price rule rather than only the currency syntax.

- [ ] **Step 2: Run tests and confirm the missing-module failure**

Run: `npm test -- src/domain/import-text.test.ts`  
Expected: FAIL because `./import-text` does not exist.

- [ ] **Step 3: Implement the two strict parsers**

```ts
import { parsePriceToCents } from "./money";

export type ImportParseError = { sourceLine: number; message: string; source: string };
export type ParsedMenuImportItem = { name: string; priceCents: number; sourceLine: number };
export type ParsedOrderImportItem = ParsedMenuImportItem & { quantity: number };

function rows(text: string) {
  return text.split(/\r?\n/).map((source, index) => ({ source, sourceLine: index + 1 }))
    .filter(({ source }) => source.trim().length > 0);
}

function price(value: string): number {
  const priceCents = parsePriceToCents(value.replace(/￥/g, "¥"));
  if (priceCents < 1 || priceCents > 10_000_000) throw new Error("Invalid price");
  return priceCents;
}

export function parseMenuImportText(text: string): {
  items: ParsedMenuImportItem[];
  errors: ImportParseError[];
} {
  const items: ParsedMenuImportItem[] = [];
  const errors: ImportParseError[] = [];
  const seen = new Set<string>();
  for (const { source, sourceLine } of rows(text)) {
    const columns = source.split("--").map((column) => column.trim());
    if (columns.length !== 2) {
      errors.push({ sourceLine, source, message: "每行必须是：菜品名称 -- 价格" });
      continue;
    }
    const [name, rawPrice] = columns;
    if (!name) {
      errors.push({ sourceLine, source, message: "菜品名称不能为空" });
      continue;
    }
    if (seen.has(name)) {
      errors.push({ sourceLine, source, message: "菜品名称重复" });
      continue;
    }
    seen.add(name);
    try {
      items.push({ name, priceCents: price(rawPrice), sourceLine });
    } catch {
      errors.push({ sourceLine, source, message: "价格格式无效" });
    }
  }
  return { items, errors };
}

export function parseOrderImportText(text: string): {
  items: ParsedOrderImportItem[];
  errors: ImportParseError[];
} {
  const items: ParsedOrderImportItem[] = [];
  const errors: ImportParseError[] = [];
  const seen = new Set<string>();
  for (const { source, sourceLine } of rows(text)) {
    const columns = source.split("--").map((column) => column.trim());
    if (columns.length !== 3) {
      errors.push({ sourceLine, source, message: "每行必须是：菜品名称 -- 价格 -- 数量" });
      continue;
    }
    const [name, rawPrice, rawQuantity] = columns;
    if (!name) {
      errors.push({ sourceLine, source, message: "菜品名称不能为空" });
      continue;
    }
    if (seen.has(name)) {
      errors.push({ sourceLine, source, message: "菜品名称重复" });
      continue;
    }
    seen.add(name);
    let priceCents: number;
    try { priceCents = price(rawPrice); }
    catch {
      errors.push({ sourceLine, source, message: "价格格式无效" });
      continue;
    }
    const quantity = Number(rawQuantity);
    if (!/^\d+$/.test(rawQuantity) || !Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
      errors.push({ sourceLine, source, message: "数量必须是 1 到 999 的整数" });
      continue;
    }
    items.push({ name, priceCents, quantity, sourceLine });
  }
  return { items, errors };
}
```

- [ ] **Step 4: Run parser tests**

Run: `npm test -- src/domain/import-text.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit the parser**

```bash
git add src/domain/import-text.ts src/domain/import-text.test.ts
git commit -m "feat: parse admin menu and order import text"
```

---

### Task 2: Add order-item snapshots and automatic-lock records to D1

**Files:**
- Create: `migrations/0003_order_items_and_automatic_locks.sql`
- Modify: `tests/functions/schema.test.ts`

- [ ] **Step 1: Add failing schema and backfill assertions**

```ts
import { applyD1Migrations, env, reset } from "cloudflare:test";

expect(tables.results.map((row) => row.name)).toEqual(expect.arrayContaining([
  "order_items",
  "automatic_order_locks",
]));

it("backfills an immutable item snapshot for existing contributions", async () => {
  await reset();
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS.slice(0, 2));
  await env.DB.batch([
    env.DB.prepare("INSERT INTO daily_orders (order_date, share_count, revision, locked, updated_at) VALUES ('2026-07-29', 1, 1, 0, CURRENT_TIMESTAMP)"),
    env.DB.prepare("INSERT INTO order_contributions (order_date, menu_item_id, device_id, display_name, quantity, updated_at) VALUES ('2026-07-29', 'dish-suan-cai-yu', 'device-a', '张三', 2, CURRENT_TIMESTAMP)"),
  ]);
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS.slice(2));
  expect(await env.DB.prepare(
    "SELECT name, price_cents, sort_order FROM order_items WHERE order_date = '2026-07-29' AND menu_item_id = 'dish-suan-cai-yu'",
  ).first()).toEqual({ name: "酸菜鱼", price_cents: 6800, sort_order: 1 });
});
```

Also query `PRAGMA table_info(order_items)` and assert the columns are exactly `order_date`, `menu_item_id`, `name`, `price_cents`, `sort_order`, `created_at`, and `updated_at`; query `PRAGMA table_info(automatic_order_locks)` and assert `order_date`, `locked_at`, `source`, and `execution_token`.

- [ ] **Step 2: Run the schema test and confirm failure**

Run: `npm run test:workers -- tests/functions/schema.test.ts`  
Expected: FAIL because the two new tables do not exist.

- [ ] **Step 3: Create migration 0003**

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE order_items (
  order_date TEXT NOT NULL,
  menu_item_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0 AND price_cents <= 10000000),
  sort_order INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (order_date, menu_item_id),
  FOREIGN KEY (order_date) REFERENCES daily_orders(order_date) ON DELETE CASCADE,
  FOREIGN KEY (menu_item_id) REFERENCES menu_items(id)
);

INSERT INTO order_items
  (order_date, menu_item_id, name, price_cents, sort_order, created_at, updated_at)
SELECT c.order_date, c.menu_item_id, m.name, m.price_cents, m.sort_order,
       MIN(c.updated_at), MAX(c.updated_at)
FROM order_contributions c
JOIN menu_items m ON m.id = c.menu_item_id
GROUP BY c.order_date, c.menu_item_id, m.name, m.price_cents, m.sort_order;

CREATE TABLE automatic_order_locks (
  order_date TEXT PRIMARY KEY,
  locked_at TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('cron', 'request_fallback')),
  execution_token TEXT NOT NULL UNIQUE
);

CREATE INDEX idx_order_items_date_sort
  ON order_items(order_date, sort_order, menu_item_id);
```

The execution token lets concurrent Cron and fallback batches condition every write on ownership of the newly inserted marker. A losing runner inserts nothing and therefore cannot increment the revision.

- [ ] **Step 4: Run schema tests**

Run: `npm run test:workers -- tests/functions/schema.test.ts`  
Expected: PASS with both tables present and valid columns.

- [ ] **Step 5: Commit the migration**

```bash
git add migrations/0003_order_items_and_automatic_locks.sql tests/functions/schema.test.ts
git commit -m "feat: add order item and auto lock schema"
```

---

### Task 3: Add menu replacement and single-item repository operations

**Files:**
- Create: `tests/functions/menu-repository.test.ts`
- Modify: `functions/_lib/menu-repository.ts`

- [ ] **Step 1: Write failing repository tests**

```ts
import { env } from "cloudflare:test";
import {
  clearMenu,
  deleteMenuItem,
  replaceMenuFromText,
  upsertMenuItem,
} from "../../functions/_lib/menu-repository";

it("replaces the active menu and increments menu_revision", async () => {
  await replaceMenuFromText(env.DB, "酸菜鱼 -- 72\n新菜 -- 10", "2026-07-30T10:00:00.000Z");
  const rows = await env.DB.prepare("SELECT name, price_cents, active FROM menu_items ORDER BY name").all<any>();
  expect(rows.results.find((row) => row.name === "酸菜鱼")).toMatchObject({ price_cents: 7200, active: 1 });
  expect(rows.results.find((row) => row.name === "新菜")).toMatchObject({ price_cents: 1000, active: 1 });
  expect(rows.results.find((row) => row.name === "米饭")).toMatchObject({ active: 0 });
});

it("upserts, soft deletes, and clears active dishes", async () => {
  const item = await upsertMenuItem(env.DB, { name: "新菜", priceCents: 1800, now: "2026-07-30T10:00:00.000Z" });
  await deleteMenuItem(env.DB, { menuItemId: item.id, now: "2026-07-30T10:01:00.000Z" });
  expect((await env.DB.prepare("SELECT active FROM menu_items WHERE id = ?").bind(item.id).first<any>())?.active).toBe(0);
  await clearMenu(env.DB, { now: "2026-07-30T10:02:00.000Z" });
  expect((await env.DB.prepare("SELECT COUNT(*) AS count FROM menu_items WHERE active = 1").first<any>())?.count).toBe(0);
});
```

Also assert that empty replacement returns `invalid_menu_text`, duplicate rows expose the parser message, missing delete IDs return `menu_item_not_found`, and every successful operation increments `menu_revision` exactly once.

- [ ] **Step 2: Run the new repository tests**

Run: `npm run test:workers -- tests/functions/menu-repository.test.ts`  
Expected: FAIL because the new functions do not exist.

- [ ] **Step 3: Implement focused menu operations**

Use these exported interfaces and function signatures:

```ts
export type MenuWriteInput = { name: string; priceCents: number; now: string };
export type MenuDeleteInput = { menuItemId: string; now: string };
export type MenuItemRecord = { id: string; name: string; priceCents: number; sortOrder: number };

export type MenuRepositoryOperations = {
  replaceMenuFromText(db: D1Database, text: string, now: string): Promise<ReturnType<typeof parseMenuImportText>>;
  upsertMenuItem(db: D1Database, input: MenuWriteInput): Promise<MenuItemRecord>;
  deleteMenuItem(db: D1Database, input: MenuDeleteInput): Promise<void>;
  clearMenu(db: D1Database, input: { now: string }): Promise<void>;
};
```

Implement shared private helpers for name/price validation, the next sort order, revision increment, and activity-log statements. Use actions `replace_menu`, `upsert_menu_item`, `delete_menu_item`, and `clear_menu`. Keep soft deletion and `ON CONFLICT(name)` reactivation.

- [ ] **Step 4: Run menu repository and parser tests**

Run: `npm run test:workers -- tests/functions/menu-repository.test.ts && npm test -- src/domain/import-text.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit menu repository behavior**

```bash
git add functions/_lib/menu-repository.ts tests/functions/menu-repository.test.ts
git commit -m "feat: manage menu replacement and individual dishes"
```

---

### Task 4: Make order snapshots immutable by date

**Files:**
- Modify: `functions/_lib/order-repository.ts`
- Modify: `functions/api/history/index.ts`
- Modify: `tests/functions/order-repository.test.ts`
- Modify: `tests/functions/order-api.test.ts`

- [ ] **Step 1: Write failing snapshot tests**

```ts
it("captures menu name and price on the first contribution", async () => {
  await adjustContribution(env.DB, { ...baseInput, operationId: "snapshot-1" });
  await env.DB.prepare("UPDATE menu_items SET name = '新酸菜鱼', price_cents = 9900 WHERE id = ?")
    .bind(baseInput.menuItemId).run();
  const snapshot = await getOrderSnapshot(env.DB, baseInput.orderDate);
  expect(snapshot.dishes[0]).toMatchObject({ name: "酸菜鱼", priceCents: 6800, subtotalCents: 6800 });
});

it("removes zero contributions without losing another contributor", async () => {
  await adjustContribution(env.DB, { ...baseInput, operationId: "a-plus" });
  await adjustContribution(env.DB, { ...baseInput, operationId: "b-plus", deviceId: "device-b", displayName: "李四" });
  const snapshot = await adjustContribution(env.DB, { ...baseInput, operationId: "a-minus", delta: -1 });
  expect(snapshot.dishes[0]).toMatchObject({ quantity: 1, contributors: [{ deviceId: "device-b", displayName: "李四", quantity: 1 }] });
});
```

Add an API history test that changes `menu_items.price_cents` after ordering and still expects the original historical total.

- [ ] **Step 2: Run repository/API tests and confirm old live-price behavior fails**

Run: `npm run test:workers -- tests/functions/order-repository.test.ts tests/functions/order-api.test.ts`  
Expected: FAIL because snapshots currently join `menu_items`.

- [ ] **Step 3: Insert an order-item snapshot during normal adjustment**

Before writing `order_contributions`, add this statement to the same batch:

```sql
INSERT INTO order_items
  (order_date, menu_item_id, name, price_cents, sort_order, created_at, updated_at)
SELECT ?, id, name, price_cents, sort_order, ?, ?
FROM menu_items
WHERE id = ? AND active = 1
ON CONFLICT(order_date, menu_item_id) DO NOTHING
```

Keep the preflight active-menu check and operation-id idempotency.

- [ ] **Step 4: Read order details and history totals from snapshots**

Change detail lookup to:

```sql
SELECT c.menu_item_id, i.name, i.price_cents, i.sort_order,
       c.device_id, c.display_name, c.quantity
FROM order_contributions c
JOIN order_items i
  ON i.order_date = c.order_date AND i.menu_item_id = c.menu_item_id
WHERE c.order_date = ? AND c.quantity > 0
ORDER BY i.sort_order, c.device_id
```

Change history summary totals to join `order_items i` on both `order_date` and `menu_item_id`, and calculate `SUM(c.quantity * i.price_cents)`.

- [ ] **Step 5: Run affected worker tests**

Run: `npm run test:workers -- tests/functions/order-repository.test.ts tests/functions/order-api.test.ts`  
Expected: PASS, including immutable historical price.

- [ ] **Step 6: Commit snapshot behavior**

```bash
git add functions/_lib/order-repository.ts functions/api/history/index.ts tests/functions/order-repository.test.ts tests/functions/order-api.test.ts
git commit -m "feat: preserve per-order dish prices"
```

---

### Task 5: Add administrator ordered-dish repository operations

**Files:**
- Modify: `functions/_lib/order-repository.ts`
- Modify: `tests/functions/order-repository.test.ts`

- [ ] **Step 1: Write failing admin order tests**

```ts
it("replaces an order with administrator import contributions", async () => {
  const snapshot = await replaceOrderFromText(env.DB, {
    orderDate: "2026-07-30",
    text: "黄瓜火腿 -- 12 -- 3\n麻婆豆腐 -- 12 -- 2",
    now: "2026-07-30T10:00:00.000Z",
  });
  expect(snapshot.totalQuantity).toBe(5);
  expect(snapshot.dishes[0].contributors).toContainEqual({
    deviceId: "admin-import",
    displayName: "管理员导入",
    quantity: 3,
  });
});

it("automatically creates a missing menu dish during order import", async () => {
  await replaceOrderFromText(env.DB, {
    orderDate: "2026-07-30",
    text: "新菜 -- 18 -- 2",
    now: "2026-07-30T10:00:00.000Z",
  });
  expect(await env.DB.prepare("SELECT price_cents, active FROM menu_items WHERE name = '新菜'").first<any>())
    .toMatchObject({ price_cents: 1800, active: 1 });
});

it("adds one admin dish, deletes the whole dish, and clears snapshots", async () => {
  const added = await upsertAdminOrderItem(env.DB, {
    orderDate: "2026-07-30", name: "新菜", priceCents: 1800, quantity: 2,
    now: "2026-07-30T10:00:00.000Z",
  });
  await deleteOrderItem(env.DB, {
    orderDate: "2026-07-30", menuItemId: added.dishes[0].menuItemId,
    now: "2026-07-30T10:01:00.000Z",
  });
  expect((await getOrderSnapshot(env.DB, "2026-07-30")).dishes).toEqual([]);
});
```

Add tests proving replacement, add, delete, and clear return `order_locked` without changing rows when `daily_orders.locked = 1`; deleting a dish removes every contributor; replacing an order increments both order revision and menu revision when it creates/reactivates menu entries.

- [ ] **Step 2: Run tests and confirm missing exports**

Run: `npm run test:workers -- tests/functions/order-repository.test.ts`  
Expected: FAIL because the administrator order functions do not exist.

- [ ] **Step 3: Implement repository interfaces**

```ts
export const ADMIN_IMPORT_DEVICE_ID = "admin-import";
export const ADMIN_IMPORT_DISPLAY_NAME = "管理员导入";

export type ReplaceOrderInput = { orderDate: string; text: string; now: string };
export type AdminOrderItemInput = {
  orderDate: string;
  name: string;
  priceCents: number;
  quantity: number;
  now: string;
};
export type DeleteOrderItemInput = { orderDate: string; menuItemId: string; now: string };

export type AdminOrderRepositoryOperations = {
  replaceOrderFromText(db: D1Database, input: ReplaceOrderInput): Promise<OrderSnapshot>;
  upsertAdminOrderItem(db: D1Database, input: AdminOrderItemInput): Promise<OrderSnapshot>;
  deleteOrderItem(db: D1Database, input: DeleteOrderItemInput): Promise<OrderSnapshot>;
};
```

Implementation sequence for replacement:

1. Parse with `parseOrderImportText`; reject errors/empty input with `invalid_order_text`.
2. Read lock state and call `assertUnlocked` before any writes.
3. Resolve existing menu IDs by name and generate IDs for missing names. Leave the current menu price unchanged when a same-name active dish already exists; the order snapshot still uses the imported price. When a same-name dish is inactive or absent, reactivate/create it with the imported price.
4. In one D1 batch: ensure `daily_orders`, delete existing contributions and snapshots, create/reactivate only missing-current-menu rows, insert snapshots with the imported prices, insert `admin-import` contributions, increment order revision, increment menu revision only when menu configuration changed, and insert one `replace_order` activity row.
5. Return `getOrderSnapshot`.

Change `clearOrder` to call `assertUnlocked`, delete both `order_contributions` and `order_items`, increment revision once, and return the resulting snapshot.

For single administrator add/update, apply the supplied price to that date's `order_items` snapshot. Do not change the price of an already-active current-menu dish; create/reactivate a missing-current-menu dish with the supplied price. Move existing direct contribution correction into an exported repository function that ensures an order-item snapshot exists. Quantity `0` deletes the contributor row; if no contributors remain, delete the corresponding order snapshot.

- [ ] **Step 4: Run repository tests**

Run: `npm run test:workers -- tests/functions/order-repository.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit administrator order operations**

```bash
git add functions/_lib/order-repository.ts tests/functions/order-repository.test.ts
git commit -m "feat: manage administrator imported order items"
```

---

### Task 6: Expose authenticated menu and order APIs

**Files:**
- Create: `functions/api/admin/menu/item.ts`
- Create: `functions/api/admin/menu/clear.ts`
- Create: `functions/api/admin/order/import.ts`
- Create: `functions/api/admin/order/item.ts`
- Modify: `functions/api/admin/menu/import.ts`
- Modify: `functions/api/admin/order/clear.ts`
- Modify: `functions/api/admin/order/contribution.ts`
- Modify: `src/api/client.ts`
- Modify: `tests/functions/admin.test.ts`

- [ ] **Step 1: Write failing authenticated route tests**

Extend the route imports and add cases for:

```ts
const menuReplace = await importMenu(context(jsonRequest("/api/admin/menu/import", "POST", {
  text: "酸菜鱼 -- 72\n新菜 -- 10",
}, cookie)));
expect(menuReplace.status).toBe(200);

const menuAdd = await menuItemRoute(context(jsonRequest("/api/admin/menu/item", "POST", {
  name: "单加菜", priceCents: 1600,
}, cookie)));
expect(menuAdd.status).toBe(200);

const orderReplace = await importOrder(context(jsonRequest("/api/admin/order/import", "POST", {
  orderDate: "2026-07-30",
  text: "单加菜 -- 16 -- 3",
}, cookie)));
expect(await orderReplace.json()).toMatchObject({ totalQuantity: 3 });
```

Also test unauthenticated `401`, malformed input `400`, locked order `423`, menu clear, menu delete, order item add, whole-dish delete, order clear, and contribution correction through the repository.

- [ ] **Step 2: Run administrator API tests**

Run: `npm run test:workers -- tests/functions/admin.test.ts`  
Expected: FAIL because the new routes and request shapes do not exist.

- [ ] **Step 3: Implement thin authenticated routes**

The menu replacement route is implemented as the concrete thin-adapter pattern used by the other routes:

```ts
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
```

For each remaining route, validate every listed body field before calling its named repository operation: dates match `/^\d{4}-\d{2}-\d{2}$/`, names are trimmed and 1–80 characters, prices are integer cents from 1–10,000,000, quantities are integers from 1–999, and IDs are non-empty strings matching the existing identifier convention.

Use JSON bodies:

```ts
{ text: string }                                      // menu replacement
{ name: string, priceCents: number }                  // menu item POST
{ menuItemId: string }                                // menu item DELETE
{}                                                    // menu clear POST
{ orderDate: string, text: string }                   // order replacement
{ orderDate: string, name: string, priceCents: number, quantity: number } // order item POST
{ orderDate: string, menuItemId: string }             // order item DELETE
{ orderDate: string }                                 // order clear POST
```

- [ ] **Step 4: Add strongly typed client methods**

```ts
export type AdminMenuItemRequest = { name: string; priceCents: number };
export type AdminOrderItemRequest = AdminMenuItemRequest & { orderDate: string; quantity: number };

adminImportMenu: (text: string) => requestJson<ParsedMenuResponse>(
  "/api/admin/menu/import", jsonInit("POST", { text }),
),
adminUpsertMenuItem: (input: AdminMenuItemRequest) => requestJson<MenuItem>(
  "/api/admin/menu/item", jsonInit("POST", input),
),
adminDeleteMenuItem: (menuItemId: string) => requestJson<{ deleted: true }>(
  "/api/admin/menu/item", jsonInit("DELETE", { menuItemId }),
),
adminClearMenu: () => requestJson<{ cleared: true }>(
  "/api/admin/menu/clear", jsonInit("POST", {}),
),
adminImportOrder: (orderDate: string, text: string) => requestJson<OrderSnapshot>(
  "/api/admin/order/import", jsonInit("POST", { orderDate, text }),
),
adminUpsertOrderItem: (input: AdminOrderItemRequest) => requestJson<OrderSnapshot>(
  "/api/admin/order/item", jsonInit("POST", input),
),
adminDeleteOrderItem: (orderDate: string, menuItemId: string) => requestJson<OrderSnapshot>(
  "/api/admin/order/item", jsonInit("DELETE", { orderDate, menuItemId }),
),
```

- [ ] **Step 5: Run administrator API tests and type checking**

Run: `npm run test:workers -- tests/functions/admin.test.ts && npm run build`  
Expected: PASS.

- [ ] **Step 6: Commit API integration**

```bash
git add functions/api/admin src/api/client.ts tests/functions/admin.test.ts
git commit -m "feat: expose administrator menu and order APIs"
```

---

### Task 7: Implement idempotent Shanghai automatic locking

**Files:**
- Create: `functions/_lib/automatic-lock.ts`
- Create: `tests/functions/automatic-lock.test.ts`
- Modify: `functions/_lib/date.ts`
- Modify: `functions/_lib/env.ts`

- [ ] **Step 1: Write failing date and lock tests**

```ts
import {
  ensureAutomaticLock,
  getLatestLockableShanghaiDate,
} from "../../functions/_lib/automatic-lock";

it.each([
  ["2026-07-30T15:58:59.000Z", "2026-07-29"],
  ["2026-07-30T15:59:00.000Z", "2026-07-30"],
  ["2026-07-30T16:01:00.000Z", "2026-07-30"],
])("chooses the latest Shanghai date whose 23:59 cutoff passed", (iso, expected) => {
  expect(getLatestLockableShanghaiDate(new Date(iso))).toBe(expected);
});

it("locks once and does not relock after an administrator unlock", async () => {
  const first = await ensureAutomaticLock(env.DB, {
    orderDate: "2026-07-30",
    now: "2026-07-30T15:59:00.000Z",
    source: "cron",
    executionToken: "cron-1",
  });
  expect(first).toBe(true);
  await setOrderLocked(env.DB, {
    orderDate: "2026-07-30", locked: false, now: "2026-07-30T16:00:00.000Z",
  });
  const replay = await ensureAutomaticLock(env.DB, {
    orderDate: "2026-07-30",
    now: "2026-07-30T16:01:00.000Z",
    source: "request_fallback",
    executionToken: "fallback-1",
  });
  expect(replay).toBe(false);
  expect((await getOrderSnapshot(env.DB, "2026-07-30")).locked).toBe(false);
});
```

Add a concurrent-token test asserting one automatic marker, one automatic log entry, and one revision increment.

- [ ] **Step 2: Run automatic-lock tests**

Run: `npm run test:workers -- tests/functions/automatic-lock.test.ts`  
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Add Shanghai date-time helpers**

Use `Intl.DateTimeFormat(...).formatToParts()` to derive year, month, day, hour, and minute in `Asia/Shanghai`. Implement calendar subtraction with a noon-UTC anchor so the previous business date is stable:

```ts
export function getPreviousBusinessDate(orderDate: string): string {
  const [year, month, day] = orderDate.split("-").map(Number);
  const previous = new Date(Date.UTC(year, month - 1, day - 1, 12));
  return getShanghaiBusinessDate(previous);
}
```

`getLatestLockableShanghaiDate(now)` returns today at local 23:59 and returns the previous business date at all earlier local times.

- [ ] **Step 4: Implement token-owned atomic locking**

Use one D1 batch containing:

```sql
INSERT OR IGNORE INTO automatic_order_locks
  (order_date, locked_at, source, execution_token)
VALUES (?, ?, ?, ?)
```

Every following statement must include:

```sql
WHERE EXISTS (
  SELECT 1 FROM automatic_order_locks
  WHERE order_date = ? AND execution_token = ?
)
```

Apply that ownership condition to creating the daily order, setting `locked = 1`, incrementing revision, and inserting the `automatic_lock_order` activity row. After the batch, return whether the marker for this date owns the supplied token. A losing concurrent runner performs no order update.

Export:

```ts
export type AutomaticLockSource = "cron" | "request_fallback";
export type AutomaticLockInput = {
  orderDate: string;
  now: string;
  source: AutomaticLockSource;
  executionToken: string;
};
export async function ensureAutomaticLock(db: D1Database, input: AutomaticLockInput): Promise<boolean>;
export async function runAutomaticLockFallback(db: D1Database, now = new Date()): Promise<boolean>;
```

- [ ] **Step 5: Run automatic-lock tests**

Run: `npm run test:workers -- tests/functions/automatic-lock.test.ts`  
Expected: PASS.

- [ ] **Step 6: Commit automatic-lock core**

```bash
git add functions/_lib/automatic-lock.ts functions/_lib/date.ts functions/_lib/env.ts tests/functions/automatic-lock.test.ts
git commit -m "feat: lock daily orders idempotently at Shanghai cutoff"
```

---

### Task 8: Wire the Cron Worker and request-time fallback

**Files:**
- Create: `workers/auto-lock.ts`
- Create: `wrangler.auto-lock.toml`
- Modify: `functions/api/bootstrap.ts`
- Modify: `functions/api/order/adjust.ts`
- Modify: `functions/api/order/share-count.ts`
- Modify: `functions/api/order/changes.ts`
- Modify: `functions/api/history/index.ts`
- Modify: `functions/api/history/[date].ts`
- Modify: `functions/api/admin/order/import.ts`
- Modify: `functions/api/admin/order/item.ts`
- Modify: `functions/api/admin/order/clear.ts`
- Modify: `functions/api/admin/order/contribution.ts`
- Modify: `functions/api/admin/order/lock.ts`
- Modify: `tests/functions/order-api.test.ts`
- Modify: `tsconfig.json`
- Modify: `package.json`

- [ ] **Step 1: Add failing Worker and fallback API tests**

Test the scheduled handler directly with a synthetic scheduled time:

```ts
import worker from "../../workers/auto-lock";

await worker.scheduled(
  { scheduledTime: Date.parse("2026-07-30T15:59:00.000Z"), cron: "59 15 * * *", noRetry() {} } as ScheduledController,
  env,
  { waitUntil() {}, passThroughOnException() {} } as ExecutionContext,
);
expect((await getOrderSnapshot(env.DB, "2026-07-30")).locked).toBe(true);
```

For request fallback, export a bootstrap handler factory with an injected clock:

```ts
export function createBootstrapHandler(now: () => Date = () => new Date()): PagesFunction<Env> {
  return async ({ env }) => {
    try {
      const current = now();
      await runAutomaticLockFallback(env.DB, current);
      const orderDate = getShanghaiBusinessDate(current);
      const [configuration, order] = await Promise.all([
        getMenuConfiguration(env.DB),
        getOrderSnapshot(env.DB, orderDate),
      ]);
      return json({
        restaurantName: configuration.restaurantName,
        menu: configuration.menu,
        configurationRevision: configuration.configurationRevision,
        order,
      }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export const onRequestGet = createBootstrapHandler();
```

Call `createBootstrapHandler(() => new Date("2026-07-30T16:01:00.000Z"))` in the test, then assert `2026-07-30` is locked with one `request_fallback` marker. Other routes call the default `runAutomaticLockFallback(env.DB)`; the automatic-lock unit suite supplies their deterministic boundary coverage.

- [ ] **Step 2: Run worker/API tests and confirm failure**

Run: `npm run test:workers -- tests/functions/automatic-lock.test.ts tests/functions/order-api.test.ts`  
Expected: FAIL because the Worker and route integration do not exist.

- [ ] **Step 3: Implement the scheduled Worker**

```ts
import { ensureAutomaticLock } from "../functions/_lib/automatic-lock";
import { getShanghaiBusinessDate } from "../functions/_lib/date";
import type { AutoLockEnv } from "../functions/_lib/env";

export default {
  async scheduled(controller: ScheduledController, env: AutoLockEnv): Promise<void> {
    const scheduled = new Date(controller.scheduledTime);
    await ensureAutomaticLock(env.DB, {
      orderDate: getShanghaiBusinessDate(scheduled),
      now: scheduled.toISOString(),
      source: "cron",
      executionToken: `cron-${controller.scheduledTime}-${crypto.randomUUID()}`,
    });
  },
} satisfies ExportedHandler<AutoLockEnv>;
```

- [ ] **Step 4: Configure Worker deployment**

```toml
name = "web-order-auto-lock"
main = "workers/auto-lock.ts"
compatibility_date = "2026-07-30"

[triggers]
crons = ["59 15 * * *"]

[[d1_databases]]
binding = "DB"
database_name = "order"
database_id = "e238e4a3-259a-4fc3-a345-710710850249"
migrations_dir = "migrations"
```

Add package script:

```json
"deploy:auto-lock": "wrangler deploy --config wrangler.auto-lock.toml"
```

Add `"workers"` to `tsconfig.json` `include`.

- [ ] **Step 5: Run fallback before public reads/writes**

At the beginning of bootstrap, adjust, share-count, changes, history-list, history-detail, and every administrator order write handler call:

```ts
await runAutomaticLockFallback(env.DB);
```

For ordinary and administrator write routes, run the fallback before repository lock checks so a request arriving at or after the cutoff cannot write first. For the administrator lock route, run fallback before applying the requested manual state: an administrator unlock after the cutoff therefore leaves the successful automatic marker in place and is not relocked. The unique marker prevents repeated revision increments during polling and history reads.

- [ ] **Step 6: Run Worker tests and build**

Run: `npm run test:workers -- tests/functions/automatic-lock.test.ts tests/functions/order-api.test.ts && npm run build`  
Expected: PASS.

- [ ] **Step 7: Commit scheduling and fallback**

```bash
git add workers/auto-lock.ts wrangler.auto-lock.toml functions/api functions/_lib/env.ts tests/functions package.json tsconfig.json
git commit -m "feat: schedule daily order locking"
```

---

### Task 9: Build administrator menu management UI

**Files:**
- Create: `src/admin/MenuManagementPanel.tsx`
- Modify: `src/admin/MenuImportPanel.tsx`
- Modify: `src/admin/AdminPage.tsx`
- Modify: `src/app/AppRouter.tsx`
- Modify: `src/api/client.ts`
- Modify: `src/app/app.css`
- Modify: `tests/ui/admin-page.test.tsx`

- [ ] **Step 1: Replace old Markdown expectations with failing menu-management tests**

```tsx
const text = screen.getByLabelText("批量菜单文本");
await userEvent.type(text, "酸菜鱼 -- 68\n米饭 -- 2");
expect(screen.getByText("预览 2 道菜")).toBeInTheDocument();
await userEvent.click(screen.getByRole("button", { name: "准备覆盖菜单" }));
await userEvent.click(screen.getByRole("button", { name: "确认覆盖 2 道菜" }));
expect(api.adminImportMenu).toHaveBeenCalledWith("酸菜鱼 -- 68\n米饭 -- 2");
```

Add tests for:

- Single add calls `adminUpsertMenuItem({ name, priceCents })`.
- Each current menu row has `删除<菜品名>`.
- Delete requires an inline confirmation before the API call.
- Clear menu requires a separate confirmation phrase `清空全部菜单`.
- Failed requests preserve form text and show the API error.

- [ ] **Step 2: Run the UI test and confirm failure**

Run: `npm test -- tests/ui/admin-page.test.tsx`  
Expected: FAIL because the old Markdown UI and API shape remain.

- [ ] **Step 3: Update `MenuImportPanel`**

Use `parseMenuImportText`, state variable `text`, label `批量菜单文本`, placeholder:

```text
黄瓜火腿 -- 12
麻婆豆腐 -- 12
```

Use action copy `准备覆盖菜单` and `确认覆盖 N 道菜`. Keep parsed preview and source-line errors.

- [ ] **Step 4: Add `MenuManagementPanel`**

Define props:

```ts
type MenuManagementPanelProps = {
  menu: MenuItem[];
  api: Pick<AdminApi, "adminImportMenu" | "adminUpsertMenuItem" | "adminDeleteMenuItem" | "adminClearMenu">;
  onChanged?: () => void | Promise<void>;
};
```

The component owns single-item drafts, delete confirmation ID, clear confirmation phrase, busy state, and operation feedback. Parse the single price with `parsePriceToCents` before invoking the API.

- [ ] **Step 5: Pass the current menu into the administrator route**

Change `AdminPage` props to include `menu: MenuItem[]`, pass `props.menu` from `AppRouter`, and replace the direct `MenuImportPanel` use with `MenuManagementPanel`.

- [ ] **Step 6: Add responsive item-list styles and run tests**

Run: `npm test -- tests/ui/admin-page.test.tsx tests/ui/app-shell.test.tsx && npm run build`  
Expected: PASS.

- [ ] **Step 7: Commit menu UI**

```bash
git add src/admin src/app/AppRouter.tsx src/api/client.ts src/app/app.css tests/ui/admin-page.test.tsx
git commit -m "feat: add administrator menu management UI"
```

---

### Task 10: Build administrator ordered-dish management UI

**Files:**
- Create: `src/admin/OrderImportPanel.tsx`
- Create: `src/admin/OrderManagementPanel.tsx`
- Modify: `src/admin/AdminPage.tsx`
- Modify: `src/app/app.css`
- Modify: `tests/ui/admin-page.test.tsx`

- [ ] **Step 1: Add failing ordered-dish UI tests**

```tsx
await userEvent.click(screen.getByRole("button", { name: "加载所选订单" }));
const text = screen.getByLabelText("批量已点订单文本");
await userEvent.type(text, "黄瓜火腿 -- 12 -- 3\n麻婆豆腐 -- 12 -- 2");
expect(screen.getByText("共 5 份")).toBeInTheDocument();
await userEvent.click(screen.getByRole("button", { name: "准备覆盖已点订单" }));
await userEvent.click(screen.getByRole("button", { name: "确认覆盖已点订单" }));
expect(api.adminImportOrder).toHaveBeenCalledWith(
  "2026-07-30",
  "黄瓜火腿 -- 12 -- 3\n麻婆豆腐 -- 12 -- 2",
);
```

Add tests proving:

- Single item add passes name, price in cents, quantity, and selected date.
- Whole-dish delete requires confirmation and calls `adminDeleteOrderItem`.
- Clear selected order requires phrase `清空订单 YYYY-MM-DD`.
- All modification controls are disabled while the selected order is locked.
- Unlock refreshes the selected snapshot and enables controls.
- Existing per-contributor correction remains available.

- [ ] **Step 2: Run the UI tests and confirm failure**

Run: `npm test -- tests/ui/admin-page.test.tsx`  
Expected: FAIL because order import and whole-dish controls do not exist.

- [ ] **Step 3: Implement `OrderImportPanel`**

Use `parseOrderImportText` and calculate preview totals:

```ts
const totalQuantity = parsed.items.reduce((sum, item) => sum + item.quantity, 0);
const totalCents = parsed.items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
```

Props:

```ts
type OrderImportPanelProps = {
  orderDate: string;
  locked: boolean;
  onImport: (orderDate: string, text: string) => Promise<OrderSnapshot>;
  onImported: (snapshot: OrderSnapshot) => void | Promise<void>;
};
```

Keep text after failures, clear confirmation after success, and show `请先解锁订单` when locked.

- [ ] **Step 4: Move selected-order state into `OrderManagementPanel`**

Define the API dependency as:

```ts
type OrderManagementApi = Pick<AdminApi,
  | "historyDetail"
  | "adminSetOrderLocked"
  | "adminCorrectContribution"
  | "adminImportOrder"
  | "adminUpsertOrderItem"
  | "adminDeleteOrderItem"
  | "adminClearOrder"
>;
```

The panel owns `managedDate`, `managedOrder`, contribution drafts, single-item fields, destructive confirmations, and busy feedback. Every successful mutation replaces `managedOrder` with the returned snapshot and invokes `onChanged` when the managed date is today.

- [ ] **Step 5: Remove the duplicate today-only clear/lock cards from `AdminPage`**

Keep one selected-date order-management surface so today and historical dates use identical import/add/delete/clear semantics. Default the selected date to the current order date.

- [ ] **Step 6: Run UI tests and build**

Run: `npm test -- tests/ui/admin-page.test.tsx tests/ui/app-shell.test.tsx && npm run build`  
Expected: PASS.

- [ ] **Step 7: Commit order UI**

```bash
git add src/admin src/app/app.css tests/ui/admin-page.test.tsx
git commit -m "feat: add administrator ordered dish management UI"
```

---

### Task 11: Verify cross-device quantities and end-to-end administrator workflows

**Files:**
- Modify: `tests/ui/menu-page.test.tsx`
- Modify: `tests/e2e/ordering.spec.ts`
- Delete: `src/domain/menu-markdown.ts`
- Delete: `src/domain/menu-markdown.test.ts`

- [ ] **Step 1: Add a UI regression test for imported total quantity**

Render a menu item with an order snapshot containing:

```ts
contributors: [
  { deviceId: "admin-import", displayName: "管理员导入", quantity: 3 },
  { deviceId: "device-a", displayName: "张三", quantity: 1 },
]
```

Assert the dish card shows `共 4 份` between the minus and plus controls. Also assert the current device can still invoke `onAdjust(menuItemId, 1)` and `onAdjust(menuItemId, -1)`.

- [ ] **Step 2: Run the focused menu-page test**

Run: `npm test -- tests/ui/menu-page.test.tsx`  
Expected: PASS if current aggregate behavior is preserved; otherwise FAIL and fix the selector to use `dish.quantity` rather than the current device contribution.

- [ ] **Step 3: Extend the browser workflow**

Replace the old Markdown preview step with:

1. Login as administrator.
2. Import a two-column menu and confirm replacement.
3. Verify the second browser receives the menu revision without reloading.
4. Import `黄瓜火腿 -- 12 -- 3` into today’s order.
5. Verify both browsers show `共 3 份`.
6. Add one quantity from the ordinary user and verify both show `共 4 份` within 3 seconds.
7. Delete the whole dish from admin and verify both show zero/absence.
8. Add a single menu item, delete it, and clear the menu through confirmations.
9. Lock the order and verify ordinary plus/minus controls are disabled; unlock and verify they are enabled.

- [ ] **Step 4: Remove obsolete Markdown parser files and imports**

Run first: `grep -R "menu-markdown\|parseMenuMarkdown\|Markdown 菜单" -n src functions tests`  
Expected before cleanup: only obsolete files or missed callers. Remove all remaining old parser references, then delete both old files.

- [ ] **Step 5: Run UI and end-to-end suites**

Run: `npm test && npm run test:workers && npm run test:e2e`  
Expected: PASS.

- [ ] **Step 6: Commit integrated workflows**

```bash
git add src tests functions
git commit -m "test: cover admin imports and cross-device totals"
```

---

### Task 12: Update deployment documentation and perform final verification

**Files:**
- Modify: `docs/deployment-cloudflare-pages.md`

- [ ] **Step 1: Update deployment documentation**

Document the actual production resources:

```text
Pages project: web
Production URL: https://web-7ev.pages.dev/
D1 database: order
D1 database ID: e238e4a3-259a-4fc3-a345-710710850249
Scheduled Worker: web-order-auto-lock
Cron: 59 15 * * * (23:59 Asia/Shanghai)
```

Add exact commands:

```bash
npx wrangler d1 migrations apply order --remote
npm run deploy:auto-lock
npm run build
npx wrangler pages deploy dist --project-name web
```

Explain that migration `0003` must run before deploying Pages code and the Worker.

- [ ] **Step 2: Run the complete local verification matrix**

```bash
npm test
npm run test:workers
npm run build
npm run test:e2e
git diff --check
```

Expected: every command exits `0`; no TypeScript, formatting, migration, worker, UI, or browser test failures.

- [ ] **Step 3: Review the final diff against the approved specification**

Run:

```bash
git status --short
git diff --stat HEAD~8..HEAD
grep -R "menu-markdown\|parseMenuMarkdown\|Markdown 菜单" -n src functions tests || true
```

Expected: only intentional implementation/documentation changes; obsolete Markdown terms absent.

- [ ] **Step 4: Commit deployment documentation**

```bash
git add docs/deployment-cloudflare-pages.md package.json
git commit -m "docs: document order auto lock deployment"
```

- [ ] **Step 5: Push and deploy after local verification**

```bash
npx wrangler d1 export order --remote --output=/private/tmp/order-before-0003-2026-07-30.sql
npx wrangler d1 migrations apply order --remote
npm run deploy:auto-lock
git push origin main
npm run build
npx wrangler pages deploy dist --project-name web
```

Expected: the backup export exists, migration succeeds or reports already applied, Worker deployment reports the Cron trigger, the `main` push succeeds, and Pages deployment returns a successful deployment URL. The migration is deliberately applied before either new runtime is deployed.

- [ ] **Step 6: Verify production APIs and UI**

Check:

```bash
curl -fsS https://web-7ev.pages.dev/api/bootstrap
```

Then use two browser contexts to verify menu replacement, administrator order replacement, ordinary-user increment/decrement, cross-device total quantity, lock/unlock, whole-dish deletion, and destructive confirmations. In Cloudflare Dashboard verify `web-order-auto-lock` has Cron `59 15 * * *` and D1 binding `DB -> order`.

- [ ] **Step 7: Record production verification**

Add a final commit only if verification required documentation corrections. Otherwise record the deployment IDs and checks in the task completion response without creating an empty commit.
