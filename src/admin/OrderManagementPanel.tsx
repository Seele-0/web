import { useState } from "react";
import type { AdminContributionRequest, OrderSnapshot } from "../api/client";
import { parsePriceToCents, formatCents } from "../domain/money";
import { OrderImportPanel } from "./OrderImportPanel";

export type OrderManagementApi = {
  historyDetail: (orderDate: string) => Promise<OrderSnapshot>;
  adminSetOrderLocked: (orderDate: string, locked: boolean) => Promise<OrderSnapshot>;
  adminCorrectContribution: (input: AdminContributionRequest) => Promise<OrderSnapshot>;
  adminImportOrder: (orderDate: string, text: string) => Promise<OrderSnapshot>;
  adminUpsertOrderItem: (input: { orderDate: string; name: string; priceCents: number; quantity: number }) => Promise<OrderSnapshot>;
  adminDeleteOrderItem: (orderDate: string, menuItemId: string) => Promise<OrderSnapshot>;
  adminClearOrder: (orderDate: string) => Promise<OrderSnapshot>;
};

export function OrderManagementPanel({ orderDate, api, onChanged }: { orderDate: string; api: OrderManagementApi; onChanged?: () => void | Promise<void> }) {
  const [managedDate, setManagedDate] = useState(orderDate);
  const [order, setOrder] = useState<OrderSnapshot | null>(null);
  const [quantityDrafts, setQuantityDrafts] = useState<Record<string, string>>({});
  const [name, setName] = useState(""); const [price, setPrice] = useState(""); const [quantity, setQuantity] = useState("1");
  const [deleteId, setDeleteId] = useState<string | null>(null); const [clearPhrase, setClearPhrase] = useState("");
  const [busy, setBusy] = useState<string | null>(null); const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const keyFor = (menuItemId: string, deviceId: string) => `${menuItemId}:${deviceId}`;
  const updateOrder = (next: OrderSnapshot) => { setOrder(next); setQuantityDrafts(Object.fromEntries(next.dishes.flatMap((dish) => dish.contributors.map((contributor) => [keyFor(dish.menuItemId, contributor.deviceId), String(contributor.quantity)])))); };
  const notifyChanged = async () => { if (managedDate === orderDate) await onChanged?.(); };
  const mutate = async (key: string, action: () => Promise<OrderSnapshot>, message: string) => { setBusy(key); setFeedback(null); try { updateOrder(await action()); setFeedback({ kind: "success", message }); await notifyChanged(); return true; } catch (caught) { setFeedback({ kind: "error", message: caught instanceof Error ? caught.message : "订单操作失败" }); return false; } finally { setBusy(null); } };
  const locked = Boolean(order?.locked);

  async function load() { setBusy("load"); setFeedback(null); try { updateOrder(await api.historyDetail(managedDate)); } catch (caught) { setOrder(null); setFeedback({ kind: "error", message: caught instanceof Error ? caught.message : "订单加载失败" }); } finally { setBusy(null); } }
  async function addItem() { let priceCents: number; try { priceCents = parsePriceToCents(price); } catch { setFeedback({ kind: "error", message: "请输入有效价格" }); return; } const parsedQuantity = Number(quantity); if (!name.trim() || !Number.isInteger(parsedQuantity) || parsedQuantity < 1 || parsedQuantity > 999) { setFeedback({ kind: "error", message: "请填写菜品名称和 1 到 999 的数量" }); return; } const ok = await mutate("add", () => api.adminUpsertOrderItem({ orderDate: managedDate, name: name.trim(), priceCents, quantity: parsedQuantity }), "已添加已点菜品"); if (ok) { setName(""); setPrice(""); setQuantity("1"); } }
  async function correct(input: Omit<AdminContributionRequest, "quantity">) { const key = keyFor(input.menuItemId, input.deviceId); const next = Number(quantityDrafts[key]); if (!Number.isInteger(next) || next < 0 || next > 999) { setFeedback({ kind: "error", message: "贡献数量必须为 0 到 999 的整数" }); return; } await mutate(`contribution:${key}`, () => api.adminCorrectContribution({ ...input, quantity: next }), "贡献数量已保存"); }

  return <section className="admin-card" aria-labelledby="managed-order-title"><div className="admin-card-heading"><div><p>可管理今日或历史订单</p><h2 id="managed-order-title">已点订单管理</h2></div>{order && <span className={`admin-state ${locked ? "locked" : "open"}`}>{locked ? "已锁定" : "可编辑"}</span>}</div>
    <div className="managed-order-toolbar"><label htmlFor="managed-order-date">管理订单日期<input id="managed-order-date" type="date" value={managedDate} onChange={(event) => { setManagedDate(event.target.value); setOrder(null); setFeedback(null); }} /></label><button type="button" className="admin-secondary" disabled={!managedDate || busy === "load"} onClick={() => void load()}>加载所选订单</button></div>
    {order && <div className="managed-order-state">
      <button type="button" className="admin-secondary full-width" disabled={busy === "lock"} onClick={() => void mutate("lock", () => api.adminSetOrderLocked(managedDate, !locked), locked ? "订单已解锁" : "订单已锁定")}>{locked ? "解锁所选订单" : "锁定所选订单"}</button>
      <OrderImportPanel orderDate={managedDate} locked={locked} onImport={api.adminImportOrder} onImported={async (next) => { updateOrder(next); await notifyChanged(); }} />
      <div className="admin-subsection"><h3>添加单个已点菜品</h3><div className="inline-form order-add-form"><label>菜品名称<input aria-label="单项已点菜品名称" disabled={locked} value={name} onChange={(event) => setName(event.target.value)} /></label><label>价格<input aria-label="单项已点菜品价格" disabled={locked} value={price} inputMode="decimal" onChange={(event) => setPrice(event.target.value)} /></label><label>数量<input aria-label="单项已点菜品数量" disabled={locked} value={quantity} inputMode="numeric" onChange={(event) => setQuantity(event.target.value)} /></label><button type="button" className="admin-primary" disabled={locked || busy === "add"} onClick={() => void addItem()}>添加已点菜品</button></div></div>
      <div className="admin-subsection menu-item-list"><h3>当前已点菜品</h3>{order.dishes.length === 0 ? <p className="secondary-empty">该订单暂无已点菜品</p> : order.dishes.map((dish) => <div className="managed-item-row" key={dish.menuItemId}><span><strong>{dish.name}</strong><small>{formatCents(dish.priceCents)} · 共 {dish.quantity} 份</small></span>{deleteId === dish.menuItemId ? <span className="inline-confirm"><button type="button" className="admin-secondary" onClick={() => setDeleteId(null)}>取消</button><button type="button" className="danger-button" disabled={locked || busy === `delete:${dish.menuItemId}`} onClick={() => void mutate(`delete:${dish.menuItemId}`, () => api.adminDeleteOrderItem(managedDate, dish.menuItemId), "已删除菜品")}>确认删除{dish.name}</button></span> : <button type="button" className="danger-button" aria-label={`删除${dish.name}`} disabled={locked} onClick={() => setDeleteId(dish.menuItemId)}>删除</button>}</div>)}</div>
      <div className="admin-subsection contribution-list"><h3>修正个人贡献</h3>{order.dishes.flatMap((dish) => dish.contributors.map((contributor) => { const key = keyFor(dish.menuItemId, contributor.deviceId); return <div className="contribution-row" key={key}><div className="contribution-copy"><strong>{contributor.displayName}</strong><span>{dish.name}</span></div><label htmlFor={`contribution-${key}`}>数量<input id={`contribution-${key}`} type="number" min="0" max="999" aria-label={`${contributor.displayName}的${dish.name}数量`} disabled={locked} value={quantityDrafts[key] ?? String(contributor.quantity)} onChange={(event) => setQuantityDrafts((value) => ({ ...value, [key]: event.target.value }))} /></label><button type="button" className="admin-primary" aria-label={`保存${contributor.displayName}的${dish.name}数量`} disabled={locked || busy === `contribution:${key}`} onClick={() => void correct({ orderDate: managedDate, menuItemId: dish.menuItemId, deviceId: contributor.deviceId, displayName: contributor.displayName })}>保存</button></div>; }))}</div>
      <div className="admin-subsection danger-card"><h3>清空所选订单</h3><label>清空订单确认短语<input aria-label="清空订单确认短语" disabled={locked} value={clearPhrase} placeholder={`清空订单 ${managedDate}`} onChange={(event) => setClearPhrase(event.target.value)} /></label><button type="button" className="danger-button" disabled={locked || clearPhrase !== `清空订单 ${managedDate}` || busy === "clear"} onClick={() => void mutate("clear", () => api.adminClearOrder(managedDate), "订单已清空")}>确认清空所选订单</button></div>
    </div>}
    {feedback && <p className={`action-feedback ${feedback.kind}`} role={feedback.kind === "error" ? "alert" : "status"}>{feedback.message}</p>}
  </section>;
}
