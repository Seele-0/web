import { expect, test } from "playwright/test";

const appUrl = "http://127.0.0.1:8788";

async function enterName(page: import("playwright/test").Page, name: string) {
  await page.goto(appUrl);
  await page.getByRole("textbox", { name: "姓名" }).fill(name);
  await page.getByRole("button", { name: "开始点餐" }).click();
  await expect(page.getByRole("heading", { name: "今日点餐" })).toBeVisible();
}

function dishCard(page: import("playwright/test").Page, name: string) {
  return page.getByRole("article").filter({ has: page.getByRole("heading", { name }) });
}

test("supports collaborative ordering, administrator imports, cross-device totals, and order locking", async ({ browser }) => {
  test.setTimeout(60_000);
  const zhangContext = await browser.newContext();
  const zhangPage = await zhangContext.newPage();
  await enterName(zhangPage, "张三");

  const zhangFish = dishCard(zhangPage, "酸菜鱼");
  await zhangFish.getByRole("button", { name: "增加酸菜鱼" }).click();
  await expect(zhangFish.getByText("共 1 份")).toBeVisible();

  await zhangPage.getByRole("button", { name: "订单总览" }).click();
  await expect(zhangPage).toHaveURL(`${appUrl}/overview`);
  await expect(zhangPage.getByText("张三")).toBeVisible();
  await zhangPage.getByRole("button", { name: "返回菜单" }).click();

  await zhangPage.getByLabel("均摊").fill("8");
  await expect(zhangPage.getByText("¥8.50 / 人")).not.toBeVisible();
  await zhangPage.getByLabel("均摊").press("Enter");
  await expect(zhangPage.getByText("¥8.50 / 人")).toBeVisible();

  const liContext = await browser.newContext();
  const liPage = await liContext.newPage();
  await enterName(liPage, "李四");
  const liFish = dishCard(liPage, "酸菜鱼");
  await liFish.getByRole("button", { name: "增加酸菜鱼" }).click();
  await expect(liFish.getByText("共 2 份")).toBeVisible();
  await expect(zhangFish.getByText("共 2 份")).toBeVisible({ timeout: 3_000 });

  await zhangContext.setOffline(true);
  await zhangFish.getByRole("button", { name: "增加酸菜鱼" }).click();
  await expect(zhangPage.getByText("当前离线，操作会在网络恢复后自动同步")).toBeVisible();
  await expect(zhangFish.getByText("共 3 份")).toBeVisible();
  await zhangContext.setOffline(false);
  await expect(zhangPage.getByText("已同步")).toBeVisible({ timeout: 5_000 });
  await expect(zhangFish.getByText("共 3 份")).toBeVisible();

  await zhangPage.getByRole("button", { name: "订单总览" }).click();
  await zhangPage.getByRole("button", { name: "历史订单" }).click();
  await expect(zhangPage.getByRole("heading", { name: "历史订单" })).toBeVisible();
  await zhangPage.goto(appUrl);
  await expect(zhangFish).toBeVisible();

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await enterName(adminPage, "管理员");
  await adminPage.goto(`${appUrl}/admin`);
  await adminPage.getByLabel("管理员密码").fill("e2e-admin-password");
  await adminPage.getByRole("button", { name: "登录管理后台" }).click();
  await expect(adminPage.getByRole("heading", { name: "管理设置" })).toBeVisible();
  const orderPanel = adminPage.getByRole("region", { name: "已点订单管理" });

  await orderPanel.getByRole("button", { name: "加载所选订单" }).click();
  await orderPanel.getByRole("tab", { name: "贡献修正" }).click();
  await expect(orderPanel.getByText("张三", { exact: true })).toBeVisible();
  await orderPanel.getByRole("tab", { name: "订单设置" }).click();
  await orderPanel.getByRole("button", { name: "锁定所选订单" }).click();
  await expect(orderPanel.getByRole("button", { name: "解锁所选订单" })).toBeVisible();
  await orderPanel.getByRole("tab", { name: "贡献修正" }).click();
  await expect(orderPanel.getByRole("spinbutton", { name: "张三的酸菜鱼数量" })).toBeDisabled();
  await orderPanel.getByRole("tab", { name: "订单设置" }).click();
  await orderPanel.getByRole("button", { name: "解锁所选订单" }).click();
  await orderPanel.getByRole("tab", { name: "贡献修正" }).click();
  const correctedQuantity = orderPanel.getByRole("spinbutton", { name: "张三的酸菜鱼数量" });
  await correctedQuantity.fill("1");
  await orderPanel.getByRole("button", { name: "保存张三的酸菜鱼数量" }).click();
  await expect(orderPanel.getByText("贡献数量已保存")).toBeVisible();

  await adminPage.getByRole("tab", { name: "菜单管理", exact: true }).click();
  const menuPanel = adminPage.getByRole("region", { name: "菜单管理" });
  await menuPanel.getByLabel("批量菜单文本").fill("黄瓜火腿 -- 12");
  await expect(menuPanel.getByText("预览 1 道菜")).toBeVisible();
  await menuPanel.getByRole("button", { name: "准备覆盖菜单" }).click();
  await menuPanel.getByRole("button", { name: "确认覆盖 1 道菜" }).click();
  await expect(menuPanel.getByText("已覆盖 1 道菜")).toBeVisible();

  const zhangCucumber = dishCard(zhangPage, "黄瓜火腿");
  const liCucumber = dishCard(liPage, "黄瓜火腿");
  await expect(zhangCucumber).toBeVisible({ timeout: 3_000 });
  await expect(liCucumber).toBeVisible({ timeout: 3_000 });

  await adminPage.getByRole("tab", { name: "订单管理", exact: true }).click();
  await orderPanel.getByRole("button", { name: "加载所选订单" }).click();
  await orderPanel.getByRole("tab", { name: "批量导入" }).click();
  await orderPanel.getByLabel("批量已点订单文本").fill("黄瓜火腿 -- 12 -- 3");
  await expect(orderPanel.getByText("共 3 份 · ¥36.00")).toBeVisible();
  await orderPanel.getByRole("button", { name: "准备覆盖已点订单" }).click();
  await orderPanel.getByRole("button", { name: "确认覆盖已点订单" }).click();
  await expect(zhangCucumber.getByText("共 3 份")).toBeVisible({ timeout: 3_000 });
  await expect(liCucumber.getByText("共 3 份")).toBeVisible({ timeout: 3_000 });

  await liCucumber.getByRole("button", { name: "增加黄瓜火腿" }).click();
  await expect(liCucumber.getByText("共 4 份")).toBeVisible();
  await expect(zhangCucumber.getByText("共 4 份")).toBeVisible({ timeout: 3_000 });

  await orderPanel.getByRole("tab", { name: "菜品维护" }).click();
  await orderPanel.getByRole("button", { name: "删除黄瓜火腿" }).click();
  await orderPanel.getByRole("button", { name: "确认删除黄瓜火腿" }).click();
  await expect(zhangCucumber.getByText("共 0 份")).toBeVisible({ timeout: 3_000 });
  await expect(liCucumber.getByText("共 0 份")).toBeVisible({ timeout: 3_000 });

  await adminPage.getByRole("tab", { name: "菜单管理", exact: true }).click();
  await menuPanel.getByRole("tab", { name: "单项维护" }).click();
  await menuPanel.getByLabel("单项菜品名称").fill("麻婆豆腐");
  await menuPanel.getByLabel("单项菜品价格").fill("12");
  await menuPanel.getByRole("button", { name: "添加菜品" }).click();
  await expect(menuPanel.getByRole("button", { name: "删除麻婆豆腐" })).toBeVisible();
  await menuPanel.getByRole("button", { name: "删除麻婆豆腐" }).click();
  await menuPanel.getByRole("button", { name: "确认删除麻婆豆腐" }).click();

  await adminPage.getByRole("tab", { name: "订单管理", exact: true }).click();
  await orderPanel.getByRole("button", { name: "加载所选订单" }).click();
  await orderPanel.getByRole("button", { name: "锁定所选订单" }).click();
  await expect(zhangCucumber.getByRole("button", { name: "增加黄瓜火腿" })).toBeDisabled({ timeout: 3_000 });
  await expect(zhangCucumber.getByRole("button", { name: "减少黄瓜火腿" })).toBeDisabled();
  await orderPanel.getByRole("button", { name: "解锁所选订单" }).click();
  await expect(zhangCucumber.getByRole("button", { name: "增加黄瓜火腿" })).toBeEnabled({ timeout: 3_000 });

  await adminPage.getByRole("tab", { name: "菜单管理", exact: true }).click();
  await menuPanel.getByRole("tab", { name: "清空菜单" }).click();
  await menuPanel.getByLabel("清空菜单确认短语").fill("清空全部菜单");
  await menuPanel.getByRole("button", { name: "确认清空全部菜单" }).click();
  await expect(liPage.getByText("没有找到相关菜品")).toBeVisible({ timeout: 3_000 });

  await adminContext.close();
  await liContext.close();
  await zhangContext.close();
});
