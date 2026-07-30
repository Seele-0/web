import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient, type AdjustRequest, type BootstrapResponse, type OrderingApi, type OrderSnapshot, type ShareCountRequest } from "../api/client";
import { getShanghaiBusinessDate } from "../domain/date";
import { createPendingOperation, enqueueOperation, loadQueue, removeOperation, updateOperationFailure, type PendingOperation } from "../domain/queue";
import type { MenuItem } from "../domain/types";
import type { SyncState } from "../components/SyncStatus";

type Identity = { deviceId: string; displayName: string };

function optimisticAdjust(order: OrderSnapshot, menu: MenuItem[], identity: Identity, menuItemId: string, delta: 1 | -1): OrderSnapshot {
  const item = menu.find((entry) => entry.id === menuItemId);
  if (!item) return order;
  const dishes = order.dishes.map((dish) => ({ ...dish, contributors: dish.contributors.map((c) => ({ ...c })) }));
  let dish = dishes.find((entry) => entry.menuItemId === menuItemId);
  if (!dish && delta === 1) {
    dish = { menuItemId, name: item.name, priceCents: item.priceCents, quantity: 0, subtotalCents: 0, contributors: [] };
    dishes.push(dish);
  }
  if (!dish) return order;
  let contributor = dish.contributors.find((entry) => entry.deviceId === identity.deviceId);
  if (!contributor && delta === 1) {
    contributor = { deviceId: identity.deviceId, displayName: identity.displayName, quantity: 0 };
    dish.contributors.push(contributor);
  }
  if (!contributor || contributor.quantity + delta < 0) return order;
  contributor.quantity += delta;
  dish.contributors = dish.contributors.filter((entry) => entry.quantity > 0);
  dish.quantity += delta;
  dish.subtotalCents = dish.quantity * dish.priceCents;
  const filtered = dishes.filter((entry) => entry.quantity > 0);
  return { ...order, dishes: filtered, totalQuantity: filtered.reduce((sum, entry) => sum + entry.quantity, 0), totalCents: filtered.reduce((sum, entry) => sum + entry.subtotalCents, 0) };
}

export function useOrderSync(identity: Identity & { api?: OrderingApi }) {
  const api = identity.api ?? apiClient;
  const date = getShanghaiBusinessDate();
  const [restaurantName, setRestaurantName] = useState("今日点餐");
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [order, setOrder] = useState<OrderSnapshot | null>(null);
  const [status, setStatus] = useState<SyncState>(navigator.onLine ? "syncing" : "offline");
  const orderRef = useRef(order); orderRef.current = order;

  const applyBootstrap = useCallback((value: BootstrapResponse) => { setRestaurantName(value.restaurantName); setMenu(value.menu); setOrder(value.order); orderRef.current = value.order; }, []);
  const refresh = useCallback(async () => { const value = await api.bootstrap(date); applyBootstrap(value); setStatus("synced"); }, [api, date, applyBootstrap]);
  const poll = useCallback(async () => {
    if (!navigator.onLine || !orderRef.current) return;
    try {
      const result = await api.changes(date, orderRef.current.revision);
      if (result.changed) { setOrder(result.order); orderRef.current = result.order; }
      setStatus("synced");
    } catch { setStatus("failed"); }
  }, [api, date]);

  const sendOperation = useCallback(async (operation: PendingOperation) => {
    try {
      const snapshot = operation.type === "adjust"
        ? await api.adjust({ ...operation.body, operationId: operation.operationId } as AdjustRequest)
        : await api.setShareCount({ ...operation.body, operationId: operation.operationId } as ShareCountRequest);
      removeOperation(operation.operationId);
      setOrder(snapshot); orderRef.current = snapshot; setStatus("synced");
    } catch (error) {
      const message = error instanceof Error ? error.message : "同步失败";
      if ((error as { status?: number }).status === 409) { removeOperation(operation.operationId); await refresh(); }
      else { updateOperationFailure(operation.operationId, message); setStatus(navigator.onLine ? "failed" : "offline"); }
    }
  }, [api, refresh]);

  const replay = useCallback(async () => {
    if (!navigator.onLine) return;
    setStatus("syncing");
    for (const operation of loadQueue()) await sendOperation(operation);
    await refresh();
  }, [refresh, sendOperation]);

  useEffect(() => {
    void refresh().then(replay).catch(() => setStatus(navigator.onLine ? "failed" : "offline"));
    let timer: number;
    const schedule = () => { window.clearTimeout(timer); timer = window.setTimeout(async () => { await poll(); schedule(); }, document.hidden ? 10_000 : 2_000); };
    schedule();
    const online = () => void replay();
    const offline = () => setStatus("offline");
    const focus = () => void poll();
    const visibility = () => { schedule(); if (!document.hidden) void poll(); };
    window.addEventListener("online", online); window.addEventListener("offline", offline); window.addEventListener("focus", focus); document.addEventListener("visibilitychange", visibility);
    return () => { clearTimeout(timer); window.removeEventListener("online", online); window.removeEventListener("offline", offline); window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", visibility); };
  }, [poll, refresh, replay]);

  const adjust = useCallback(async (menuItemId: string, delta: 1 | -1) => {
    const body = { orderDate: date, menuItemId, deviceId: identity.deviceId, displayName: identity.displayName, delta };
    const operation = createPendingOperation("adjust", body);
    enqueueOperation(operation);
    if (orderRef.current) { const optimistic = optimisticAdjust(orderRef.current, menu, identity, menuItemId, delta); setOrder(optimistic); orderRef.current = optimistic; }
    if (!navigator.onLine) { setStatus("offline"); return; }
    setStatus("syncing"); await sendOperation(operation);
  }, [date, identity.deviceId, identity.displayName, menu, sendOperation]);

  const setShareCount = useCallback(async (shareCount: number) => {
    const body = { orderDate: date, deviceId: identity.deviceId, displayName: identity.displayName, shareCount };
    const operation = createPendingOperation("share-count", body); enqueueOperation(operation);
    if (orderRef.current) setOrder({ ...orderRef.current, shareCount });
    if (!navigator.onLine) { setStatus("offline"); return; }
    setStatus("syncing"); await sendOperation(operation);
  }, [date, identity.deviceId, identity.displayName, sendOperation]);

  return { restaurantName, menu, order, status, adjust, setShareCount, refresh };
}
