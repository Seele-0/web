import { type FormEvent, useEffect, useState } from "react";
import { apiClient, type AdminContributionRequest, type AdminMenuItemRequest, type AdminOrderItemRequest, type OrderSnapshot } from "../api/client";
import type { MenuItem } from "../domain/types";
import { MenuManagementPanel } from "./MenuManagementPanel";
import { OrderManagementPanel } from "./OrderManagementPanel";

export type AdminApi = {
  adminLogin: (password: string) => Promise<unknown>;
  adminLogout: () => Promise<unknown>;
  adminRenameRestaurant: (restaurantName: string) => Promise<unknown>;
  adminImportMenu: (text: string) => Promise<unknown>;
  adminUpsertMenuItem: (input: AdminMenuItemRequest) => Promise<unknown>;
  adminDeleteMenuItem: (menuItemId: string) => Promise<unknown>;
  adminClearMenu: () => Promise<unknown>;
  adminImportOrder: (orderDate: string, text: string) => Promise<OrderSnapshot>;
  adminUpsertOrderItem: (input: AdminOrderItemRequest) => Promise<OrderSnapshot>;
  adminDeleteOrderItem: (orderDate: string, menuItemId: string) => Promise<OrderSnapshot>;
  adminClearOrder: (orderDate: string) => Promise<OrderSnapshot>;
  adminSetOrderLocked: (orderDate: string, locked: boolean) => Promise<OrderSnapshot>;
  historyDetail: (orderDate: string) => Promise<OrderSnapshot>;
  adminCorrectContribution: (input: AdminContributionRequest) => Promise<OrderSnapshot>;
};

type Feedback = { kind: "success" | "error"; message: string } | null;

export function AdminPage({ orderDate, restaurantName, menu = [], onBack, onChanged, api = apiClient }: {
  orderDate: string;
  restaurantName: string;
  menu?: MenuItem[];
  locked?: boolean;
  onBack: () => void;
  onChanged?: () => void | Promise<void>;
  api?: AdminApi;
}) {
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [loginFeedback, setLoginFeedback] = useState<Feedback>(null);
  const [name, setName] = useState(restaurantName);
  const [nameFeedback, setNameFeedback] = useState<Feedback>(null);
  const [savingName, setSavingName] = useState(false);
  useEffect(() => setName(restaurantName), [restaurantName]);

  async function submitLogin(event: FormEvent) {
    event.preventDefault(); const submittedPassword = password; setPassword(""); setLoginFeedback(null);
    try { await api.adminLogin(submittedPassword); setAuthenticated(true); }
    catch (caught) { setLoginFeedback({ kind: "error", message: caught instanceof Error ? caught.message : "管理员登录失败" }); }
  }
  async function saveName(event: FormEvent) {
    event.preventDefault(); setSavingName(true); setNameFeedback(null);
    try { await api.adminRenameRestaurant(name.trim()); setNameFeedback({ kind: "success", message: "餐馆名称已保存" }); await onChanged?.(); }
    catch (caught) { setNameFeedback({ kind: "error", message: caught instanceof Error ? caught.message : "餐馆名称保存失败" }); }
    finally { setSavingName(false); }
  }

  if (!authenticated) return <div className="secondary-page admin-login-page"><button type="button" className="back-button" onClick={onBack} aria-label="返回菜单">‹</button><section className="admin-login-card"><p className="admin-kicker">受保护区域</p><h1>管理员登录</h1><p>密码只用于本次登录，不会保存在浏览器中。</p><form onSubmit={submitLogin} aria-label="管理员登录"><label htmlFor="admin-password">管理员密码</label><input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /><button type="submit" className="admin-primary" disabled={!password}>登录管理后台</button></form>{loginFeedback && <p className="action-feedback error" role="alert">{loginFeedback.message}</p>}</section></div>;

  return <div className="secondary-page admin-page"><header className="secondary-header"><button type="button" className="back-button" onClick={onBack} aria-label="返回菜单">‹</button><div><p>{orderDate}</p><h1>管理设置</h1></div><button type="button" className="text-button" onClick={() => void api.adminLogout().finally(() => setAuthenticated(false))}>退出</button></header><main className="admin-sections">
    <form className="admin-card" aria-label="修改餐馆名称" onSubmit={saveName}><div className="admin-card-heading"><div><p>显示在点餐首页顶部</p><h2>餐馆名称</h2></div></div><label htmlFor="restaurant-name">餐馆名称</label><div className="inline-form"><input id="restaurant-name" value={name} maxLength={80} onChange={(event) => { setName(event.target.value); setNameFeedback(null); }} /><button type="submit" className="admin-primary" disabled={!name.trim() || savingName}>保存餐馆名称</button></div>{nameFeedback && <p className={`action-feedback ${nameFeedback.kind}`} role={nameFeedback.kind === "error" ? "alert" : "status"}>{nameFeedback.message}</p>}</form>
    <MenuManagementPanel menu={menu} api={api} onChanged={onChanged} />
    <OrderManagementPanel orderDate={orderDate} api={api} onChanged={onChanged} />
  </main></div>;
}
