import { fireEvent, render, screen } from "@testing-library/react";
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
  fireEvent.change(shareCount, { target: { value: "101" } });
  expect(onShareCount).not.toHaveBeenCalled();
});
