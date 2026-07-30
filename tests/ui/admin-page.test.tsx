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
    adminSetOrderLocked: vi.fn().mockImplementation(async (_date: string, locked: boolean) => ({ ...historicalOrder, locked })), historyDetail: vi.fn().mockResolvedValue(historicalOrder), adminCorrectContribution: vi.fn().mockImplementation(async (input: { quantity: number }) => ({ ...historicalOrder, locked: false, totalQuantity: input.quantity })),
  };
}
function renderPage(api = createApi()) { render(<AdminPage api={api} orderDate="2026-07-30" restaurantName="今日点餐" menu={menu} locked={false} onBack={vi.fn()} />); return api; }
async function login(api: ReturnType<typeof createApi>) { await userEvent.type(screen.getByLabelText("管理员密码"), "correct-password"); await userEvent.click(screen.getByRole("button", { name: "登录管理后台" })); expect(api.adminLogin).toHaveBeenCalledWith("correct-password"); expect(await screen.findByRole("heading", { name: "管理设置" })).toBeInTheDocument(); }
async function loadHistorical() { const managedDate = screen.getByLabelText("管理订单日期"); await userEvent.clear(managedDate); await userEvent.type(managedDate, "2026-07-29"); await userEvent.click(screen.getByRole("button", { name: "加载所选订单" })); }

it("shows login failure, clears password, and saves the restaurant name", async () => {
  const api = createApi(); api.adminLogin.mockRejectedValueOnce(new Error("管理员密码错误")); renderPage(api);
  const password = screen.getByLabelText("管理员密码"); await userEvent.type(password, "wrong"); await userEvent.click(screen.getByRole("button", { name: "登录管理后台" })); expect(await screen.findByText("管理员密码错误")).toBeInTheDocument(); expect(password).toHaveValue("");
  await login(api); const name = screen.getByLabelText("餐馆名称"); await userEvent.clear(name); await userEvent.type(name, "暖味小馆"); await userEvent.click(screen.getByRole("button", { name: "保存餐馆名称" })); expect(api.adminRenameRestaurant).toHaveBeenCalledWith("暖味小馆"); expect(await screen.findByText("餐馆名称已保存")).toBeInTheDocument();
});

it("parses, confirms, and preserves batch menu text after API failure", async () => {
  const api = renderPage(); await login(api); const text = "酸菜鱼 -- 68\n米饭 -- 2"; const input = screen.getByLabelText("批量菜单文本"); await userEvent.type(input, text); expect(screen.getByText("预览 2 道菜")).toBeInTheDocument(); await userEvent.click(screen.getByRole("button", { name: "准备覆盖菜单" })); await userEvent.click(screen.getByRole("button", { name: "确认覆盖 2 道菜" })); expect(api.adminImportMenu).toHaveBeenCalledWith(text);
  api.adminImportMenu.mockRejectedValueOnce(new Error("导入服务暂不可用")); await userEvent.clear(input); await userEvent.type(input, text); await userEvent.click(screen.getByRole("button", { name: "准备覆盖菜单" })); await userEvent.click(screen.getByRole("button", { name: "确认覆盖 2 道菜" })); expect(await screen.findByText("导入服务暂不可用")).toBeInTheDocument(); expect(input).toHaveValue(text);
});

it("adds, deletes, and clears individual menu items with confirmations", async () => {
  const api = renderPage(); await login(api); await userEvent.type(screen.getByLabelText("单项菜品名称"), "黄瓜火腿"); await userEvent.type(screen.getByLabelText("单项菜品价格"), "12"); await userEvent.click(screen.getByRole("button", { name: "添加菜品" })); expect(api.adminUpsertMenuItem).toHaveBeenCalledWith({ name: "黄瓜火腿", priceCents: 1200 });
  await userEvent.click(screen.getByRole("button", { name: "删除酸菜鱼" })); expect(api.adminDeleteMenuItem).not.toHaveBeenCalled(); await userEvent.click(screen.getByRole("button", { name: "确认删除酸菜鱼" })); expect(api.adminDeleteMenuItem).toHaveBeenCalledWith("dish-suan-cai-yu");
  const clear = screen.getByRole("button", { name: "确认清空全部菜单" }); expect(clear).toBeDisabled(); await userEvent.type(screen.getByLabelText("清空菜单确认短语"), "清空全部菜单"); await userEvent.click(clear); expect(api.adminClearMenu).toHaveBeenCalled();
});

it("imports ordered dishes and supports individual additions and whole-dish deletion", async () => {
  const api = renderPage(); await login(api); await loadHistorical();
  await userEvent.click(screen.getByRole("button", { name: "解锁所选订单" }));
  const orderPanel = screen.getByRole("heading", { name: "已点订单管理" }).closest("section");
  if (!orderPanel) throw new Error("未找到已点订单管理面板");
  const panel = within(orderPanel);
  const text = panel.getByLabelText("批量已点订单文本"); await userEvent.type(text, "黄瓜火腿 -- 12 -- 3\n麻婆豆腐 -- 12 -- 2"); expect(panel.getByText("共 5 份 · ¥60.00")).toBeInTheDocument(); await userEvent.click(panel.getByRole("button", { name: "准备覆盖已点订单" })); await userEvent.click(panel.getByRole("button", { name: "确认覆盖已点订单" })); expect(api.adminImportOrder).toHaveBeenCalledWith("2026-07-29", "黄瓜火腿 -- 12 -- 3\n麻婆豆腐 -- 12 -- 2");
  await userEvent.type(panel.getByLabelText("单项已点菜品名称"), "青椒炒蛋"); await userEvent.type(panel.getByLabelText("单项已点菜品价格"), "14"); await userEvent.clear(panel.getByLabelText("单项已点菜品数量")); await userEvent.type(panel.getByLabelText("单项已点菜品数量"), "2"); await userEvent.click(panel.getByRole("button", { name: "添加已点菜品" })); expect(api.adminUpsertOrderItem).toHaveBeenCalledWith({ orderDate: "2026-07-29", name: "青椒炒蛋", priceCents: 1400, quantity: 2 });
  await userEvent.click(panel.getByRole("button", { name: "删除酸菜鱼" })); await userEvent.click(panel.getByRole("button", { name: "确认删除酸菜鱼" })); expect(api.adminDeleteOrderItem).toHaveBeenCalledWith("2026-07-29", "dish-suan-cai-yu");
});

it("keeps locked order controls disabled, unlocks them, clears, and corrects contributions", async () => {
  const api = renderPage(); await login(api); await loadHistorical(); expect(screen.getByLabelText("批量已点订单文本")).toBeDisabled(); expect(screen.getByRole("button", { name: "添加已点菜品" })).toBeDisabled(); await userEvent.click(screen.getByRole("button", { name: "解锁所选订单" })); expect(api.adminSetOrderLocked).toHaveBeenCalledWith("2026-07-29", false); expect(screen.getByRole("button", { name: "添加已点菜品" })).toBeEnabled();
  const quantity = screen.getByRole("spinbutton", { name: "张三的酸菜鱼数量" }); await userEvent.clear(quantity); await userEvent.type(quantity, "3"); await userEvent.click(screen.getByRole("button", { name: "保存张三的酸菜鱼数量" })); expect(api.adminCorrectContribution).toHaveBeenCalledWith({ orderDate: "2026-07-29", menuItemId: "dish-suan-cai-yu", deviceId: "device-a", displayName: "张三", quantity: 3 });
  const clear = screen.getByRole("button", { name: "确认清空所选订单" }); expect(clear).toBeDisabled(); await userEvent.type(screen.getByLabelText("清空订单确认短语"), "清空订单 2026-07-29"); await userEvent.click(clear); expect(api.adminClearOrder).toHaveBeenCalledWith("2026-07-29");
});
