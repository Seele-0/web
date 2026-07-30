import { useCallback, useState } from "react";
import { loadIdentity, saveDisplayName, type BrowserIdentity } from "../domain/identity";

export function useIdentity() {
  const [identity, setIdentity] = useState<BrowserIdentity>(() => loadIdentity());
  const saveName = useCallback((name: string) => {
    const next = saveDisplayName(name);
    setIdentity(next);
    return next;
  }, []);
  const editName = useCallback(() => setIdentity((current) => ({ ...current, displayName: null })), []);
  return { identity, saveName, editName };
}
