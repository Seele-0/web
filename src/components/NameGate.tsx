import { type FormEvent, useEffect, useRef, useState } from "react";
import { validateDisplayName } from "../domain/identity";

export function NameGate({ savedName, onSubmit }: { savedName?: string | null; onSubmit: (name: string) => void }) {
  const [name, setName] = useState(savedName ?? "");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);

  function submit(event: FormEvent) {
    event.preventDefault();
    try {
      onSubmit(validateDisplayName(name));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "姓名无效");
    }
  }

  return (
    <div className="name-gate-backdrop">
      <section className="name-gate" role="dialog" aria-modal="true" aria-labelledby="name-gate-title">
        <p className="name-gate-mark" aria-hidden="true">筷</p>
        <h2 id="name-gate-title">输入点餐姓名</h2>
        <p>大家会在订单总览中看到这个名字。</p>
        <form onSubmit={submit}>
          <label htmlFor="display-name">姓名</label>
          <input ref={inputRef} id="display-name" value={name} maxLength={30} onChange={(event) => { setName(event.target.value); setError(""); }} />
          {error && <p className="form-error" role="alert">{error}</p>}
          <button type="submit">开始点餐</button>
        </form>
      </section>
    </div>
  );
}
