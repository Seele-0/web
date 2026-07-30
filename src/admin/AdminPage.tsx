import { type FormEvent, useEffect, useState } from "react";
import { apiClient } from "../api/client";
import { MenuImportPanel } from "./MenuImportPanel";

export type AdminApi = {
  adminLogin: (password: string) => Promise<unknown>;
  adminLogout: () => Promise<unknown>;
  adminRenameRestaurant: (restaurantName: string) => Promise<unknown>;
  adminImportMenu: (markdown: string) => Promise<unknown>;
  adminClearOrder: (orderDate: string) => Promise<unknown>;
  adminSetOrderLocked: (orderDate: string, locked: boolean) => Promise<{ locked?: boolean }>;
};

type Feedback = { kind: "success" | "error"; message: string } | null;

export function AdminPage({ orderDate, restaurantName, locked, onBack, onChanged, api = apiClient }: {
  orderDate: string;
  restaurantName: string;
  locked: boolean;
  onBack: () => void;
  onChanged?: () => void | Promise<void>;
  api?: AdminApi;
}) {
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [loginFeedback, setLoginFeedback] = useState<Feedback>(null);
  const [name, setName] = useState(restaurantName);
  const [nameFeedback, setNameFeedback] = useState<Feedback>(null);
  const [clearPhrase, setClearPhrase] = useState("");
  const [clearFeedback, setClearFeedback] = useState<Feedback>(null);
  const [isLocked, setIsLocked] = useState(locked);
  const [lockFeedback, setLockFeedback] = useState<Feedback>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const requiredClearPhrase = `清空 ${orderDate}`;

  useEffect(() => setName(restaurantName), [restaurantName]);
  useEffect(() => setIsLocked(locked), [locked]);

  async function submitLogin(event: FormEvent) {
    event.preventDefault();
    const submittedPassword = password;
    setPassword("");
    setLoginFeedback(null);
    try {
      await api.adminLogin(submittedPassword);
      setAuthenticated(true);
    } catch (caught) {
      setLoginFeedback({ kind: "error", message: caught instanceof Error ? caught.message : "管理员登录失败" });
    }
  }

  async function saveName(event: FormEvent) {
    event.preventDefault();
    setBusyAction("name");
    setNameFeedback(null);
    try {
      await api.adminRenameRestaurant(name.trim());
      setNameFeedback({ kind: "success", message: "餐馆名称已保存" });
      await onChanged?.();
    } catch (caught) {
      setNameFeedback({ kind: "error", message: caught instanceof Error ? caught.message : "餐馆名称保存失败" });
    } finally {
      setBusyAction(null);
    }
  }

  async function clearOrder() {
    setBusyAction("clear");
    setClearFeedback(null);
    try {
      await api.adminClearOrder(orderDate);
      setClearPhrase("");
      setClearFeedback({ kind: "success", message: `${orderDate} 订单已清空，审计记录已保留` });
      await onChanged?.();
    } catch (caught) {
      setClearFeedback({ kind: "error", message: caught instanceof Error ? caught.message : "订单清空失败" });
    } finally {
      setBusyAction(null);
    }
  }

  async function toggleLock() {
    const nextLocked = !isLocked;
    setBusyAction("lock");
    setLockFeedback(null);
    try {
      const result = await api.adminSetOrderLocked(orderDate, nextLocked);
      setIsLocked(result.locked ?? nextLocked);
      setLockFeedback({ kind: "success", message: nextLocked ? "今日订单已锁定" : "今日订单已解锁" });
      await onChanged?.();
    } catch (caught) {
      setLockFeedback({ kind: "error", message: caught instanceof Error ? caught.message : "订单状态更新失败" });
    } finally {
      setBusyAction(null);
    }
  }

  if (!authenticated) {
    return (
      <div className="secondary-page admin-login-page">
        <button type="button" className="back-button" onClick={onBack} aria-label="返回菜单">‹</button>
        <section className="admin-login-card">
          <p className="admin-kicker">受保护区域</p>
          <h1>管理员登录</h1>
          <p>密码只用于本次登录，不会保存在浏览器中。</p>
          <form onSubmit={submitLogin} aria-label="管理员登录">
            <label htmlFor="admin-password">管理员密码</label>
            <input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
            <button type="submit" className="admin-primary" disabled={!password}>登录管理后台</button>
          </form>
          {loginFeedback && <p className="action-feedback error" role="alert">{loginFeedback.message}</p>}
        </section>
      </div>
    );
  }

  return (
    <div className="secondary-page admin-page">
      <header className="secondary-header">
        <button type="button" className="back-button" onClick={onBack} aria-label="返回菜单">‹</button>
        <div><p>{orderDate}</p><h1>管理设置</h1></div>
        <button type="button" className="text-button" onClick={() => void api.adminLogout().finally(() => setAuthenticated(false))}>退出</button>
      </header>

      <main className="admin-sections">
        <form className="admin-card" aria-label="修改餐馆名称" onSubmit={saveName}>
          <div className="admin-card-heading"><div><p>显示在点餐首页顶部</p><h2>餐馆名称</h2></div></div>
          <label htmlFor="restaurant-name">餐馆名称</label>
          <div className="inline-form">
            <input id="restaurant-name" value={name} maxLength={80} onChange={(event) => { setName(event.target.value); setNameFeedback(null); }} />
            <button type="submit" className="admin-primary" disabled={!name.trim() || busyAction === "name"}>保存餐馆名称</button>
          </div>
          {nameFeedback && <p className={`action-feedback ${nameFeedback.kind}`} role={nameFeedback.kind === "error" ? "alert" : "status"}>{nameFeedback.message}</p>}
        </form>

        <MenuImportPanel onImport={api.adminImportMenu} onImported={onChanged} />

        <section className="admin-card" aria-labelledby="order-control-title">
          <div className="admin-card-heading"><div><p>管理 {orderDate} 的可编辑状态</p><h2 id="order-control-title">订单锁定</h2></div><span className={`admin-state ${isLocked ? "locked" : "open"}`}>{isLocked ? "已锁定" : "可编辑"}</span></div>
          <button type="button" className="admin-secondary full-width" disabled={busyAction === "lock"} onClick={() => void toggleLock()}>{isLocked ? "解锁今日订单" : "锁定今日订单"}</button>
          {lockFeedback && <p className={`action-feedback ${lockFeedback.kind}`} role={lockFeedback.kind === "error" ? "alert" : "status"}>{lockFeedback.message}</p>}
        </section>

        <section className="admin-card danger-card" aria-labelledby="clear-order-title">
          <div className="admin-card-heading"><div><p>贡献记录会清零，但操作审计会保留</p><h2 id="clear-order-title">清空今日订单</h2></div></div>
          <label htmlFor="clear-confirmation">输入确认短语</label>
          <input id="clear-confirmation" value={clearPhrase} placeholder={requiredClearPhrase} onChange={(event) => { setClearPhrase(event.target.value); setClearFeedback(null); }} />
          <button type="button" className="danger-button" disabled={clearPhrase !== requiredClearPhrase || busyAction === "clear"} onClick={() => void clearOrder()}>确认清空今日订单</button>
          {clearFeedback && <p className={`action-feedback ${clearFeedback.kind}`} role={clearFeedback.kind === "error" ? "alert" : "status"}>{clearFeedback.message}</p>}
        </section>
      </main>
    </div>
  );
}
