import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MenuPage } from "../../src/menu/MenuPage";

const menu = [
  { id: "fish", name: "酸菜鱼", priceCents: 6800, sortOrder: 1, active: true },
  { id: "rice", name: "米饭", priceCents: 200, sortOrder: 2, active: true },
];
const order = {
  orderDate: "2026-07-30", shareCount: 2, revision: 1, locked: false, totalQuantity: 2, totalCents: 13600,
  dishes: [{ menuItemId: "fish", name: "酸菜鱼", priceCents: 6800, quantity: 2, subtotalCents: 13600, contributors: [{ deviceId: "other", displayName: "李四", quantity: 2 }] }],
};

it("renders the warm menu without exposing orderer names and supports interactions", async () => {
  const onAdjust = vi.fn();
  const onShareCount = vi.fn();
  render(<MenuPage restaurantName="今日点餐" date="2026年7月30日" displayName="张三" deviceId="device-a" status="synced" menu={menu} order={order} onAdjust={onAdjust} onShareCount={onShareCount} onOverview={vi.fn()} onEditName={vi.fn()} />);
  expect(screen.getByRole("heading", { name: "今日点餐" })).toBeInTheDocument();
  expect(screen.getByText("2026年7月30日")).toBeInTheDocument();
  expect(screen.getByText("酸菜鱼")).toBeInTheDocument();
  expect(screen.getByText("¥68.00")).toBeInTheDocument();
  expect(screen.queryByText("李四")).not.toBeInTheDocument();
  expect(screen.getByLabelText("酸菜鱼总数量")).toHaveTextContent("2");
  expect(screen.getByRole("button", { name: "减少酸菜鱼" })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "增加酸菜鱼" }));
  expect(onAdjust).toHaveBeenCalledWith("fish", 1);
  await userEvent.type(screen.getByRole("searchbox", { name: "搜索菜品" }), "米饭");
  expect(screen.queryByText("酸菜鱼")).not.toBeInTheDocument();
  expect(screen.getByText("米饭")).toBeInTheDocument();
  expect(screen.getByText("共 2 份")).toBeInTheDocument();
  expect(screen.getByText("¥136.00")).toBeInTheDocument();
  expect(screen.getByText("¥68.00 / 人")).toBeInTheDocument();

  const shareCount = screen.getByRole("spinbutton", { name: "均摊" });
  expect(shareCount).toHaveAttribute("max", "100");
});

it("shows the aggregate imported total between the quantity controls while preserving the current user's adjustment controls", async () => {
  const onAdjust = vi.fn();
  const importedOrder = {
    ...order,
    totalQuantity: 4,
    totalCents: 27200,
    dishes: [{
      ...order.dishes[0],
      quantity: 4,
      subtotalCents: 27200,
      contributors: [
        { deviceId: "admin-import", displayName: "管理员导入", quantity: 3 },
        { deviceId: "device-a", displayName: "张三", quantity: 1 },
      ],
    }],
  };

  render(<MenuPage restaurantName="今日点餐" date="2026年7月30日" displayName="张三" deviceId="device-a" status="synced" menu={menu} order={importedOrder} onAdjust={onAdjust} onShareCount={vi.fn()} onOverview={vi.fn()} onEditName={vi.fn()} />);

  const controls = screen.getByLabelText("酸菜鱼数量");
  expect(controls).toHaveTextContent("4");
  expect(screen.getByLabelText("酸菜鱼总数量")).toHaveTextContent("4");
  expect(screen.getByText("共 4 份 · 你点了 1 份")).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "增加酸菜鱼" }));
  await userEvent.click(screen.getByRole("button", { name: "减少酸菜鱼" }));
  expect(onAdjust).toHaveBeenNthCalledWith(1, "fish", 1);
  expect(onAdjust).toHaveBeenNthCalledWith(2, "fish", -1);
});

it("lets users clear the share count and only saves a valid value after confirmation", async () => {
  const user = userEvent.setup();
  const onShareCount = vi.fn();
  render(<MenuPage restaurantName="今日点餐" date="2026年7月30日" displayName="张三" deviceId="device-a" status="synced" menu={menu} order={order} onAdjust={vi.fn()} onShareCount={onShareCount} onOverview={vi.fn()} onEditName={vi.fn()} />);

  const shareCount = screen.getByRole("spinbutton", { name: "均摊" });
  await user.clear(shareCount);
  expect(shareCount).toHaveValue(null);
  expect(onShareCount).not.toHaveBeenCalled();

  await user.type(shareCount, "3");
  expect(onShareCount).not.toHaveBeenCalled();

  await user.keyboard("{Enter}");
  expect(onShareCount).toHaveBeenCalledOnce();
  expect(onShareCount).toHaveBeenCalledWith(3);
});

it.each(["", "0", "1.5", "101"])("rejects invalid share count %j and restores the original value", async (invalidValue) => {
  const user = userEvent.setup();
  const onShareCount = vi.fn();
  const alert = vi.spyOn(window, "alert").mockImplementation(() => undefined);
  render(<MenuPage restaurantName="今日点餐" date="2026年7月30日" displayName="张三" deviceId="device-a" status="synced" menu={menu} order={order} onAdjust={vi.fn()} onShareCount={onShareCount} onOverview={vi.fn()} onEditName={vi.fn()} />);

  const shareCount = screen.getByRole("spinbutton", { name: "均摊" });
  await user.clear(shareCount);
  if (invalidValue) await user.type(shareCount, invalidValue);
  await user.tab();

  expect(alert).toHaveBeenCalledWith("均摊人数必须是 1 到 100 之间的整数");
  expect(shareCount).toHaveValue(2);
  expect(onShareCount).not.toHaveBeenCalled();
  alert.mockRestore();
});

it("lets diners switch between lunch and dinner orders and shows their lock times", async () => {
  const onMealPeriodChange = vi.fn();
  render(<MenuPage restaurantName="今日点餐" date="2026年7月30日" mealPeriod="lunch" onMealPeriodChange={onMealPeriodChange} displayName="张三" deviceId="device-a" status="synced" menu={menu} order={order} onAdjust={vi.fn()} onShareCount={vi.fn()} onOverview={vi.fn()} onEditName={vi.fn()} />);
  expect(screen.getByRole("tab", { name: /中午点单/ })).toHaveTextContent("15:00 锁单");
  expect(screen.getByRole("tab", { name: /晚上点单/ })).toHaveTextContent("21:00 锁单");
  await userEvent.click(screen.getByRole("tab", { name: /晚上点单/ }));
  expect(onMealPeriodChange).toHaveBeenCalledWith("dinner");
});
