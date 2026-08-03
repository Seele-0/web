import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminPage } from "../../src/admin/AdminPage";

const menu = [
  { id: "dish-suan-cai-yu", name: "酸菜鱼", priceCents: 6800, sortOrder: 1, active: true },
  { id: "dish-mi-fan", name: "米饭", priceCents: 200, sortOrder: 2, active: true },
];
const historicalOrder = {
  orderDate: "2026-07-29", shareCount: 2, revision: 4, locked: true, totalQuantity: 1, totalCents: 6800,
  dishes: [{ menuItemId: "dish-suan-cai-yu", name: "酸菜鱼", priceCents: 6800, quantity: 1, subtotalCents: 6800, contributors: [{ deviceId: "device-a", displayName: "张三", quantity: 1 }] }],
};
function createApi() {
  return {
    adminLogin: vi.fn().mockResolvedValue({ authenticated: true }), adminLogout: vi.fn().mockResolvedValue({ authenticated: false }), adminRenameRestaurant: vi.fn().mockResolvedValue({ restaurantName: "暖味小馆" }),
    adminImportMenu: vi.fn().mockResolvedValue({ items: [], errors: [] }), adminUpsertMenuItem: vi.fn().mockResolvedValue(menu[0]), adminDeleteMenuItem: vi.fn().mockResolvedValue({ deleted: true }), adminClearMenu: vi.fn().mockResolvedValue({ cleared: true }),
    adminImportOrder: vi.fn().mockResolvedValue({ ...historicalOrder, locked: false, totalQuantity: 5, totalCents: 6000 }), adminUpsertOrderItem: vi.fn().mockResolvedValue({ ...historicalOrder, locked: false, totalQuantity: 3 }), adminDeleteOrderItem: vi.fn().mockResolvedValue({ ...historicalOrder, locked: false, dishes: [] }), adminClearOrder: vi.fn().mockResolvedValue({ ...historicalOrder, locked: false, dishes: [], totalQuantity: 0 }),
    adminSetOrderLocked: vi.fn().mockImplementation(async (_date: string, locked: boolean) => ({ ...historicalOrder, locked })), adminSetOrderShareCount: vi.fn().mockImplementation(async (_date: string, shareCount: number) => ({ ...historicalOrder, locked: false, shareCount })), historyDetail: vi.fn().mockResolvedValue(historicalOrder), adminCorrectContribution: vi.fn().mockImplementation(async (input: { quantity: number }) => ({ ...historicalOrder, locked: false, totalQuantity: input.quantity })),
  };
}
function renderPage(api = createApi()) { render(<AdminPage api={api} orderDate="2026-07-30" restaurantName="今日点餐" menu={menu} locked={false} onBack={vi.fn()} />); return api; }
async function login(api: ReturnType<typeof createApi>) { await userEvent.type(screen.getByLabelText("管理员密码"), "correct-password"); await userEvent.click(screen.getByRole("button", { name: "登录管理后台" })); expect(api.adminLogin).toHaveBeenCalledWith("correct-password"); expect(await screen.findByRole("heading", { name: "管理设置" })).toBeInTheDocument(); }
async function selectSection(name: "订单管理" | "菜单管理" | "餐馆设置") { await userEvent.click(screen.getByRole("tab", { name })); }
async function loadHistorical() { const managedDate = screen.getByLabelText("管理订单日期"); await userEvent.clear(managedDate); await userEvent.type(managedDate, "2026-07-29"); await userEvent.click(screen.getByRole("button", { name: "加载所选订单" })); }
async function openOrderTab(name: "订单设置" | "菜品维护" | "批量导入" | "贡献修正" | "清空订单") { await userEvent.click(screen.getByRole("tab", { name })); }

it("shows login failure, clears password, keeps only one main panel open, and saves the restaurant name", async () => {
  const api = createApi(); api.adminLogin.mockRejectedValueOnce(new Error("管理员密码错误")); renderPage(api);
  const password = screen.getByLabelText("管理员密码"); await userEvent.type(password, "wrong"); await userEvent.click(screen.getByRole("button", { name: "登录管理后台" })); expect(await screen.findByText("管理员密码错误")).toBeInTheDocument(); expect(password).toHaveValue("");
  await login(api); expect(screen.getByRole("heading", { name: "已点订单管理" })).toBeInTheDocument(); expect(screen.queryByRole("heading", { name: "菜单管理" })).not.toBeInTheDocument();
  await selectSection("餐馆设置"); const name = screen.getByLabelText("餐馆名称"); await userEvent.clear(name); await userEvent.type(name, "暖味小馆"); await userEvent.click(screen.getByRole("button", { name: "保存餐馆名称" })); expect(api.adminRenameRestaurant).toHaveBeenCalledWith("暖味小馆"); expect(await screen.findByText("餐馆名称已保存")).toBeInTheDocument();
});

it("parses, confirms, and preserves batch menu text after API failure", async () => {
  const api = renderPage(); await login(api); await selectSection("菜单管理"); const text = "酸菜鱼 -- 68\n米饭 -- 2"; const input = screen.getByLabelText("批量菜单文本"); await userEvent.type(input, text); expect(screen.getByText("预览 2 道菜")).toBeInTheDocument(); await userEvent.click(screen.getByRole("button", { name: "准备覆盖菜单" })); await userEvent.click(screen.getByRole("button", { name: "确认覆盖 2 道菜" })); expect(api.adminImportMenu).toHaveBeenCalledWith(text);
  api.adminImportMenu.mockRejectedValueOnce(new Error("导入服务暂不可用")); await userEvent.clear(input); await userEvent.type(input, text); await userEvent.click(screen.getByRole("button", { name: "准备覆盖菜单" })); await userEvent.click(screen.getByRole("button", { name: "确认覆盖 2 道菜" })); expect(await screen.findByText("导入服务暂不可用")).toBeInTheDocument(); expect(input).toHaveValue(text);
});

it("adds, deletes, and clears individual menu items from dedicated secondary tabs", async () => {
  const api = renderPage(); await login(api); await selectSection("菜单管理"); await userEvent.click(screen.getByRole("tab", { name: "单项维护" }));
  await userEvent.type(screen.getByLabelText("单项菜品名称"), "黄瓜火腿"); await userEvent.type(screen.getByLabelText("单项菜品价格"), "12"); await userEvent.click(screen.getByRole("button", { name: "添加菜品" })); expect(api.adminUpsertMenuItem).toHaveBeenCalledWith({ name: "黄瓜火腿", priceCents: 1200 });
  await userEvent.click(screen.getByRole("button", { name: "删除酸菜鱼" })); expect(api.adminDeleteMenuItem).not.toHaveBeenCalled(); await userEvent.click(screen.getByRole("button", { name: "确认删除酸菜鱼" })); expect(api.adminDeleteMenuItem).toHaveBeenCalledWith("dish-suan-cai-yu");
  await userEvent.click(screen.getByRole("tab", { name: "清空菜单" })); const clear = screen.getByRole("button", { name: "确认清空全部菜单" }); expect(clear).toBeDisabled(); await userEvent.type(screen.getByLabelText("清空菜单确认短语"), "清空全部菜单"); await userEvent.click(clear); expect(api.adminClearMenu).toHaveBeenCalled();
});

it("edits a historical order share count and adds a selected current-menu dish", async () => {
  const api = renderPage(); await login(api); await loadHistorical();
  expect(screen.getByLabelText("均摊人数")).toBeDisabled(); await userEvent.click(screen.getByRole("button", { name: "解锁所选订单" }));
  const shareCount = screen.getByLabelText("均摊人数"); await userEvent.clear(shareCount); await userEvent.type(shareCount, "3"); await userEvent.click(screen.getByRole("button", { name: "保存人数" })); expect(api.adminSetOrderShareCount).toHaveBeenCalledWith("2026-07-29", 3, "lunch");
  await openOrderTab("菜品维护"); await userEvent.selectOptions(screen.getByLabelText("从当前菜单选择菜品"), "dish-mi-fan"); expect(screen.getByLabelText("单项已点菜品名称")).toHaveValue("米饭"); expect(screen.getByLabelText("单项已点菜品价格")).toHaveValue("2"); await userEvent.clear(screen.getByLabelText("单项已点菜品数量")); await userEvent.type(screen.getByLabelText("单项已点菜品数量"), "2"); await userEvent.click(screen.getByRole("button", { name: "添加已点菜品" })); expect(api.adminUpsertOrderItem).toHaveBeenCalledWith({ orderDate: "2026-07-29", mealPeriod: "lunch", name: "米饭", priceCents: 200, quantity: 2 });
});

it("imports, deletes, corrects contributions, and clears a historical order from secondary tabs", async () => {
  const api = renderPage(); await login(api); await loadHistorical(); await userEvent.click(screen.getByRole("button", { name: "解锁所选订单" }));
  await openOrderTab("批量导入"); const text = screen.getByLabelText("批量已点订单文本"); await userEvent.type(text, "黄瓜火腿 -- 12 -- 3\n麻婆豆腐 -- 12 -- 2"); expect(screen.getByText("共 5 份 · ¥60.00")).toBeInTheDocument(); await userEvent.click(screen.getByRole("button", { name: "准备覆盖已点订单" })); await userEvent.click(screen.getByRole("button", { name: "确认覆盖已点订单" })); expect(api.adminImportOrder).toHaveBeenCalledWith("2026-07-29", "黄瓜火腿 -- 12 -- 3\n麻婆豆腐 -- 12 -- 2", "lunch");
  await openOrderTab("贡献修正"); const quantity = screen.getByRole("spinbutton", { name: "张三的酸菜鱼数量" }); await userEvent.clear(quantity); await userEvent.type(quantity, "3"); await userEvent.click(screen.getByRole("button", { name: "保存张三的酸菜鱼数量" })); expect(api.adminCorrectContribution).toHaveBeenCalledWith({ orderDate: "2026-07-29", mealPeriod: "lunch", menuItemId: "dish-suan-cai-yu", deviceId: "device-a", displayName: "张三", quantity: 3 });
  await openOrderTab("菜品维护"); await userEvent.click(screen.getByRole("button", { name: "删除酸菜鱼" })); await userEvent.click(screen.getByRole("button", { name: "确认删除酸菜鱼" })); expect(api.adminDeleteOrderItem).toHaveBeenCalledWith("2026-07-29", "dish-suan-cai-yu", "lunch");
  await openOrderTab("清空订单"); const clear = screen.getByRole("button", { name: "确认清空所选订单" }); expect(clear).toBeDisabled(); await userEvent.type(screen.getByLabelText("清空订单确认短语"), "清空订单 2026-07-29"); await userEvent.click(clear); expect(api.adminClearOrder).toHaveBeenCalledWith("2026-07-29", "lunch");
});
