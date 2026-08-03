import type { HistorySummary } from "../api/client";
import type { MealPeriod } from "../domain/meal-period";
import { MEAL_PERIOD_LABEL } from "../domain/meal-period";
import { formatCents } from "../domain/money";

type HistoryListPageProps = {
  dates: HistorySummary[];
  loading?: boolean;
  error?: string;
  onBack: () => void;
  onSelect: (date: string, mealPeriod: MealPeriod) => void;
};

export function formatOrderDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return `${year}年${month}月${day}日`;
}

export function HistoryListPage({ dates, loading = false, error, onBack, onSelect }: HistoryListPageProps) {
  const sortedDates = [...dates].sort((a, b) => (b.orderDate.localeCompare(a.orderDate) || (b.mealPeriod ?? "lunch").localeCompare(a.mealPeriod ?? "lunch")));

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
            <button key={`${entry.orderDate}-${entry.mealPeriod ?? "lunch"}`} type="button" className="history-card" aria-label={`查看 ${dateLabel}${MEAL_PERIOD_LABEL[entry.mealPeriod ?? "lunch"]}订单`} onClick={() => onSelect(entry.orderDate, entry.mealPeriod ?? "lunch")}>
              <span className="history-date">{dateLabel} · {MEAL_PERIOD_LABEL[entry.mealPeriod ?? "lunch"]}</span>
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
