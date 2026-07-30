import { useMemo, useState } from "react";
import type { OrderSnapshot } from "../api/client";
import { parseOrderImportText } from "../domain/import-text";
import { formatCents } from "../domain/money";

export function OrderImportPanel({ orderDate, locked, onImport, onImported }: {
  orderDate: string;
  locked: boolean;
  onImport: (orderDate: string, text: string) => Promise<OrderSnapshot>;
  onImported: (snapshot: OrderSnapshot) => void | Promise<void>;
}) {
  const [text, setText] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const parsed = useMemo(() => parseOrderImportText(text), [text]);
  const totalQuantity = parsed.items.reduce((sum, item) => sum + item.quantity, 0);
  const totalCents = parsed.items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
  const canImport = !locked && parsed.items.length > 0 && parsed.errors.length === 0;

  async function submit() {
    setBusy(true); setFeedback(null);
    try {
      const snapshot = await onImport(orderDate, text);
      setConfirming(false); setFeedback({ kind: "success", message: "已覆盖已点订单" });
      await onImported(snapshot);
    } catch (caught) {
      setFeedback({ kind: "error", message: caught instanceof Error ? caught.message : "订单覆盖失败" });
    } finally { setBusy(false); }
  }

  return <section className="admin-subsection order-import-panel" aria-labelledby="order-import-title">
    <div className="admin-card-heading"><div><p>覆盖后会以管理员导入作为已点数量</p><h3 id="order-import-title">批量覆盖已点订单</h3></div></div>
    <label htmlFor="order-import-text">批量已点订单文本</label>
    <textarea id="order-import-text" rows={6} disabled={locked} value={text} placeholder={"黄瓜火腿 -- 12 -- 3\n麻婆豆腐 -- 12 -- 2"} onChange={(event) => { setText(event.target.value); setConfirming(false); setFeedback(null); }} />
    {locked && <p className="locked-notice">请先解锁订单</p>}
    <div className="menu-preview" aria-live="polite"><h4>共 {totalQuantity} 份 · {formatCents(totalCents)}</h4>{parsed.errors.length > 0 && <ul className="parse-errors">{parsed.errors.map((error) => <li key={`${error.sourceLine}-${error.message}`}>第 {error.sourceLine} 行：{error.message}</li>)}</ul>}</div>
    {!confirming ? <button type="button" className="admin-primary" disabled={!canImport} onClick={() => setConfirming(true)}>准备覆盖已点订单</button> : <div className="confirmation-box" role="group" aria-label="确认覆盖已点订单"><p>现有已点订单将被替换。</p><div><button type="button" className="admin-secondary" onClick={() => setConfirming(false)}>取消</button><button type="button" className="admin-primary" disabled={busy} onClick={() => void submit()}>确认覆盖已点订单</button></div></div>}
    {feedback && <p className={`action-feedback ${feedback.kind}`} role={feedback.kind === "error" ? "alert" : "status"}>{feedback.message}</p>}
  </section>;
}
