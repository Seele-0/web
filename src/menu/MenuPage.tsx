import { useMemo, useState } from "react";
import type { OrderSnapshot } from "../api/client";
import { BottomSummary } from "../components/BottomSummary";
import { DishCard } from "../components/DishCard";
import { SyncStatus, type SyncState } from "../components/SyncStatus";
import type { MenuItem } from "../domain/types";
import { MEAL_PERIOD_LABEL, MEAL_PERIOD_LOCK_TIME, type MealPeriod } from "../domain/meal-period";

type MenuPageProps = {
  restaurantName: string;
  date: string;
  mealPeriod?: MealPeriod;
  onMealPeriodChange?: (mealPeriod: MealPeriod) => void;
  displayName: string;
  deviceId: string;
  status: SyncState;
  menu: MenuItem[];
  order: OrderSnapshot | null;
  onAdjust: (menuItemId: string, delta: 1 | -1) => void | Promise<void>;
  onShareCount: (shareCount: number) => void | Promise<void>;
  onOverview: () => void;
  onEditName: () => void;
};

export function MenuPage({ restaurantName, date, mealPeriod = "lunch", onMealPeriodChange = () => {}, displayName, deviceId, status, menu, order, onAdjust, onShareCount, onOverview, onEditName }: MenuPageProps) {
  const [query, setQuery] = useState("");
  const visibleMenu = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return menu
      .filter((item) => item.active)
      .filter((item) => !normalized || item.name.toLocaleLowerCase().includes(normalized))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [menu, query]);
  const dishesById = useMemo(() => new Map(order?.dishes.map((dish) => [dish.menuItemId, dish]) ?? []), [order]);

  return (
    <div className="menu-page">
      <header className="menu-header">
        <div className="menu-header-topline">
          <p className="date-label">{date}</p>
          <SyncStatus status={status} />
        </div>
        <div className="title-row">
          <div>
            <p className="eyebrow">一起点，趁热吃</p>
            <h1>{restaurantName}</h1>
          </div>
          <button type="button" className="identity-button" onClick={onEditName} aria-label={`修改点餐姓名，当前为${displayName}`}>
            <span aria-hidden="true">筷</span>
            <span>{displayName}</span>
          </button>
        </div>
        <div className="meal-period-switcher" role="tablist" aria-label="点餐时段">
          {(["lunch", "dinner"] as const).map((period) => <button key={period} type="button" role="tab" aria-selected={mealPeriod === period} className="meal-period-tab" onClick={() => onMealPeriodChange(period)}>
            <strong>{MEAL_PERIOD_LABEL[period]}点单</strong><span>{MEAL_PERIOD_LOCK_TIME[period]} 锁单</span>
          </button>)}
        </div>
        <label className="search-field">
          <span className="sr-only">搜索菜品</span>
          <span className="search-icon" aria-hidden="true">⌕</span>
          <input
            type="search"
            aria-label="搜索菜品"
            placeholder="搜索想吃的菜"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </header>

      <main className="menu-content">
        {order?.locked && <p className="locked-notice" role="status">{MEAL_PERIOD_LABEL[mealPeriod]}订单已锁定，暂时不能修改</p>}
        {!order && <p className="menu-empty" role="status">正在加载今日菜单…</p>}
        {order && visibleMenu.length === 0 && <p className="menu-empty">没有找到相关菜品</p>}
        <div className="dish-list">
          {visibleMenu.map((item) => (
            <DishCard
              key={item.id}
              item={item}
              dish={dishesById.get(item.id)}
              deviceId={deviceId}
              locked={order?.locked}
              onAdjust={onAdjust}
            />
          ))}
        </div>
      </main>

      {order && (
        <BottomSummary
          totalQuantity={order.totalQuantity}
          totalCents={order.totalCents}
          shareCount={order.shareCount}
          locked={order.locked}
          onShareCount={onShareCount}
          onOverview={onOverview}
        />
      )}
    </div>
  );
}
