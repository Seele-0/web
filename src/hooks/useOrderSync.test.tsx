import { act, renderHook } from "@testing-library/react";
import { createPendingOperation, enqueueOperation, loadQueue } from "../domain/queue";
import { useOrderSync } from "./useOrderSync";

const emptyOrder = { orderDate: "2026-07-30", shareCount: 1, revision: 0, locked: false, totalQuantity: 0, totalCents: 0, dishes: [] };
const menu = [{ id: "dish-1", name: "酸菜鱼", priceCents: 6800, sortOrder: 1, active: true }];

function fakeApi() {
  return {
    bootstrap: vi.fn().mockResolvedValue({ restaurantName: "今日点餐", menu, configurationRevision: 0, order: emptyOrder }),
    adjust: vi.fn().mockResolvedValue({ ...emptyOrder, revision: 1, totalQuantity: 1, totalCents: 6800, dishes: [{ menuItemId: "dish-1", name: "酸菜鱼", priceCents: 6800, quantity: 1, subtotalCents: 6800, contributors: [{ deviceId: "device-a", displayName: "张三", quantity: 1 }] }] }),
    setShareCount: vi.fn(),
    changes: vi.fn().mockResolvedValue({ changed: false, revision: 0, configurationRevision: 0 }),
    history: vi.fn(),
    historyDetail: vi.fn(),
  };
}

describe("useOrderSync", () => {
  beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); });
  afterEach(() => vi.useRealTimers());

  it("polls every second while visible and refreshes on focus", async () => {
    const api = fakeApi();
    renderHook(() => useOrderSync({ deviceId: "device-a", displayName: "张三", api }));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { vi.advanceTimersByTime(1000); await Promise.resolve(); });
    expect(api.changes).toHaveBeenCalled();
    act(() => window.dispatchEvent(new Event("focus")));
    expect(api.changes.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("applies restaurant and menu changes without reloading the page", async () => {
    const api = fakeApi();
    const updatedMenu = [{ id: "dish-2", name: "麻婆豆腐", priceCents: 1200, sortOrder: 1, active: true }];
    api.changes.mockResolvedValueOnce({
      changed: false,
      revision: 0,
      configurationRevision: 1,
      configuration: { restaurantName: "彭记小炒", menu: updatedMenu },
    });
    const { result } = renderHook(() => useOrderSync({ deviceId: "device-a", displayName: "张三", api }));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(api.changes).toHaveBeenCalledWith("2026-07-30", 0, 0);
    expect(result.current.restaurantName).toBe("彭记小炒");
    expect(result.current.menu).toEqual(updatedMenu);
  });

  it("coalesces concurrent polling triggers into one request", async () => {
    const api = fakeApi();
    let resolveChanges!: (value: { changed: false; revision: number; configurationRevision: number }) => void;
    api.changes.mockImplementationOnce(() => new Promise((resolve) => { resolveChanges = resolve; }));
    renderHook(() => useOrderSync({ deviceId: "device-a", displayName: "张三", api }));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    act(() => {
      window.dispatchEvent(new Event("focus"));
      window.dispatchEvent(new Event("focus"));
    });
    expect(api.changes).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveChanges({ changed: false, revision: 0, configurationRevision: 0 });
      await Promise.resolve();
    });
  });

  it("applies an optimistic addition and reconciles the server snapshot", async () => {
    const api = fakeApi();
    const { result } = renderHook(() => useOrderSync({ deviceId: "device-a", displayName: "张三", api }));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
    expect(result.current.order).not.toBeNull();
    await act(async () => { await result.current.adjust("dish-1", 1); });
    expect(result.current.order?.totalQuantity).toBe(1);
    expect(result.current.status).toBe("synced");
  });

  it("rolls back from a 409 by loading a fresh server snapshot", async () => {
    const api = fakeApi();
    api.adjust.mockRejectedValueOnce(Object.assign(new Error("conflict"), { status: 409 }));
    const { result } = renderHook(() => useOrderSync({ deviceId: "device-a", displayName: "张三", api }));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
    expect(result.current.order).not.toBeNull();
    await act(async () => { await result.current.adjust("dish-1", -1); });
    expect(api.bootstrap.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(result.current.order?.totalQuantity).toBe(0);
  });

  it("switches to the new Shanghai business date without requiring a reload", async () => {
    vi.setSystemTime(new Date("2026-07-30T15:59:59.000Z"));
    const api = fakeApi();
    const { result } = renderHook(() => useOrderSync({ deviceId: "device-a", displayName: "张三", api }));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(result.current.date).toBe("2026-07-30");

    await act(async () => {
      vi.advanceTimersByTime(2_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.date).toBe("2026-07-31");
    expect(api.bootstrap).toHaveBeenCalledWith("2026-07-31");
  });

  it("discards offline operations from the previous business date after midnight", async () => {
    vi.setSystemTime(new Date("2026-07-30T15:59:59.000Z"));
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    enqueueOperation(createPendingOperation("adjust", {
      orderDate: "2026-07-30",
      menuItemId: "dish-1",
      deviceId: "device-a",
      displayName: "张三",
      delta: 1,
    }));
    const api = fakeApi();
    renderHook(() => useOrderSync({ deviceId: "device-a", displayName: "张三", api }));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    await act(async () => {
      vi.advanceTimersByTime(2_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    online.mockReturnValue(true);
    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(api.adjust).not.toHaveBeenCalled();
    expect(loadQueue()).toEqual([]);
    online.mockRestore();
  });
});
