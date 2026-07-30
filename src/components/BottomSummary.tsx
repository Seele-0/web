import { formatCents } from "../domain/money";

type BottomSummaryProps = {
  totalQuantity: number;
  totalCents: number;
  shareCount: number;
  locked?: boolean;
  onShareCount: (shareCount: number) => void | Promise<void>;
  onOverview: () => void;
};

export function BottomSummary({ totalQuantity, totalCents, shareCount, locked = false, onShareCount, onOverview }: BottomSummaryProps) {
  const perPersonCents = totalCents === 0 ? 0 : Math.ceil(totalCents / Math.max(1, shareCount));

  function updateShareCount(value: string) {
    const next = Number(value);
    if (Number.isInteger(next) && next >= 1 && next <= 999) void onShareCount(next);
  }

  return (
    <footer className="bottom-summary">
      <div className="bottom-summary-inner">
        <div className="summary-order">
          <span>共 {totalQuantity} 份</span>
          <strong>{formatCents(totalCents)}</strong>
        </div>
        <div className="summary-sharing">
          <label htmlFor="share-count">均摊</label>
          <input
            id="share-count"
            type="number"
            inputMode="numeric"
            min="1"
            max="999"
            value={shareCount}
            disabled={locked}
            onChange={(event) => updateShareCount(event.target.value)}
          />
          <span>人</span>
          <strong>{formatCents(perPersonCents)} / 人</strong>
        </div>
        <button type="button" className="overview-button" onClick={onOverview}>订单总览</button>
      </div>
    </footer>
  );
}
