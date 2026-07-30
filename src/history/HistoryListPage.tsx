import type { HistorySummary } from "../api/client";
import { formatCents } from "../domain/money";

type HistoryListPageProps = {
  dates: HistorySummary[];
  loading?: boolean;
  error?: string;
  onBack: () => void;
  onSelect: (date: string) => void;
};

export function formatOrderDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return `${year}年${month}月${day}日`;
}

export function HistoryListPage({ dates, loading = false, error, onBack, onSelect }: HistoryListPageProps) {
  const sortedDates = [...dates].sort((a, b) => b.orderDate.localeCompare(a.orderDate));

  return (
    <div className="secondary-page history-page">
      <header className="secondary-header">
        <button type="button" className="back-button" onClick={onBack} aria-label="返回菜单">‹</button>
        <div>
          <p>过去的每一餐</p>
          <h1>历史订单</h1>
        </div>
        <span />
      </header>

      <main className="history-list">
        {loading && <p className="secondary-empty" role="status">正在加载历史订单…</p>}
        {error && <p className="secondary-error" role="alert">{error}</p>}
        {!loading && !error && sortedDates.length === 0 && <p className="secondary-empty">还没有历史订单</p>}
        {sortedDates.map((entry) => {
          const dateLabel = formatOrderDate(entry.orderDate);
          return (
            <button key={entry.orderDate} type="button" className="history-card" aria-label={`查看 ${dateLabel}订单`} onClick={() => onSelect(entry.orderDate)}>
              <span className="history-date">{dateLabel}</span>
              <span className="history-meta">{entry.totalQuantity} 份 · 均摊 {entry.shareCount} 人</span>
              <strong>{formatCents(entry.totalCents)}</strong>
              <span className="history-chevron" aria-hidden="true">›</span>
            </button>
          );
        })}
      </main>
    </div>
  );
}
