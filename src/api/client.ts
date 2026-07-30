import type { MenuItem } from "../domain/types";

export type Contributor = { deviceId: string; displayName: string; quantity: number };
export type DishSnapshot = { menuItemId: string; name: string; priceCents: number; quantity: number; subtotalCents: number; contributors: Contributor[] };
export type OrderSnapshot = { orderDate: string; shareCount: number; revision: number; locked: boolean; totalQuantity: number; totalCents: number; dishes: DishSnapshot[] };
export type BootstrapResponse = { restaurantName: string; menu: MenuItem[]; configurationRevision: number; order: OrderSnapshot };
export type AdjustRequest = { operationId: string; orderDate: string; menuItemId: string; deviceId: string; displayName: string; delta: 1 | -1 };
export type ShareCountRequest = { operationId: string; orderDate: string; deviceId: string; displayName: string; shareCount: number };
export type ChangesResponse = {
  changed: boolean;
  revision: number;
  order?: OrderSnapshot;
  configurationRevision: number;
  configuration?: { restaurantName: string; menu: MenuItem[] };
};
export type HistorySummary = Pick<OrderSnapshot, "orderDate" | "shareCount" | "revision" | "locked" | "totalQuantity" | "totalCents">;
export type AdminContributionRequest = Pick<Contributor, "deviceId" | "displayName" | "quantity"> & { orderDate: string; menuItemId: string };
export type AdminMenuItemRequest = { name: string; priceCents: number };
export type AdminOrderItemRequest = AdminMenuItemRequest & { orderDate: string; quantity: number };
export type ParsedMenuResponse = { items: Array<{ name: string; priceCents: number; sourceLine: number }>; errors: [] };

export class ApiError extends Error { constructor(message: string, public status: number, public code?: string) { super(message); } }

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store", ...init });
  const body = await response.json().catch(() => ({})) as { error?: { message?: string; code?: string } };
  if (!response.ok) throw new ApiError(body?.error?.message ?? "请求失败", response.status, body?.error?.code);
  return body as T;
}
const jsonInit = (method: string, body: unknown): RequestInit => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export const apiClient = {
  bootstrap: (_date: string) => requestJson<BootstrapResponse>("/api/bootstrap"),
  adjust: (input: AdjustRequest) => requestJson<OrderSnapshot>("/api/order/adjust", jsonInit("POST", input)),
  setShareCount: (input: ShareCountRequest) => requestJson<OrderSnapshot>("/api/order/share-count", jsonInit("PUT", input)),
  changes: (date: string, revision: number, configurationRevision: number) => requestJson<ChangesResponse>(
    `/api/order/changes?date=${encodeURIComponent(date)}&since=${revision}&configurationSince=${configurationRevision}`,
  ),
  history: async () => (await requestJson<{ dates: HistorySummary[] }>("/api/history")).dates,
  historyDetail: (date: string) => requestJson<OrderSnapshot>(`/api/history/${encodeURIComponent(date)}`),
  adminLogin: (password: string) => requestJson<{ authenticated: true }>("/api/admin/login", jsonInit("POST", { password })),
  adminLogout: () => requestJson<{ authenticated: false }>("/api/admin/logout", { method: "POST" }),
  adminRenameRestaurant: (restaurantName: string) => requestJson<{ restaurantName: string }>("/api/admin/settings/restaurant-name", jsonInit("PUT", { restaurantName })),
  adminImportMenu: (text: string) => requestJson<ParsedMenuResponse>("/api/admin/menu/import", jsonInit("POST", { text })),
  adminUpsertMenuItem: (input: AdminMenuItemRequest) => requestJson<MenuItem>("/api/admin/menu/item", jsonInit("POST", input)),
  adminDeleteMenuItem: (menuItemId: string) => requestJson<{ deleted: true }>("/api/admin/menu/item", jsonInit("DELETE", { menuItemId })),
  adminClearMenu: () => requestJson<{ cleared: true }>("/api/admin/menu/clear", jsonInit("POST", {})),
  adminImportOrder: (orderDate: string, text: string) => requestJson<OrderSnapshot>("/api/admin/order/import", jsonInit("POST", { orderDate, text })),
  adminUpsertOrderItem: (input: AdminOrderItemRequest) => requestJson<OrderSnapshot>("/api/admin/order/item", jsonInit("POST", input)),
  adminDeleteOrderItem: (orderDate: string, menuItemId: string) => requestJson<OrderSnapshot>("/api/admin/order/item", jsonInit("DELETE", { orderDate, menuItemId })),
  adminClearOrder: (orderDate: string) => requestJson<OrderSnapshot>("/api/admin/order/clear", jsonInit("POST", { orderDate })),
  adminSetOrderLocked: (orderDate: string, locked: boolean) => requestJson<OrderSnapshot>("/api/admin/order/lock", jsonInit("PUT", { orderDate, locked })),
  adminCorrectContribution: (input: AdminContributionRequest) => requestJson<OrderSnapshot>("/api/admin/order/contribution", jsonInit("PUT", input)),
};
export type OrderingApi = Pick<typeof apiClient, "bootstrap" | "adjust" | "setShareCount" | "changes" | "history" | "historyDetail">;
