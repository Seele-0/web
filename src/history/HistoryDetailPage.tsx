import type { OrderSnapshot } from "../api/client";
import { OrderOverviewPage } from "../overview/OrderOverviewPage";
import { formatOrderDate } from "./HistoryListPage";

export function HistoryDetailPage({ order, onBack }: { order: OrderSnapshot; onBack: () => void }) {
  return (
    <OrderOverviewPage
      order={order}
      date={formatOrderDate(order.orderDate)}
      title="历史订单"
      readOnly
      onBack={onBack}
    />
  );
}
