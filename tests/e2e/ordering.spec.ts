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

test("supports collaborative ordering, offline replay, history, and admin menu preview", async ({ browser }) => {
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

  await zhangPage.goto(`${appUrl}/admin`);
  await zhangPage.getByLabel("管理员密码").fill("e2e-admin-password");
  await zhangPage.getByRole("button", { name: "登录管理后台" }).click();
  await expect(zhangPage.getByRole("heading", { name: "管理设置" })).toBeVisible();

  await zhangPage.getByRole("button", { name: "加载所选订单" }).click();
  await expect(zhangPage.getByText("张三", { exact: true })).toBeVisible();
  await zhangPage.getByRole("button", { name: "锁定所选订单" }).click();
  await expect(zhangPage.getByRole("button", { name: "解锁所选订单" })).toBeVisible();
  await expect(zhangPage.getByRole("spinbutton", { name: "张三的酸菜鱼数量" })).toBeDisabled();
  await zhangPage.getByRole("button", { name: "解锁所选订单" }).click();
  const correctedQuantity = zhangPage.getByRole("spinbutton", { name: "张三的酸菜鱼数量" });
  await correctedQuantity.fill("1");
  await zhangPage.getByRole("button", { name: "保存张三的酸菜鱼数量" }).click();
  await expect(zhangPage.getByText("张三 的贡献数量已保存")).toBeVisible();

  await zhangPage.getByLabel("Markdown 菜单").fill("- 酸菜鱼 | 68\n- 米饭 | 2");
  await expect(zhangPage.getByText("预览 2 道菜")).toBeVisible();

  await liContext.close();
  await zhangContext.close();
});
