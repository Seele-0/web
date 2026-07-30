export function OfflineBanner({ visible }: { visible: boolean }) {
  return visible ? <div className="offline-banner" role="status">当前离线，操作会在网络恢复后自动同步</div> : null;
}
