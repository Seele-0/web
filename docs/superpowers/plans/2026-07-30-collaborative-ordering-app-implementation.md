# Collaborative Ordering App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a mobile-first collaborative restaurant ordering app that deploys from GitHub to Cloudflare Pages, stores data in D1, and synchronizes about 10 users every two seconds.

**Architecture:** A React and Vite single-page app calls same-origin Pages Functions. Functions validate requests and use a D1 repository layer that stores per-device dish contributions, daily order metadata, idempotent operations, and audit records. The browser keeps identity and unsent operations in `localStorage`, applies optimistic updates, and reconciles with revisioned server snapshots.

**Tech Stack:** React, TypeScript, Vite, Cloudflare Pages Functions, Cloudflare D1, Vitest 4.1+, `@cloudflare/vitest-pool-workers`, Testing Library, Playwright, CSS modules or focused global CSS.

---

## File structure

The implementation uses focused files so domain rules, Cloudflare code, and UI code can be tested independently.

```text
.
├── functions/
│   ├── _lib/
│   │   ├── admin-session.ts
│   │   ├── date.ts
│   │   ├── env.ts
│   │   ├── http.ts
│   │   ├── menu-repository.ts
│   │   ├── order-repository.ts
│   │   └── validation.ts
│   └── api/
│       ├── admin/
│       │   ├── login.ts
│       │   ├── logout.ts
│       │   ├── menu/
│       │   │   └── import.ts
│       │   ├── order/
│       │   │   ├── clear.ts
│       │   │   ├── contribution.ts
│       │   │   └── lock.ts
│       │   └── settings/
│       │       └── restaurant-name.ts
│       ├── bootstrap.ts
│       ├── history/
│       │   ├── index.ts
│       │   └── [date].ts
│       └── order/
│           ├── adjust.ts
│           ├── changes.ts
│           └── share-count.ts
├── migrations/
│   ├── 0001_initial.sql
│   └── 0002_seed.sql
├── public/
│   └── favicon.svg
├── src/
│   ├── admin/
│   │   ├── AdminPage.tsx
│   │   └── MenuImportPanel.tsx
│   ├── api/
│   │   └── client.ts
│   ├── app/
│   │   ├── App.tsx
│   │   ├── AppRouter.tsx
│   │   └── app.css
│   ├── components/
│   │   ├── BottomSummary.tsx
│   │   ├── DishCard.tsx
│   │   ├── NameGate.tsx
│   │   ├── OfflineBanner.tsx
│   │   └── SyncStatus.tsx
│   ├── domain/
│   │   ├── date.ts
│   │   ├── identity.ts
│   │   ├── menu-markdown.ts
│   │   ├── money.ts
│   │   ├── order.ts
│   │   ├── queue.ts
│   │   └── types.ts
│   ├── history/
│   │   ├── HistoryDetailPage.tsx
│   │   └── HistoryListPage.tsx
│   ├── hooks/
│   │   ├── useIdentity.ts
│   │   └── useOrderSync.ts
│   ├── menu/
│   │   └── MenuPage.tsx
│   ├── overview/
│   │   └── OrderOverviewPage.tsx
│   ├── main.tsx
│   └── test/
│       └── setup.ts
├── tests/
│   ├── e2e/
│   │   └── ordering.spec.ts
│   ├── functions/
│   │   ├── admin.test.ts
│   │   ├── order-repository.test.ts
│   │   └── setup.ts
│   └── ui/
│       ├── menu-page.test.tsx
│       └── name-gate.test.tsx
├── .dev.vars.example
├── index.html
├── package.json
├── playwright.config.ts
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
├── vitest.worker.config.ts
└── wrangler.toml
```

## Task 1: Scaffold the React and Cloudflare project

This task creates a buildable shell before adding behavior.

**Files:**
- Create: `package.json`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/app/App.tsx`
- Create: `src/app/app.css`
- Create: `src/test/setup.ts`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `vitest.worker.config.ts`
- Create: `wrangler.toml`
- Create: `.dev.vars.example`

- [ ] **Step 1: Initialize package metadata and install runtime dependencies**

Run:

```bash
npm init -y
npm install react react-dom react-router-dom
npm install -D typescript vite @vitejs/plugin-react vitest@^4.1.0 jsdom \
  @testing-library/react @testing-library/jest-dom @testing-library/user-event \
  @types/react @types/react-dom wrangler @cloudflare/workers-types \
  @cloudflare/vitest-pool-workers playwright
```

Expected: `package.json` and `package-lock.json` exist, and npm exits with status 0.

- [ ] **Step 2: Write the failing app-shell test**

Create `tests/ui/app-shell.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { App } from "../../src/app/App";

it("renders the default restaurant heading", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: "今日点餐" })).toBeInTheDocument();
});
```

Create `src/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 3: Run the test and verify the red state**

Run:

```bash
npx vitest run tests/ui/app-shell.test.tsx
```

Expected: FAIL because `src/app/App.tsx` does not exist.

- [ ] **Step 4: Create the minimal app shell and build configuration**

Create `src/app/App.tsx`:

```tsx
export function App() {
  return <h1>今日点餐</h1>;
}
```

Create `src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./app/App";
import "./app/app.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
```

Create `index.html` with a `#root` element, a Chinese page title, and mobile viewport metadata. Configure `vite.config.ts` with `react()`, configure `vitest.config.ts` with `jsdom` and `src/test/setup.ts`, and configure `tsconfig.json` for strict TypeScript and JSX.

Create `wrangler.toml`:

```toml
name = "collaborative-ordering-app"
compatibility_date = "2026-07-30"
pages_build_output_dir = "./dist"
```

Create `.dev.vars.example`:

```dotenv
ADMIN_PASSWORD=change-this-before-deploying
ADMIN_SESSION_SECRET=generate-a-long-random-secret
```

Update `package.json` scripts:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:workers": "vitest run --config vitest.worker.config.ts",
    "test:e2e": "playwright test",
    "preview:pages": "wrangler pages dev dist --d1 DB=ordering-local-db"
  }
}
```

- [ ] **Step 5: Verify the shell and commit**

Run:

```bash
npm test -- tests/ui/app-shell.test.tsx
npm run build
git add package.json package-lock.json index.html src tsconfig.json vite.config.ts vitest.config.ts vitest.worker.config.ts wrangler.toml .dev.vars.example tests/ui/app-shell.test.tsx
git commit -m "chore: scaffold ordering app"
```

Expected: the test passes, the Vite build exits with status 0, and the commit succeeds.

## Task 2: Implement money, date, and order calculations

This task defines deterministic domain functions before UI or database code uses them.

**Files:**
- Create: `src/domain/types.ts`
- Create: `src/domain/money.ts`
- Create: `src/domain/date.ts`
- Create: `src/domain/order.ts`
- Test: `src/domain/money.test.ts`
- Test: `src/domain/date.test.ts`
- Test: `src/domain/order.test.ts`

- [ ] **Step 1: Write failing money and order tests**

Create tests that assert:

```ts
expect(parsePriceToCents("¥68")).toBe(6800);
expect(parsePriceToCents("32.50元")).toBe(3250);
expect(formatCents(3575)).toBe("¥35.75");
expect(calculateOrderTotals([{ priceCents: 6800, quantity: 2 }], 8)).toEqual({
  totalQuantity: 2,
  totalCents: 13600,
  perPersonCents: 1700,
});
expect(getShanghaiBusinessDate(new Date("2026-07-30T16:30:00.000Z"))).toBe("2026-07-31");
```

Also test invalid price text, a share count below 1, and empty orders.

- [ ] **Step 2: Run tests and verify the red state**

Run:

```bash
npx vitest run src/domain/money.test.ts src/domain/date.test.ts src/domain/order.test.ts
```

Expected: FAIL because the domain modules do not exist.

- [ ] **Step 3: Implement the minimal domain API**

Define stable shared types in `src/domain/types.ts`:

```ts
export type MenuItem = {
  id: string;
  name: string;
  priceCents: number;
  sortOrder: number;
  active: boolean;
};

export type Contribution = {
  menuItemId: string;
  deviceId: string;
  displayName: string;
  quantity: number;
};
```

Implement `parsePriceToCents`, `formatCents`, `getShanghaiBusinessDate`, `calculateOrderTotals`, `groupContributions`, and `buildDishSummaries`. Use integer arithmetic only.

- [ ] **Step 4: Run tests and commit**

Run:

```bash
npx vitest run src/domain/money.test.ts src/domain/date.test.ts src/domain/order.test.ts
git add src/domain
git commit -m "feat: add order calculation domain"
```

Expected: all domain tests pass.

## Task 3: Implement Markdown menu parsing

This task creates a pure parser that the admin UI and API can share.

**Files:**
- Create: `src/domain/menu-markdown.ts`
- Test: `src/domain/menu-markdown.test.ts`

- [ ] **Step 1: Write failing parser tests**

Cover list and table inputs:

```ts
const list = parseMenuMarkdown("- 酸菜鱼 | ¥68\n- 干锅花菜 | 32.50");
expect(list.items).toEqual([
  { name: "酸菜鱼", priceCents: 6800, sourceLine: 1 },
  { name: "干锅花菜", priceCents: 3250, sourceLine: 2 },
]);
expect(list.errors).toEqual([]);
```

Add tests for ignored headings, duplicate names, empty names, negative prices, prices with more than two decimal places, and table separator rows.

- [ ] **Step 2: Verify the parser test fails**

Run:

```bash
npx vitest run src/domain/menu-markdown.test.ts
```

Expected: FAIL because `parseMenuMarkdown` is missing.

- [ ] **Step 3: Implement the parser**

Expose this API:

```ts
export type ParsedMenuItem = {
  name: string;
  priceCents: number;
  sourceLine: number;
};

export type MenuParseError = {
  sourceLine: number;
  message: string;
  source: string;
};

export function parseMenuMarkdown(markdown: string): {
  items: ParsedMenuItem[];
  errors: MenuParseError[];
};
```

Normalize full-width currency symbols, trim Markdown list markers, recognize two-column tables, preserve source order, and collect all errors instead of stopping at the first one.

- [ ] **Step 4: Run tests and commit**

Run:

```bash
npx vitest run src/domain/menu-markdown.test.ts
git add src/domain/menu-markdown.ts src/domain/menu-markdown.test.ts
git commit -m "feat: parse markdown menus"
```

Expected: parser tests pass.

## Task 4: Create the D1 schema and worker test harness

This task defines storage constraints before repository methods are implemented.

**Files:**
- Create: `migrations/0001_initial.sql`
- Create: `migrations/0002_seed.sql`
- Create: `wrangler.test.toml`
- Create: `tests/functions/setup.ts`
- Create: `tests/functions/schema.test.ts`
- Modify: `vitest.worker.config.ts`

- [ ] **Step 1: Write a failing schema test**

Use `cloudflare:test` to apply migrations and query `sqlite_master`. Assert that `settings`, `menu_items`, `daily_orders`, `order_contributions`, `operations`, and `activity_log` exist, and that `restaurant_name` equals `今日点餐`.

- [ ] **Step 2: Run the worker test and verify the red state**

Run:

```bash
npm run test:workers -- tests/functions/schema.test.ts
```

Expected: FAIL because migrations do not exist.

- [ ] **Step 3: Create the migration**

Create tables with the exact keys from the design specification. Add these constraints and indexes:

```sql
CHECK (price_cents >= 0 AND price_cents <= 10000000)
CHECK (share_count >= 1 AND share_count <= 100)
CHECK (quantity >= 0)
UNIQUE (order_date, menu_item_id, device_id)
CREATE INDEX idx_contributions_date_item
  ON order_contributions(order_date, menu_item_id);
CREATE INDEX idx_activity_date_created
  ON activity_log(order_date, created_at DESC);
```

Seed `restaurant_name` and five example dishes in `0002_seed.sql`.

Configure `vitest.worker.config.ts` with `cloudflareTest`, `readD1Migrations`, a local D1 binding named `DB`, and isolated storage per test file.

- [ ] **Step 4: Verify migrations and commit**

Run:

```bash
npm run test:workers -- tests/functions/schema.test.ts
git add migrations wrangler.test.toml vitest.worker.config.ts tests/functions
git commit -m "feat: add d1 schema"
```

Expected: schema tests pass.

## Task 5: Implement server validation, HTTP helpers, and business dates

This task keeps request parsing and error responses consistent across every Pages Function.

**Files:**
- Create: `functions/_lib/env.ts`
- Create: `functions/_lib/http.ts`
- Create: `functions/_lib/validation.ts`
- Create: `functions/_lib/date.ts`
- Test: `tests/functions/validation.test.ts`

- [ ] **Step 1: Write failing validation tests**

Test that `parseAdjustRequest` accepts only `delta: 1` or `delta: -1`, trims names, rejects invalid UUID-like IDs, rejects non-today dates for ordinary writes, and returns a typed `HttpError` with status 400 or 403.

- [ ] **Step 2: Verify the red state**

Run:

```bash
npm run test:workers -- tests/functions/validation.test.ts
```

Expected: FAIL because helper modules do not exist.

- [ ] **Step 3: Implement shared helpers**

Define:

```ts
export interface Env {
  DB: D1Database;
  ADMIN_PASSWORD: string;
  ADMIN_SESSION_SECRET: string;
}

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export function json(data: unknown, init?: ResponseInit): Response;
export function errorResponse(error: unknown): Response;
export async function readJson<T>(request: Request, maxBytes?: number): Promise<T>;
```

Implement server-side Shanghai date calculation with `Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" })`.

- [ ] **Step 4: Run tests and commit**

Run:

```bash
npm run test:workers -- tests/functions/validation.test.ts
git add functions/_lib tests/functions/validation.test.ts
git commit -m "feat: add pages function request helpers"
```

Expected: validation tests pass.

## Task 6: Implement atomic order contribution mutations

This task implements the conflict-safe core of collaborative ordering.

**Files:**
- Create: `functions/_lib/order-repository.ts`
- Test: `tests/functions/order-repository.test.ts`

- [ ] **Step 1: Write failing repository tests**

Apply migrations before each test, then assert:

```ts
await adjustContribution(env.DB, {
  operationId: "device-a-1",
  orderDate: "2026-07-30",
  menuItemId: "dish-acid-fish",
  deviceId: "device-a",
  displayName: "张三",
  delta: 1,
  now: "2026-07-30T10:00:00.000Z",
});
```

The snapshot must show quantity 1 and revision 1. Replaying `device-a-1` must keep quantity 1. A second device must increase the aggregate to 2. Decrementing a zero contribution must return a 409 domain error and keep the database unchanged.

- [ ] **Step 2: Verify the red state**

Run:

```bash
npm run test:workers -- tests/functions/order-repository.test.ts
```

Expected: FAIL because repository functions do not exist.

- [ ] **Step 3: Implement repository methods**

Export:

```ts
export async function adjustContribution(db: D1Database, input: AdjustInput): Promise<OrderSnapshot>;
export async function setShareCount(db: D1Database, input: ShareCountInput): Promise<OrderSnapshot>;
export async function getOrderSnapshot(db: D1Database, orderDate: string): Promise<OrderSnapshot>;
export async function clearOrder(db: D1Database, input: AdminClearInput): Promise<void>;
export async function setOrderLocked(db: D1Database, input: AdminLockInput): Promise<void>;
```

Use prepared statements with ordered placeholders. Execute operation insertion, contribution upsert, revision increment, and audit insertion in one D1 `batch()` call. Make the contribution SQL itself atomic:

```sql
INSERT INTO order_contributions (..., quantity, ...)
VALUES (..., CASE WHEN ?6 = 1 THEN 1 ELSE 0 END, ...)
ON CONFLICT(order_date, menu_item_id, device_id)
DO UPDATE SET
  display_name = excluded.display_name,
  quantity = order_contributions.quantity + ?6,
  updated_at = excluded.updated_at
WHERE order_contributions.quantity + ?6 >= 0;
```

Check the unique operation before executing the batch, and re-read the existing snapshot when the operation was already applied.

- [ ] **Step 4: Verify concurrency behavior and commit**

Run:

```bash
npm run test:workers -- tests/functions/order-repository.test.ts
git add functions/_lib/order-repository.ts tests/functions/order-repository.test.ts
git commit -m "feat: add conflict-safe order repository"
```

Expected: idempotency, multi-device aggregation, revision, and non-negative quantity tests pass.

## Task 7: Implement bootstrap, polling, order mutation, and history APIs

This task exposes the tested repository through Pages Function routes.

**Files:**
- Create: `functions/api/bootstrap.ts`
- Create: `functions/api/order/adjust.ts`
- Create: `functions/api/order/share-count.ts`
- Create: `functions/api/order/changes.ts`
- Create: `functions/api/history/index.ts`
- Create: `functions/api/history/[date].ts`
- Test: `tests/functions/order-api.test.ts`

- [ ] **Step 1: Write failing route tests**

Invoke each route handler with a real test D1 binding. Assert that:

- bootstrap returns restaurant name, active menu, order snapshot, and revision;
- adjust accepts a current-date `+1` request;
- repeated operation IDs do not duplicate quantity;
- changes returns `{ changed: false }` when `since` equals current revision;
- ordinary writes to a past date return 403;
- history returns dates in descending order.

- [ ] **Step 2: Verify the red state**

Run:

```bash
npm run test:workers -- tests/functions/order-api.test.ts
```

Expected: FAIL because the route files do not exist.

- [ ] **Step 3: Implement the route handlers**

Each route must follow this shape:

```ts
export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const input = await readJson<unknown>(context.request);
    const validated = parseAdjustRequest(input);
    assertTodayAndUnlocked(validated.orderDate, context.env.DB);
    return json(await adjustContribution(context.env.DB, validated));
  } catch (error) {
    return errorResponse(error);
  }
};
```

Return `Cache-Control: no-store` for order responses. Return status 304 or `{ changed: false, revision }` for unchanged polling requests; use the JSON form if browser handling is clearer.

- [ ] **Step 4: Run route tests and commit**

Run:

```bash
npm run test:workers -- tests/functions/order-api.test.ts
git add functions/api tests/functions/order-api.test.ts
git commit -m "feat: add order and history APIs"
```

Expected: all route tests pass.

## Task 8: Implement admin sessions and menu management APIs

This task protects configuration and destructive operations without adding user accounts.

**Files:**
- Create: `functions/_lib/admin-session.ts`
- Create: `functions/_lib/menu-repository.ts`
- Create: `functions/api/admin/login.ts`
- Create: `functions/api/admin/logout.ts`
- Create: `functions/api/admin/menu/import.ts`
- Create: `functions/api/admin/settings/restaurant-name.ts`
- Create: `functions/api/admin/order/clear.ts`
- Create: `functions/api/admin/order/lock.ts`
- Create: `functions/api/admin/order/contribution.ts`
- Test: `tests/functions/admin.test.ts`

- [ ] **Step 1: Write failing admin tests**

Test invalid login, valid login cookie attributes, expired or modified cookie rejection, Markdown import without a cookie, successful menu upsert, old-item deactivation, restaurant rename, order lock, order clear, and contribution correction.

- [ ] **Step 2: Verify the red state**

Run:

```bash
npm run test:workers -- tests/functions/admin.test.ts
```

Expected: FAIL because admin helpers and routes do not exist.

- [ ] **Step 3: Implement HMAC admin sessions**

Use Web Crypto. Sign a payload containing `issuedAt` and `expiresAt` with `HMAC-SHA-256` and `ADMIN_SESSION_SECRET`. Set the cookie as:

```text
admin_session=<signed-token>; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=14400
```

Compare the submitted password without exposing it in logs or error messages. Reject missing environment secrets with a server configuration error.

- [ ] **Step 4: Implement menu and destructive admin methods**

Reuse `parseMenuMarkdown` in the Function bundle. Import must upsert by normalized name, preserve stable IDs, update prices and order, deactivate absent items, increment a menu revision setting, and insert an activity record.

Clear must set all contributions for a date to zero or delete active contribution rows while preserving `operations` and `activity_log`. Lock and unlock must update `daily_orders.locked` and increment revision.

- [ ] **Step 5: Run tests and commit**

Run:

```bash
npm run test:workers -- tests/functions/admin.test.ts
git add functions/_lib/admin-session.ts functions/_lib/menu-repository.ts functions/api/admin tests/functions/admin.test.ts
git commit -m "feat: add admin and menu APIs"
```

Expected: admin authentication and management tests pass.

## Task 9: Implement browser identity and the name gate

This task creates the first complete user interaction and remembers the user's name locally.

**Files:**
- Create: `src/domain/identity.ts`
- Create: `src/hooks/useIdentity.ts`
- Create: `src/components/NameGate.tsx`
- Test: `src/domain/identity.test.ts`
- Test: `tests/ui/name-gate.test.tsx`
- Modify: `src/app/App.tsx`

- [ ] **Step 1: Write failing identity tests**

Assert that the identity module:

- trims and validates names from 1 to 30 characters;
- generates a device ID once;
- reloads the saved name and device ID;
- updates the saved name without changing the device ID.

Write a UI test that enters `张三`, submits, and sees the menu shell instead of the modal.

- [ ] **Step 2: Verify the red state**

Run:

```bash
npx vitest run src/domain/identity.test.ts tests/ui/name-gate.test.tsx
```

Expected: FAIL because identity and gate components do not exist.

- [ ] **Step 3: Implement identity storage and UI**

Use these keys:

```ts
const NAME_KEY = "ordering.displayName";
const DEVICE_KEY = "ordering.deviceId";
```

Generate IDs with `crypto.randomUUID()`. The gate must support a saved-name quick entry and an edit action. Add accessible labels, Enter-key submission, inline validation, and focus management.

- [ ] **Step 4: Run tests and commit**

Run:

```bash
npx vitest run src/domain/identity.test.ts tests/ui/name-gate.test.tsx
git add src/domain/identity.ts src/hooks/useIdentity.ts src/components/NameGate.tsx src/app/App.tsx tests/ui/name-gate.test.tsx
git commit -m "feat: remember diner identity"
```

Expected: identity tests pass.

## Task 10: Implement the API client, optimistic state, polling, and offline queue

This task connects the browser to the near-real-time backend.

**Files:**
- Create: `src/api/client.ts`
- Create: `src/domain/queue.ts`
- Create: `src/hooks/useOrderSync.ts`
- Create: `src/components/OfflineBanner.tsx`
- Create: `src/components/SyncStatus.tsx`
- Test: `src/domain/queue.test.ts`
- Test: `src/hooks/useOrderSync.test.tsx`

- [ ] **Step 1: Write failing queue and sync tests**

Test ordered queue persistence, operation ID uniqueness, duplicate removal, replay after reconnect, 2-second foreground polling, 10-second hidden-page polling, immediate focus refresh, and optimistic rollback after a 409 response.

Use fake fetch responses but assert the hook's public state rather than mock call details alone.

- [ ] **Step 2: Verify the red state**

Run:

```bash
npx vitest run src/domain/queue.test.ts src/hooks/useOrderSync.test.tsx
```

Expected: FAIL because queue and hook modules do not exist.

- [ ] **Step 3: Implement the API client and queue**

Expose typed methods:

```ts
bootstrap(date: string): Promise<BootstrapResponse>;
adjust(input: AdjustRequest): Promise<OrderSnapshot>;
setShareCount(input: ShareCountRequest): Promise<OrderSnapshot>;
changes(date: string, revision: number): Promise<ChangesResponse>;
history(): Promise<HistorySummary[]>;
historyDetail(date: string): Promise<OrderSnapshot>;
```

Persist queued writes under `ordering.pendingOperations`. Each queued operation must include `operationId`, `createdAt`, request body, retry count, and last error.

- [ ] **Step 4: Implement `useOrderSync`**

The hook must own the server snapshot, optimistic overlay, pending queue, sync status, and timers. Use `navigator.onLine`, `online`, `offline`, `visibilitychange`, and `focus` events. Always reconcile from a fresh server snapshot after replaying the queue.

- [ ] **Step 5: Run tests and commit**

Run:

```bash
npx vitest run src/domain/queue.test.ts src/hooks/useOrderSync.test.tsx
git add src/api src/domain/queue.ts src/hooks src/components/OfflineBanner.tsx src/components/SyncStatus.tsx
git commit -m "feat: add resilient order synchronization"
```

Expected: queue and synchronization tests pass.

## Task 11: Build the accepted mobile-first menu UI

This task implements the approved warm restaurant design without adding unapproved content.

**Files:**
- Create: `src/menu/MenuPage.tsx`
- Create: `src/components/DishCard.tsx`
- Create: `src/components/BottomSummary.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/app.css`
- Test: `tests/ui/menu-page.test.tsx`

- [ ] **Step 1: Write failing menu interaction tests**

Render two dishes and assert:

- the restaurant name and date appear;
- dish name and price appear without descriptions or categories;
- clicking plus calls the adjustment callback with `+1`;
- minus is disabled when the current user contribution is 0;
- search filters by dish name;
- the fixed summary shows quantity, total, share count, and per-person amount;
- no orderer names appear on the menu page.

- [ ] **Step 2: Verify the red state**

Run:

```bash
npx vitest run tests/ui/menu-page.test.tsx
```

Expected: FAIL because the menu components do not exist.

- [ ] **Step 3: Implement the menu page**

Build semantic buttons with at least 44×44 CSS pixel touch targets. Use CSS custom properties for the accepted palette:

```css
:root {
  --bg: #f7f4ed;
  --surface: #ffffff;
  --ink: #25231f;
  --muted: #8b8378;
  --accent: #df5836;
  --accent-dark: #bd4328;
  --success: #28784c;
  --footer: #23221f;
  --radius-card: 15px;
}
```

The desktop layout must cap the content width and keep the bottom summary readable. Add bottom padding equal to the fixed summary height so it cannot cover the last dish.

- [ ] **Step 4: Run UI tests and commit**

Run:

```bash
npx vitest run tests/ui/menu-page.test.tsx
npm run build
git add src/menu src/components/DishCard.tsx src/components/BottomSummary.tsx src/app src/test tests/ui/menu-page.test.tsx
git commit -m "feat: build mobile ordering menu"
```

Expected: UI tests and production build pass.

## Task 12: Build order overview, history, and routing

This task completes the ordinary user workflow.

**Files:**
- Create: `src/app/AppRouter.tsx`
- Create: `src/overview/OrderOverviewPage.tsx`
- Create: `src/history/HistoryListPage.tsx`
- Create: `src/history/HistoryDetailPage.tsx`
- Test: `tests/ui/overview-history.test.tsx`
- Modify: `src/app/App.tsx`

- [ ] **Step 1: Write failing overview and history tests**

Assert that the overview groups names by dish, shows `张三 × 2` once, shows subtotal and totals, and never derives share count from name count. Assert that history lists dates descending and renders old orders as read-only.

- [ ] **Step 2: Verify the red state**

Run:

```bash
npx vitest run tests/ui/overview-history.test.tsx
```

Expected: FAIL because overview and history pages do not exist.

- [ ] **Step 3: Implement routes and pages**

Use these routes:

```text
/                 menu
/overview         current order overview
/history          history date list
/history/:date    read-only history detail
/admin            administrator page
```

The overview must display dish quantity, unit price, subtotal, and orderer names. History detail must reuse the overview presentation with all controls removed.

- [ ] **Step 4: Run tests and commit**

Run:

```bash
npx vitest run tests/ui/overview-history.test.tsx
npm run build
git add src/app src/overview src/history tests/ui/overview-history.test.tsx
git commit -m "feat: add order overview and history"
```

Expected: overview and history tests pass.

## Task 13: Build the administrator UI

This task makes the Cloudflare-backed configuration manageable from the browser.

**Files:**
- Create: `src/admin/AdminPage.tsx`
- Create: `src/admin/MenuImportPanel.tsx`
- Test: `tests/ui/admin-page.test.tsx`
- Modify: `src/api/client.ts`
- Modify: `src/app/AppRouter.tsx`

- [ ] **Step 1: Write failing admin UI tests**

Test login failure, login success, restaurant rename, Markdown preview, error-line display, confirmation before import, confirmation before clear, lock toggle, and preservation of Markdown text after API failure.

- [ ] **Step 2: Verify the red state**

Run:

```bash
npx vitest run tests/ui/admin-page.test.tsx
```

Expected: FAIL because admin components do not exist.

- [ ] **Step 3: Implement the administrator workflow**

Keep the password in component state only and clear it after submission. Preview Markdown in the browser with `parseMenuMarkdown`, but let the API parse it again before writing. Disable confirmation while parse errors exist.

Require a typed confirmation phrase such as `清空 2026-07-30` before clearing an order. Show success and error feedback next to the action that produced it.

- [ ] **Step 4: Run tests and commit**

Run:

```bash
npx vitest run tests/ui/admin-page.test.tsx
npm run build
git add src/admin src/api/client.ts src/app/AppRouter.tsx tests/ui/admin-page.test.tsx
git commit -m "feat: add administrator interface"
```

Expected: admin UI tests and production build pass.

## Task 14: Add end-to-end coverage and Cloudflare deployment documentation

This task verifies the full browser workflow and documents the exact GitHub-to-Cloudflare setup.

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/ordering.spec.ts`
- Create: `README.md`
- Create: `docs/deployment-cloudflare-pages.md`
- Modify: `package.json`
- Modify: `.gitignore`

- [ ] **Step 1: Write the failing end-to-end test**

The test must:

1. open the app in a clean browser context;
2. enter `张三`;
3. add one dish;
4. open overview and see `张三`;
5. set share count to 8 and verify the displayed amount;
6. open a second context as `李四` and add the same dish;
7. verify the first context sees quantity 2 within 3 seconds;
8. simulate offline mode, queue an addition, restore the network, and verify synchronization;
9. open history;
10. log in as administrator and preview a Markdown menu.

- [ ] **Step 2: Verify the end-to-end test is red**

Run:

```bash
npm run build
npm run test:e2e
```

Expected: FAIL until the local Pages test server and seed setup are wired into Playwright.

- [ ] **Step 3: Configure Playwright and local Pages startup**

Configure `webServer` to run a script that applies local D1 migrations, builds the app, and starts `wrangler pages dev dist --d1 DB=ordering-e2e-db`. Set test secrets through `.dev.vars` generated from test-only values, never production values.

- [ ] **Step 4: Write deployment documentation**

Document these exact Cloudflare steps:

1. create a D1 database named `collaborative-ordering`;
2. apply `migrations/0001_initial.sql` and `migrations/0002_seed.sql` with Wrangler or the dashboard;
3. create a Pages project connected to the GitHub repository;
4. set build command `npm run build` and output directory `dist`;
5. add a D1 binding named `DB` to production and preview environments;
6. add encrypted secrets `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET`;
7. redeploy after bindings change;
8. verify `/api/bootstrap` returns HTTP 200;
9. explain database export and restoration commands.

Cloudflare's Pages Functions documentation supports Git-provider deployment and D1 bindings through project settings or Wrangler configuration. The deployment guide must link to the official Pages Functions binding, D1 migration, and Pages Git integration documentation.

- [ ] **Step 5: Run the full verification suite**

Run:

```bash
npm test
npm run test:workers
npm run test:e2e
npm run build
```

Expected: all tests pass with zero failures and the build exits with status 0.

- [ ] **Step 6: Commit deployment and end-to-end work**

Run:

```bash
git add playwright.config.ts tests/e2e README.md docs package.json package-lock.json .gitignore
git commit -m "test: verify collaborative ordering workflow"
```

Expected: commit succeeds.

## Task 15: Perform visual fidelity and final requirement verification

This task compares the browser implementation with the accepted warm restaurant design and checks every specification item before handoff.

**Files:**
- Modify: only files required by discovered mismatches
- Create temporarily, then remove: browser screenshots and QA artifacts

- [ ] **Step 1: Start the production-like local app**

Run:

```bash
npm run build
npm run preview:pages
```

Expected: Wrangler reports a local Pages URL and a `DB` binding.

- [ ] **Step 2: Inspect mobile and desktop viewports**

Check 375×812 and 1440×900 viewports. Verify no horizontal scroll, no covered final dish, 44×44 touch controls, readable totals, visible sync status, and responsive navigation.

- [ ] **Step 3: Compare against the accepted visual concept**

Capture current browser screenshots. Use `view_image` on both the accepted concept and latest implementation screenshot. Compare palette, typography, card spacing, search field, quantity controls, fixed summary, visible copy, and mobile viewport balance.

Fix every material mismatch and recapture until no agency-signoff issue remains. Do not add categories, dish descriptions, time selection, or names to the menu page.

- [ ] **Step 4: Audit specification coverage**

Verify each confirmed design decision against the implementation:

```text
[ ] Cloudflare Pages Functions and D1 only
[ ] name entry and local memory
[ ] menu has no categories or descriptions
[ ] menu page hides orderer names
[ ] overview shows orderer names
[ ] manual share count and equal split
[ ] two-second near-real-time polling
[ ] idempotent writes and per-device contributions
[ ] offline queue and recovery
[ ] Shanghai daily history
[ ] Markdown name-and-price import
[ ] administrator protections
[ ] mobile and desktop accessibility
```

- [ ] **Step 5: Run final verification and commit fixes**

Run:

```bash
npm test
npm run test:workers
npm run test:e2e
npm run build
git status --short
```

Expected: all commands pass; `git status --short` shows only the user's original reference image as untracked unless the user chooses to commit it.

If fixes were required, commit them:

```bash
git add src functions tests docs package.json package-lock.json

git commit -m "fix: complete ordering app verification"
```

