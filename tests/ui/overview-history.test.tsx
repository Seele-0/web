import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HistoryDetailPage } from "../../src/history/HistoryDetailPage";
import { HistoryListPage } from "../../src/history/HistoryListPage";
import { OrderOverviewPage } from "../../src/overview/OrderOverviewPage";

const order = {
  orderDate: "2026-07-30",
  shareCount: 4,
  revision: 3,
  locked: false,
  totalQuantity: 4,
  totalCents: 13800,
  dishes: [
    {
      menuItemId: "fish",
      name: "酸菜鱼",
      priceCents: 6800,
      quantity: 2,
      subtotalCents: 13600,
      contributors: [
        { deviceId: "device-a", displayName: "张三", quantity: 1 },
        { deviceId: "device-b", displayName: "张三", quantity: 1 },
      ],
    },
    {
      menuItemId: "rice",
      name: "米饭",
      priceCents: 100,
      quantity: 2,
      subtotalCents: 200,
      contributors: [{ deviceId: "device-c", displayName: "李四", quantity: 2 }],
    },
  ],
};

it("shows grouped contributors, dish subtotals, and the manually configured share count", () => {
  render(<OrderOverviewPage order={order} date="2026年7月30日" onBack={vi.fn()} onHistory={vi.fn()} />);

  const fish = screen.getByRole("article", { name: "酸菜鱼" });
  expect(within(fish).getByText("2 份")).toBeInTheDocument();
  expect(within(fish).getByText("单价 ¥68.00")).toBeInTheDocument();
  expect(within(fish).getByText("小计 ¥136.00")).toBeInTheDocument();
  expect(within(fish).getAllByText("张三 × 2")).toHaveLength(1);

  expect(screen.getByText("共 4 份")).toBeInTheDocument();
  expect(screen.getByText("总计 ¥138.00")).toBeInTheDocument();
  expect(screen.getByText("均摊 4 人")).toBeInTheDocument();
  expect(screen.getByText("¥34.50 / 人")).toBeInTheDocument();
  expect(screen.queryByText("均摊 2 人")).not.toBeInTheDocument();
});

it("sorts history newest first and opens the selected date", async () => {
  const onSelect = vi.fn();
  render(<HistoryListPage dates={[
    { orderDate: "2026-07-28", shareCount: 1, revision: 1, locked: true, totalQuantity: 1, totalCents: 6800 },
    { orderDate: "2026-07-29", shareCount: 2, revision: 2, locked: true, totalQuantity: 3, totalCents: 7200 },
  ]} onBack={vi.fn()} onSelect={onSelect} />);

  const entries = screen.getAllByRole("button", { name: /查看 2026年7月/ });
  expect(entries[0]).toHaveAccessibleName("查看 2026年7月29日订单");
  expect(entries[1]).toHaveAccessibleName("查看 2026年7月28日订单");
  await userEvent.click(entries[0]);
  expect(onSelect).toHaveBeenCalledWith("2026-07-29");
});

it("renders historical order detail as read-only", () => {
  render(<HistoryDetailPage order={{ ...order, orderDate: "2026-07-29", locked: true }} onBack={vi.fn()} />);

  expect(screen.getByRole("heading", { name: "历史订单" })).toBeInTheDocument();
  expect(screen.getByText("只读")).toBeInTheDocument();
  expect(screen.getByText("张三 × 2")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /增加|减少|清空|修改均摊/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
});
