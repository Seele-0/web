import { useState } from "react";
import type { AdminContributionRequest, OrderSnapshot } from "../api/client";
import type { MenuItem } from "../domain/types";
import { parsePriceToCents, formatCents } from "../domain/money";
import { OrderImportPanel } from "./OrderImportPanel";
import { MEAL_PERIOD_LABEL, type MealPeriod } from "../domain/meal-period";

export type OrderManagementApi = {
  historyDetail: (orderDate: string, mealPeriod?: MealPeriod) => Promise<OrderSnapshot>;
  adminSetOrderLocked: (orderDate: string, locked: boolean, mealPeriod?: MealPeriod) => Promise<OrderSnapshot>;
  adminSetOrderShareCount: (orderDate: string, shareCount: number, mealPeriod?: MealPeriod) => Promise<OrderSnapshot>;
  adminCorrectContribution: (input: AdminContributionRequest) => Promise<OrderSnapshot>;
  adminImportOrder: (orderDate: string, text: string, mealPeriod?: MealPeriod) => Promise<OrderSnapshot>;
  adminUpsertOrderItem: (input: { orderDate: string; mealPeriod?: MealPeriod; name: string; priceCents: number; quantity: number }) => Promise<OrderSnapshot>;
  adminDeleteOrderItem: (orderDate: string, menuItemId: string, mealPeriod?: MealPeriod) => Promise<OrderSnapshot>;
  adminClearOrder: (orderDate: string, mealPeriod?: MealPeriod) => Promise<OrderSnapshot>;
};

type OrderTab = "settings" | "items" | "import" | "contributions" | "clear";

function priceForInput(priceCents: number): string {
  return (priceCents / 100).toFixed(2).replace(/\.?0+$/, "");
}

export function OrderManagementPanel({ orderDate, menu, api, onChanged }: {
  orderDate: string;
  menu: MenuItem[];
  api: OrderManagementApi;
  onChanged?: () => void | Promise<void>;
}) {
  const [activeTab, setActiveTab] = useState<OrderTab>("settings");
  const [managedDate, setManagedDate] = useState(orderDate);
  const [managedMealPeriod, setManagedMealPeriod] = useState<MealPeriod>("lunch");
  const [order, setOrder] = useState<OrderSnapshot | null>(null);
  const [quantityDrafts, setQuantityDrafts] = useState<Record<string, string>>({});
  const [shareCountDraft, setShareCountDraft] = useState("");
  const [selectedMenuItemId, setSelectedMenuItemId] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [clearPhrase, setClearPhrase] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const keyFor = (menuItemId: string, deviceId: string) => `${menuItemId}:${deviceId}`;
  const updateOrder = (next: OrderSnapshot) => {
    setOrder(next);
    setShareCountDraft(String(next.shareCount));
    setQuantityDrafts(Object.fromEntries(next.dishes.flatMap((dish) => dish.contributors.map((contributor) => [keyFor(dish.menuItemId, contributor.deviceId), String(contributor.quantity)]))));
  };
  const notifyChanged = async () => { if (managedDate === orderDate) await onChanged?.(); };
  const mutate = async (key: string, action: () => Promise<OrderSnapshot>, message: string) => {
    setBusy(key);
    setFeedback(null);
    try {
      updateOrder(await action());
      setFeedback({ kind: "success", message });
      await notifyChanged();
      return true;
    } catch (caught) {
      setFeedback({ kind: "error", message: caught instanceof Error ? caught.message : "订单操作失败" });
      return false;
    } finally {
      setBusy(null);
    }
  };
  const locked = Boolean(order?.locked);

  async function load() {
    setBusy("load");
    setFeedback(null);
    try {
      updateOrder(await api.historyDetail(managedDate, managedMealPeriod));
      setActiveTab("settings");
    } catch (caught) {
      setOrder(null);
      setFeedback({ kind: "error", message: caught instanceof Error ? caught.message : "订单加载失败" });
    } finally {
      setBusy(null);
    }
  }

  function selectMenuItem(menuItemId: string) {
    setSelectedMenuItemId(menuItemId);
    const selected = menu.find((item) => item.id === menuItemId);
    if (!selected) return;
    setName(selected.name);
    setPrice(priceForInput(selected.priceCents));
    setFeedback(null);
  }

  async function addItem() {
    let priceCents: number;
    try {
      priceCents = parsePriceToCents(price);
    } catch {
      setFeedback({ kind: "error", message: "请输入有效价格" });
      return;
    }
    const parsedQuantity = Number(quantity);
    if (!name.trim() || !Number.isInteger(parsedQuantity) || parsedQuantity < 1 || parsedQuantity > 999) {
      setFeedback({ kind: "error", message: "请填写菜品名称和 1 到 999 的数量" });
      return;
    }
    const ok = await mutate("add", () => api.adminUpsertOrderItem({ orderDate: managedDate, mealPeriod: managedMealPeriod, name: name.trim(), priceCents, quantity: parsedQuantity }), "已添加已点菜品");
    if (ok) {
      setSelectedMenuItemId("");
      setName("");
      setPrice("");
      setQuantity("1");
    }
  }

  async function saveShareCount() {
    const shareCount = Number(shareCountDraft);
    if (!Number.isInteger(shareCount) || shareCount < 1 || shareCount > 100) {
      setFeedback({ kind: "error", message: "均摊人数必须为 1 到 100 的整数" });
      return;
    }
    await mutate("share-count", () => api.adminSetOrderShareCount(managedDate, shareCount, managedMealPeriod), "均摊人数已保存");
  }

  async function correct(input: Omit<AdminContributionRequest, "quantity">) {
    const key = keyFor(input.menuItemId, input.deviceId);
    const next = Number(quantityDrafts[key]);
    if (!Number.isInteger(next) || next < 0 || next > 999) {
      setFeedback({ kind: "error", message: "贡献数量必须为 0 到 999 的整数" });
      return;
    }
    await mutate(`contribution:${key}`, () => api.adminCorrectContribution({ ...input, quantity: next }), "贡献数量已保存");
  }

  return <section className="admin-card" aria-labelledby="managed-order-title">
    <div className="admin-card-heading"><div><p>可管理今日或历史订单</p><h2 id="managed-order-title">已点订单管理</h2></div>{order && <span className={`admin-state ${locked ? "locked" : "open"}`}>{locked ? "已锁定" : "可编辑"}</span>}</div>
    <div className="managed-order-toolbar"><label htmlFor="managed-order-date">管理订单日期<input id="managed-order-date" type="date" value={managedDate} onChange={(event) => { setManagedDate(event.target.value); setOrder(null); setFeedback(null); }} /></label><label htmlFor="managed-order-period">点餐时段<select id="managed-order-period" aria-label="管理点餐时段" value={managedMealPeriod} onChange={(event) => { setManagedMealPeriod(event.target.value as MealPeriod); setOrder(null); setFeedback(null); }}><option value="lunch">{MEAL_PERIOD_LABEL.lunch}（15:00 锁单）</option><option value="dinner">{MEAL_PERIOD_LABEL.dinner}（21:00 锁单）</option></select></label><button type="button" className="admin-secondary" disabled={!managedDate || busy === "load"} onClick={() => void load()}>加载所选订单</button></div>
    {order && <>
      <div className="admin-panel-tabs order-panel-tabs" role="tablist" aria-label="订单管理功能">
        <button id="order-tab-settings" type="button" role="tab" aria-selected={activeTab === "settings"} aria-controls="order-panel-settings" className="admin-tab" onClick={() => setActiveTab("settings")}>订单设置</button>
        <button id="order-tab-items" type="button" role="tab" aria-selected={activeTab === "items"} aria-controls="order-panel-items" className="admin-tab" onClick={() => setActiveTab("items")}>菜品维护</button>
        <button id="order-tab-import" type="button" role="tab" aria-selected={activeTab === "import"} aria-controls="order-panel-import" className="admin-tab" onClick={() => setActiveTab("import")}>批量导入</button>
        <button id="order-tab-contributions" type="button" role="tab" aria-selected={activeTab === "contributions"} aria-controls="order-panel-contributions" className="admin-tab" onClick={() => setActiveTab("contributions")}>贡献修正</button>
        <button id="order-tab-clear" type="button" role="tab" aria-selected={activeTab === "clear"} aria-controls="order-panel-clear" className="admin-tab" onClick={() => setActiveTab("clear")}>清空订单</button>
      </div>

      {activeTab === "settings" && <div id="order-panel-settings" role="tabpanel" aria-labelledby="order-tab-settings" className="admin-tab-panel managed-order-state">
        <div className="order-summary"><span>共 {order.totalQuantity} 份</span><strong>{formatCents(order.totalCents)}</strong></div>
        <div className="order-share-form"><label htmlFor="order-share-count">均摊人数<input id="order-share-count" type="number" min="1" max="100" inputMode="numeric" disabled={locked} value={shareCountDraft} onChange={(event) => setShareCountDraft(event.target.value)} /></label><button type="button" className="admin-primary" disabled={locked || busy === "share-count"} onClick={() => void saveShareCount()}>保存人数</button></div>
        {locked && <p className="locked-notice">已锁定订单不可修改。解锁后可编辑人数和菜品。</p>}
        <button type="button" className="admin-secondary full-width" disabled={busy === "lock"} onClick={() => void mutate("lock", () => api.adminSetOrderLocked(managedDate, !locked, managedMealPeriod), locked ? "订单已解锁" : "订单已锁定")}>{locked ? "解锁所选订单" : "锁定所选订单"}</button>
      </div>}

      {activeTab === "items" && <div id="order-panel-items" role="tabpanel" aria-labelledby="order-tab-items" className="admin-tab-panel">
        <div className="admin-subsection admin-subsection-first"><h3>新增已点菜品</h3><p className="admin-section-copy">优先从当前菜单选择，选择后会自动填入名称和价格；也可切换为自定义菜品。</p><div className="inline-form order-add-form"><label className="menu-picker">从当前菜单选择菜品<select aria-label="从当前菜单选择菜品" disabled={locked} value={selectedMenuItemId} onChange={(event) => selectMenuItem(event.target.value)}><option value="">自定义菜品</option>{menu.map((item) => <option key={item.id} value={item.id}>{item.name} · {formatCents(item.priceCents)}</option>)}</select></label><label>菜品名称<input aria-label="单项已点菜品名称" disabled={locked} value={name} maxLength={80} onChange={(event) => { setName(event.target.value); setSelectedMenuItemId(""); }} /></label><label>价格<input aria-label="单项已点菜品价格" disabled={locked} value={price} inputMode="decimal" placeholder="12" onChange={(event) => { setPrice(event.target.value); setSelectedMenuItemId(""); }} /></label><label>数量<input aria-label="单项已点菜品数量" disabled={locked} type="number" min="1" max="999" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label><button type="button" className="admin-primary" disabled={locked || busy === "add"} onClick={() => void addItem()}>添加已点菜品</button></div></div>
        <div className="admin-subsection menu-item-list"><h3>当前已点菜品（{order.dishes.length}）</h3>{order.dishes.length === 0 ? <p className="secondary-empty">该订单暂无已点菜品</p> : order.dishes.map((dish) => <div className="managed-item-row" key={dish.menuItemId}><span><strong>{dish.name}</strong><small>{formatCents(dish.priceCents)} · 共 {dish.quantity} 份</small></span>{deleteId === dish.menuItemId ? <span className="inline-confirm"><button type="button" className="admin-secondary" onClick={() => setDeleteId(null)}>取消</button><button type="button" className="danger-button" disabled={locked || busy === `delete:${dish.menuItemId}`} onClick={() => void mutate(`delete:${dish.menuItemId}`, () => api.adminDeleteOrderItem(managedDate, dish.menuItemId, managedMealPeriod), "已删除菜品")}>确认删除{dish.name}</button></span> : <button type="button" className="danger-button" aria-label={`删除${dish.name}`} disabled={locked} onClick={() => setDeleteId(dish.menuItemId)}>删除</button>}</div>)}</div>
      </div>}

      {activeTab === "import" && <div id="order-panel-import" role="tabpanel" aria-labelledby="order-tab-import" className="admin-tab-panel"><OrderImportPanel orderDate={managedDate} locked={locked} onImport={(date, text) => api.adminImportOrder(date, text, managedMealPeriod)} onImported={async (snapshot) => { updateOrder(snapshot); await notifyChanged(); }} /></div>}
      {activeTab === "contributions" && <div id="order-panel-contributions" role="tabpanel" aria-labelledby="order-tab-contributions" className="admin-tab-panel"><div className="admin-subsection admin-subsection-first contribution-list"><h3>修正个人贡献</h3>{order.dishes.flatMap((dish) => dish.contributors.map((contributor) => { const key = keyFor(dish.menuItemId, contributor.deviceId); return <div className="contribution-row" key={key}><div className="contribution-copy"><strong>{contributor.displayName}</strong><span>{dish.name}</span></div><label htmlFor={`contribution-${key}`}>数量<input id={`contribution-${key}`} type="number" min="0" max="999" aria-label={`${contributor.displayName}的${dish.name}数量`} disabled={locked} value={quantityDrafts[key] ?? String(contributor.quantity)} onChange={(event) => setQuantityDrafts((value) => ({ ...value, [key]: event.target.value }))} /></label><button type="button" className="admin-primary" aria-label={`保存${contributor.displayName}的${dish.name}数量`} disabled={locked || busy === `contribution:${key}`} onClick={() => void correct({ orderDate: managedDate, mealPeriod: managedMealPeriod, menuItemId: dish.menuItemId, deviceId: contributor.deviceId, displayName: contributor.displayName })}>保存</button></div>; }))}</div></div>}
      {activeTab === "clear" && <div id="order-panel-clear" role="tabpanel" aria-labelledby="order-tab-clear" className="admin-tab-panel"><div className="admin-subsection admin-subsection-first danger-card"><h3>清空所选订单</h3><p>清空后可重新导入或逐项添加菜品。</p><label>清空订单确认短语<input aria-label="清空订单确认短语" disabled={locked} value={clearPhrase} placeholder={`清空订单 ${managedDate}`} onChange={(event) => setClearPhrase(event.target.value)} /></label><button type="button" className="danger-button" disabled={locked || clearPhrase !== `清空订单 ${managedDate}` || busy === "clear"} onClick={() => void mutate("clear", () => api.adminClearOrder(managedDate, managedMealPeriod), "订单已清空")}>确认清空所选订单</button></div></div>}
    </>}
    {feedback && <p className={`action-feedback ${feedback.kind}`} role={feedback.kind === "error" ? "alert" : "status"}>{feedback.message}</p>}
  </section>;
}
