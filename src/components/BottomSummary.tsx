import { useEffect, useState } from "react";
import { formatCents } from "../domain/money";

type BottomSummaryProps = {
  totalQuantity: number;
  totalCents: number;
  shareCount: number;
  locked?: boolean;
  onShareCount: (shareCount: number) => void | Promise<void>;
  onOverview: () => void;
};

const SHARE_COUNT_ERROR = "均摊人数必须是 1 到 100 之间的整数";

export function BottomSummary({ totalQuantity, totalCents, shareCount, locked = false, onShareCount, onOverview }: BottomSummaryProps) {
  const [shareCountDraft, setShareCountDraft] = useState(String(shareCount));
  const perPersonCents = totalCents === 0 ? 0 : Math.ceil(totalCents / Math.max(1, shareCount));

  useEffect(() => {
    setShareCountDraft(String(shareCount));
  }, [shareCount]);

  function commitShareCount() {
    const normalized = shareCountDraft.trim();
    const next = Number(normalized);

    if (normalized === "" || !Number.isInteger(next) || next < 1 || next > 100) {
      window.alert(SHARE_COUNT_ERROR);
      setShareCountDraft(String(shareCount));
      return;
    }

    setShareCountDraft(String(next));
    if (next !== shareCount) void onShareCount(next);
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
            max="100"
            value={shareCountDraft}
            disabled={locked}
            onChange={(event) => setShareCountDraft(event.target.value)}
            onBlur={commitShareCount}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
          <span>人</span>
          <strong>{formatCents(perPersonCents)} / 人</strong>
        </div>
        <button type="button" className="overview-button" onClick={onOverview}>订单总览</button>
      </div>
    </footer>
  );
}
