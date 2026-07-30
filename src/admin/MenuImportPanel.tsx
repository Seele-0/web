import { useMemo, useState } from "react";
import { parseMenuImportText } from "../domain/import-text";
import { formatCents } from "../domain/money";

export function MenuImportPanel({ onImport, onImported }: {
  onImport: (text: string) => Promise<unknown>;
  onImported?: () => void | Promise<void>;
}) {
  const [text, setText] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const parsed = useMemo(() => parseMenuImportText(text), [text]);
  const canImport = parsed.items.length > 0 && parsed.errors.length === 0;

  async function confirmImport() {
    setSubmitting(true);
    setFeedback(null);
    try {
      await onImport(text);
      setConfirming(false);
      setFeedback({ kind: "success", message: `已覆盖 ${parsed.items.length} 道菜` });
      await onImported?.();
    } catch (caught) {
      setFeedback({ kind: "error", message: caught instanceof Error ? caught.message : "菜单覆盖失败" });
    } finally {
      setSubmitting(false);
    }
  }

  return <section className="menu-import-panel" aria-labelledby="menu-import-title">
    <div className="admin-card-heading"><div><p>按行控制顺序，覆盖后未列出的旧菜会停用</p><h3 id="menu-import-title">批量覆盖菜单</h3></div></div>
    <label htmlFor="menu-import-text">批量菜单文本</label>
    <textarea id="menu-import-text" rows={7} value={text} placeholder={"黄瓜火腿 -- 12\n麻婆豆腐 -- 12"} onChange={(event) => {
      setText(event.target.value); setConfirming(false); setFeedback(null);
    }} />
    <div className="menu-preview" aria-live="polite">
      <h4>预览 {parsed.items.length} 道菜</h4>
      {parsed.items.length > 0 && <ol>{parsed.items.map((item) => <li key={`${item.sourceLine}-${item.name}`}><span>{item.name}</span><strong>{formatCents(item.priceCents)}</strong></li>)}</ol>}
      {parsed.errors.length > 0 && <ul className="parse-errors">{parsed.errors.map((error) => <li key={`${error.sourceLine}-${error.message}`}>第 {error.sourceLine} 行：{error.message}</li>)}</ul>}
    </div>
    {!confirming ? <button type="button" className="admin-primary" disabled={!canImport} onClick={() => setConfirming(true)}>准备覆盖菜单</button> : (
      <div className="confirmation-box" role="group" aria-label="确认覆盖菜单"><p>覆盖后将停用未出现在文本中的菜品。</p><div>
        <button type="button" className="admin-secondary" onClick={() => setConfirming(false)}>取消</button>
        <button type="button" className="admin-primary" disabled={submitting} onClick={() => void confirmImport()}>{submitting ? "正在覆盖…" : `确认覆盖 ${parsed.items.length} 道菜`}</button>
      </div></div>
    )}
    {feedback && <p className={`action-feedback ${feedback.kind}`} role={feedback.kind === "error" ? "alert" : "status"}>{feedback.message}</p>}
  </section>;
}
