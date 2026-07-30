import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminPage } from "../../src/admin/AdminPage";

function createApi() {
  const historicalOrder = {
    orderDate: "2026-07-29",
    shareCount: 2,
    revision: 4,
    locked: true,
    totalQuantity: 1,
    totalCents: 6800,
    dishes: [{
      menuItemId: "dish-suan-cai-yu",
      name: "酸菜鱼",
      priceCents: 6800,
      quantity: 1,
      subtotalCents: 6800,
      contributors: [{ deviceId: "device-a", displayName: "张三", quantity: 1 }],
    }],
  };
  return {
    adminLogin: vi.fn().mockResolvedValue({ authenticated: true }),
    adminLogout: vi.fn().mockResolvedValue({ authenticated: false }),
    adminRenameRestaurant: vi.fn().mockResolvedValue({ restaurantName: "暖味小馆" }),
    adminImportMenu: vi.fn().mockResolvedValue({ items: [], errors: [] }),
    adminClearOrder: vi.fn().mockResolvedValue({ locked: false }),
    adminSetOrderLocked: vi.fn().mockImplementation(async (_date: string, locked: boolean) => ({ ...historicalOrder, locked })),
    historyDetail: vi.fn().mockResolvedValue(historicalOrder),
    adminCorrectContribution: vi.fn().mockImplementation(async (input: { quantity: number }) => ({ ...historicalOrder, locked: false, totalQuantity: input.quantity })),
  };
}

async function login(api: ReturnType<typeof createApi>) {
  await userEvent.type(screen.getByLabelText("管理员密码"), "correct-password");
  await userEvent.click(screen.getByRole("button", { name: "登录管理后台" }));
  expect(api.adminLogin).toHaveBeenCalledWith("correct-password");
  expect(await screen.findByRole("heading", { name: "管理设置" })).toBeInTheDocument();
}

it("shows login failure, clears the password, and reveals settings after a successful login", async () => {
  const api = createApi();
  api.adminLogin.mockRejectedValueOnce(new Error("管理员密码错误"));
  render(<AdminPage api={api} orderDate="2026-07-30" restaurantName="今日点餐" locked={false} onBack={vi.fn()} />);

  const password = screen.getByLabelText("管理员密码");
  await userEvent.type(password, "wrong");
  await userEvent.click(screen.getByRole("button", { name: "登录管理后台" }));
  expect(await screen.findByText("管理员密码错误")).toBeInTheDocument();
  expect(password).toHaveValue("");

  await login(api);
  expect(screen.getByRole("form", { name: "修改餐馆名称" })).toBeInTheDocument();
});

it("renames the restaurant and previews Markdown with source-line errors", async () => {
  const api = createApi();
  render(<AdminPage api={api} orderDate="2026-07-30" restaurantName="今日点餐" locked={false} onBack={vi.fn()} />);
  await login(api);

  const name = screen.getByLabelText("餐馆名称");
  await userEvent.clear(name);
  await userEvent.type(name, "暖味小馆");
  await userEvent.click(screen.getByRole("button", { name: "保存餐馆名称" }));
  expect(api.adminRenameRestaurant).toHaveBeenCalledWith("暖味小馆");
  expect(await screen.findByText("餐馆名称已保存")).toBeInTheDocument();

  const markdown = screen.getByLabelText("Markdown 菜单");
  await userEvent.type(markdown, "- 酸菜鱼 | 68\n- 米饭 | 错误");
  expect(screen.getByText("酸菜鱼")).toBeInTheDocument();
  expect(screen.getByText("第 2 行：价格格式无效")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "准备导入菜单" })).toBeDisabled();
});

it("requires import confirmation and preserves Markdown after an API failure", async () => {
  const api = createApi();
  api.adminImportMenu.mockRejectedValueOnce(new Error("导入服务暂不可用"));
  render(<AdminPage api={api} orderDate="2026-07-30" restaurantName="今日点餐" locked={false} onBack={vi.fn()} />);
  await login(api);

  const markdownText = "- 酸菜鱼 | 68\n- 米饭 | 2";
  const markdown = screen.getByLabelText("Markdown 菜单");
  await userEvent.type(markdown, markdownText);
  expect(screen.getByText("预览 2 道菜")).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "准备导入菜单" }));
  expect(api.adminImportMenu).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "确认导入 2 道菜" }));
  expect(api.adminImportMenu).toHaveBeenCalledWith(markdownText);
  expect(await screen.findByText("导入服务暂不可用")).toBeInTheDocument();
  expect(markdown).toHaveValue(markdownText);
});

it("requires the dated clear phrase and toggles the order lock", async () => {
  const api = createApi();
  render(<AdminPage api={api} orderDate="2026-07-30" restaurantName="今日点餐" locked={false} onBack={vi.fn()} />);
  await login(api);

  const clearButton = screen.getByRole("button", { name: "确认清空今日订单" });
  expect(clearButton).toBeDisabled();
  await userEvent.type(screen.getByLabelText("输入确认短语"), "清空 2026-07-30");
  expect(clearButton).toBeEnabled();
  await userEvent.click(clearButton);
  expect(api.adminClearOrder).toHaveBeenCalledWith("2026-07-30");

  await userEvent.click(screen.getByRole("button", { name: "锁定今日订单" }));
  expect(api.adminSetOrderLocked).toHaveBeenCalledWith("2026-07-30", true);
  expect(await screen.findByRole("button", { name: "解锁今日订单" })).toBeInTheDocument();
});

it("loads a historical order, unlocks it, and corrects an existing contribution", async () => {
  const api = createApi();
  render(<AdminPage api={api} orderDate="2026-07-30" restaurantName="今日点餐" locked={false} onBack={vi.fn()} />);
  await login(api);

  const managedDate = screen.getByLabelText("管理订单日期");
  await userEvent.clear(managedDate);
  await userEvent.type(managedDate, "2026-07-29");
  await userEvent.click(screen.getByRole("button", { name: "加载所选订单" }));

  expect(api.historyDetail).toHaveBeenCalledWith("2026-07-29");
  expect(await screen.findByText("张三")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "解锁所选订单" }));
  expect(api.adminSetOrderLocked).toHaveBeenCalledWith("2026-07-29", false);

  const quantity = screen.getByRole("spinbutton", { name: "张三的酸菜鱼数量" });
  await userEvent.clear(quantity);
  await userEvent.type(quantity, "3");
  await userEvent.click(screen.getByRole("button", { name: "保存张三的酸菜鱼数量" }));
  expect(api.adminCorrectContribution).toHaveBeenCalledWith({
    orderDate: "2026-07-29",
    menuItemId: "dish-suan-cai-yu",
    deviceId: "device-a",
    displayName: "张三",
    quantity: 3,
  });
});
