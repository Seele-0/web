import type { DishSnapshot } from "../api/client";
import type { MenuItem } from "../domain/types";
import { formatCents } from "../domain/money";

type DishCardProps = {
  item: MenuItem;
  dish?: DishSnapshot;
  deviceId: string;
  locked?: boolean;
  onAdjust: (menuItemId: string, delta: 1 | -1) => void | Promise<void>;
};

export function DishCard({ item, dish, deviceId, locked = false, onAdjust }: DishCardProps) {
  const totalQuantity = dish?.quantity ?? 0;
  const ownQuantity = dish?.contributors.find((contributor) => contributor.deviceId === deviceId)?.quantity ?? 0;

  return (
    <article className="dish-card">
      <div className="dish-card-copy">
        <h2>{item.name}</h2>
        <p className="dish-price">{formatCents(item.priceCents)}</p>
        <p className="dish-quantity">共 {totalQuantity} 份 · 你点了 {ownQuantity} 份</p>
      </div>
      <div className="quantity-controls" aria-label={`${item.name}数量`}>
        <button
          type="button"
          className="quantity-button quantity-minus"
          aria-label={`减少${item.name}`}
          disabled={locked || ownQuantity === 0}
          onClick={() => void onAdjust(item.id, -1)}
        >
          <span aria-hidden="true">−</span>
        </button>
        <output aria-label={`${item.name}总数量`}>{totalQuantity}</output>
        <button
          type="button"
          className="quantity-button quantity-plus"
          aria-label={`增加${item.name}`}
          disabled={locked}
          onClick={() => void onAdjust(item.id, 1)}
        >
          <span aria-hidden="true">＋</span>
        </button>
      </div>
    </article>
  );
}
