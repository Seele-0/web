import type { OrderSnapshot } from "../api/client";
import { formatCents } from "../domain/money";

type OrderOverviewPageProps = {
  order: OrderSnapshot;
  date: string;
  title?: string;
  readOnly?: boolean;
  onBack: () => void;
  onHistory?: () => void;
};

function groupedContributors(order: OrderSnapshot, menuItemId: string) {
  const quantities = new Map<string, number>();
  const contributors = order.dishes.find((dish) => dish.menuItemId === menuItemId)?.contributors ?? [];
  for (const contributor of contributors) {
    quantities.set(contributor.displayName, (quantities.get(contributor.displayName) ?? 0) + contributor.quantity);
  }
  return [...quantities].map(([displayName, quantity]) => ({ displayName, quantity }));
}

export function OrderOverviewPage({ order, date, title = "订单总览", readOnly = false, onBack, onHistory }: OrderOverviewPageProps) {
  const perPersonCents = order.totalCents === 0 ? 0 : Math.ceil(order.totalCents / Math.max(order.shareCount, 1));

  return (
    <div className="secondary-page overview-page">
      <header className="secondary-header">
        <button type="button" className="back-button" onClick={onBack} aria-label="返回菜单">‹</button>
        <div>
          <p>{date}</p>
          <h1>{title}</h1>
        </div>
        {readOnly ? <span className="read-only-badge">只读</span> : onHistory ? <button type="button" className="text-button" onClick={onHistory}>历史订单</button> : <span />}
      </header>

      {order.dishes.length === 0 ? (
        <p className="secondary-empty">这一天还没有点菜记录</p>
      ) : (
        <main className="overview-list">
          {order.dishes.map((dish) => (
            <article key={dish.menuItemId} className="overview-card" aria-label={dish.name}>
              <div className="overview-dish-heading">
                <h2>{dish.name}</h2>
                <strong>{dish.quantity} 份</strong>
              </div>
              <div className="overview-prices">
                <span>单价 {formatCents(dish.priceCents)}</span>
                <span>小计 {formatCents(dish.subtotalCents)}</span>
              </div>
              <div className="contributor-list" aria-label={`${dish.name}点菜人`}>
                {groupedContributors(order, dish.menuItemId).map((contributor) => (
                  <span key={contributor.displayName} className="contributor-chip">
                    {contributor.displayName}{contributor.quantity > 1 ? ` × ${contributor.quantity}` : ""}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </main>
      )}

      <footer className="overview-summary">
        <div><span>份数</span><strong>共 {order.totalQuantity} 份</strong></div>
        <div><span>订单金额</span><strong>总计 {formatCents(order.totalCents)}</strong></div>
        <div><span>均摊人数</span><strong>均摊 {order.shareCount} 人</strong></div>
        <div className="per-person-total"><span>每人</span><strong>{formatCents(perPersonCents)} / 人</strong></div>
      </footer>
    </div>
  );
}
