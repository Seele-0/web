import { useState } from "react";
import type { MenuItem } from "../domain/types";
import { parsePriceToCents, formatCents } from "../domain/money";
import { MenuImportPanel } from "./MenuImportPanel";

export type MenuManagementApi = {
  adminImportMenu: (text: string) => Promise<unknown>;
  adminUpsertMenuItem: (input: { name: string; priceCents: number }) => Promise<unknown>;
  adminDeleteMenuItem: (menuItemId: string) => Promise<unknown>;
  adminClearMenu: () => Promise<unknown>;
};

export function MenuManagementPanel({ menu, api, onChanged }: {
  menu: MenuItem[];
  api: MenuManagementApi;
  onChanged?: () => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [clearPhrase, setClearPhrase] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  async function changed(message: string, action: () => Promise<unknown>): Promise<boolean> {
    setBusy(message); setFeedback(null);
    try { await action(); setFeedback({ kind: "success", message }); await onChanged?.(); return true; }
    catch (caught) { setFeedback({ kind: "error", message: caught instanceof Error ? caught.message : "菜单操作失败" }); return false; }
    finally { setBusy(null); }
  }

  async function addItem() {
    let priceCents: number;
    try { priceCents = parsePriceToCents(price); }
    catch { setFeedback({ kind: "error", message: "请输入有效价格" }); return; }
    const trimmed = name.trim();
    if (!trimmed) { setFeedback({ kind: "error", message: "请输入菜品名称" }); return; }
    const added = await changed("菜品已添加", async () => api.adminUpsertMenuItem({ name: trimmed, priceCents }));
    if (added) { setName(""); setPrice(""); }
  }

  return <section className="admin-card" aria-labelledby="menu-management-title">
    <div className="admin-card-heading"><div><p>支持整份覆盖或逐道维护</p><h2 id="menu-management-title">菜单管理</h2></div></div>
    <MenuImportPanel onImport={api.adminImportMenu} onImported={onChanged} />
    <div className="admin-subsection">
      <h3>添加单个菜品</h3>
      <div className="inline-form menu-add-form">
        <label>菜品名称<input aria-label="单项菜品名称" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} /></label>
        <label>价格<input aria-label="单项菜品价格" value={price} inputMode="decimal" placeholder="12" onChange={(event) => setPrice(event.target.value)} /></label>
        <button type="button" className="admin-primary" disabled={busy === "菜品已添加"} onClick={() => void addItem()}>添加菜品</button>
      </div>
    </div>
    <div className="admin-subsection menu-item-list"><h3>当前菜单</h3>
      {menu.length === 0 ? <p className="secondary-empty">当前没有可用菜品</p> : menu.map((item) => <div className="managed-item-row" key={item.id}><span><strong>{item.name}</strong><small>{formatCents(item.priceCents)}</small></span>{deleteId === item.id ? <span className="inline-confirm"><button type="button" className="admin-secondary" onClick={() => setDeleteId(null)}>取消</button><button type="button" className="danger-button" disabled={busy === `delete:${item.id}`} onClick={() => void changed("菜品已删除", async () => api.adminDeleteMenuItem(item.id))}>确认删除{item.name}</button></span> : <button type="button" className="danger-button" aria-label={`删除${item.name}`} onClick={() => setDeleteId(item.id)}>删除</button>}</div>)}
    </div>
    <div className="admin-subsection danger-card clear-menu-panel"><h3>清空全部菜单</h3><label>清空菜单确认短语<input aria-label="清空菜单确认短语" value={clearPhrase} placeholder="清空全部菜单" onChange={(event) => setClearPhrase(event.target.value)} /></label><button type="button" className="danger-button" disabled={clearPhrase !== "清空全部菜单" || busy === "菜单已清空"} onClick={() => void changed("菜单已清空", async () => api.adminClearMenu())}>确认清空全部菜单</button></div>
    {feedback && <p className={`action-feedback ${feedback.kind}`} role={feedback.kind === "error" ? "alert" : "status"}>{feedback.message}</p>}
  </section>;
}
