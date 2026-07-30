import { useMemo, useState } from "react";
import { parseMenuMarkdown } from "../domain/menu-markdown";
import { formatCents } from "../domain/money";

export function MenuImportPanel({ onImport, onImported }: {
  onImport: (markdown: string) => Promise<unknown>;
  onImported?: () => void | Promise<void>;
}) {
  const [markdown, setMarkdown] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const parsed = useMemo(() => parseMenuMarkdown(markdown), [markdown]);
  const canImport = parsed.items.length > 0 && parsed.errors.length === 0;

  async function confirmImport() {
    setSubmitting(true);
    setFeedback(null);
    try {
      await onImport(markdown);
      setConfirming(false);
      setFeedback({ kind: "success", message: `已导入 ${parsed.items.length} 道菜` });
      await onImported?.();
    } catch (caught) {
      setFeedback({ kind: "error", message: caught instanceof Error ? caught.message : "菜单导入失败" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="admin-card menu-import-panel" aria-labelledby="menu-import-title">
      <div className="admin-card-heading">
        <div>
          <p>按行控制顺序，未出现的旧菜品会停用</p>
          <h2 id="menu-import-title">菜单导入</h2>
        </div>
      </div>
      <label htmlFor="menu-markdown">Markdown 菜单</label>
      <textarea
        id="menu-markdown"
        rows={9}
        value={markdown}
        placeholder={'- 酸菜鱼 | 68\n- 米饭 | 2'}
        onChange={(event) => {
          setMarkdown(event.target.value);
          setConfirming(false);
          setFeedback(null);
        }}
      />

      <div className="menu-preview" aria-live="polite">
        <h3>预览 {parsed.items.length} 道菜</h3>
        {parsed.items.length > 0 && (
          <ol>
            {parsed.items.map((item) => <li key={`${item.sourceLine}-${item.name}`}><span>{item.name}</span><strong>{formatCents(item.priceCents)}</strong></li>)}
          </ol>
        )}
        {parsed.errors.length > 0 && (
          <ul className="parse-errors">
            {parsed.errors.map((error) => <li key={`${error.sourceLine}-${error.message}`}>第 {error.sourceLine} 行：{error.message}</li>)}
          </ul>
        )}
      </div>

      {!confirming ? (
        <button type="button" className="admin-primary" disabled={!canImport} onClick={() => setConfirming(true)}>准备导入菜单</button>
      ) : (
        <div className="confirmation-box" role="group" aria-label="确认导入菜单">
          <p>导入后将按预览顺序更新菜单，并停用未列出的菜品。</p>
          <div>
            <button type="button" className="admin-secondary" onClick={() => setConfirming(false)}>取消</button>
            <button type="button" className="admin-primary" disabled={submitting} onClick={() => void confirmImport()}>{submitting ? "正在导入…" : `确认导入 ${parsed.items.length} 道菜`}</button>
          </div>
        </div>
      )}
      {feedback && <p className={`action-feedback ${feedback.kind}`} role={feedback.kind === "error" ? "alert" : "status"}>{feedback.message}</p>}
    </section>
  );
}
