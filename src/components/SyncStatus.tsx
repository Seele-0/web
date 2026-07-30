export type SyncState = "syncing" | "synced" | "offline" | "failed";
const labels: Record<SyncState, string> = { syncing: "同步中", synced: "已同步", offline: "离线", failed: "同步失败" };
export function SyncStatus({ status }: { status: SyncState }) { return <span className={`sync-status sync-${status}`} role="status">{labels[status]}</span>; }
