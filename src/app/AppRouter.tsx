import { useEffect, useState } from "react";
import { MemoryRouter, Navigate, Route, Routes, useInRouterContext, useNavigate, useParams } from "react-router-dom";
import { apiClient, type HistorySummary, type OrderSnapshot } from "../api/client";
import type { SyncState } from "../components/SyncStatus";
import { HistoryDetailPage } from "../history/HistoryDetailPage";
import { HistoryListPage, formatOrderDate } from "../history/HistoryListPage";
import { MenuPage } from "../menu/MenuPage";
import { OrderOverviewPage } from "../overview/OrderOverviewPage";
import type { MenuItem } from "../domain/types";

type AppRouterProps = {
  restaurantName: string;
  date: string;
  displayName: string;
  deviceId: string;
  status: SyncState;
  menu: MenuItem[];
  order: OrderSnapshot | null;
  onAdjust: (menuItemId: string, delta: 1 | -1) => void | Promise<void>;
  onShareCount: (shareCount: number) => void | Promise<void>;
  onEditName: () => void;
};

function HistoryListRoute() {
  const navigate = useNavigate();
  const [dates, setDates] = useState<HistorySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    apiClient.history()
      .then((value) => { if (active) setDates(value); })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "历史订单加载失败"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return <HistoryListPage dates={dates} loading={loading} error={error} onBack={() => navigate("/")} onSelect={(date) => navigate(`/history/${date}`)} />;
}

function HistoryDetailRoute() {
  const navigate = useNavigate();
  const { date = "" } = useParams();
  const [order, setOrder] = useState<OrderSnapshot | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    apiClient.historyDetail(date)
      .then((value) => { if (active) setOrder(value); })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "历史订单加载失败"); });
    return () => { active = false; };
  }, [date]);

  if (error) return <div className="secondary-page"><p className="secondary-error" role="alert">{error}</p><button type="button" className="plain-action" onClick={() => navigate("/history")}>返回历史订单</button></div>;
  if (!order) return <div className="secondary-page"><p className="secondary-empty" role="status">正在加载历史订单…</p></div>;
  return <HistoryDetailPage order={order} onBack={() => navigate("/history")} />;
}

function AppRoutes(props: AppRouterProps) {
  const navigate = useNavigate();

  return (
    <Routes>
      <Route path="/" element={
        <MenuPage
          restaurantName={props.restaurantName}
          date={props.date}
          displayName={props.displayName}
          deviceId={props.deviceId}
          status={props.status}
          menu={props.menu}
          order={props.order}
          onAdjust={props.onAdjust}
          onShareCount={props.onShareCount}
          onOverview={() => navigate("/overview")}
          onEditName={props.onEditName}
        />
      } />
      <Route path="/overview" element={props.order
        ? <OrderOverviewPage order={props.order} date={props.date} onBack={() => navigate("/")} onHistory={() => navigate("/history")} />
        : <div className="secondary-page"><p className="secondary-empty" role="status">正在加载今日订单…</p></div>
      } />
      <Route path="/history" element={<HistoryListRoute />} />
      <Route path="/history/:date" element={<HistoryDetailRoute />} />
      <Route path="/admin" element={<div className="secondary-page"><header className="secondary-header"><button type="button" className="back-button" onClick={() => navigate("/")} aria-label="返回菜单">‹</button><div><p>仅管理员可见</p><h1>管理设置</h1></div><span /></header><p className="secondary-empty">管理功能正在载入</p></div>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function AppRouter(props: AppRouterProps) {
  const inRouter = useInRouterContext();
  if (inRouter) return <AppRoutes {...props} />;
  return <MemoryRouter><AppRoutes {...props} /></MemoryRouter>;
}
