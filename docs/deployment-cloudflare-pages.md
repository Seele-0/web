# Cloudflare Pages、D1 与每日自动锁单部署指南

本项目部署到 Cloudflare Pages，使用 Pages Functions 访问 D1；另部署一个 Cron Worker，在**每天上海时间 23:59**自动锁定当天的订单。

## 1. 生产资源

| 项目 | 已配置值 |
| --- | --- |
| Pages 项目 | `web` |
| 生产地址 | `https://web-7ev.pages.dev/` |
| D1 数据库 | `order` |
| D1 数据库 ID | `e238e4a3-259a-4fc3-a345-710710850249` |
| Pages/Worker D1 绑定 | `DB` → `order` |
| 定时 Worker | `web-order-auto-lock` |
| Cron（UTC） | `59 15 * * *` |
| 实际执行时间 | 每日 23:59（Asia/Shanghai，UTC+8） |

`wrangler.toml` 配置 Pages 项目与 D1，`wrangler.auto-lock.toml` 配置自动锁单 Worker；二者都必须绑定同一个 `order` 数据库。

## 2. 前置条件

```bash
npm install
npx wrangler login
```

生产环境必须在 Pages 的 **Settings → Variables and Secrets** 中配置以下加密 Secret，且不能写入 Git：

- `ADMIN_PASSWORD`：管理员登录密码。
- `ADMIN_SESSION_SECRET`：至少 32 个随机字符的会话签名密钥。

可用下列命令生成随机值：

```bash
openssl rand -base64 48
```

## 3. 首次创建或核对 D1

数据库名称应为 `order`。如果尚未创建：

```bash
npx wrangler d1 create order
```

现有生产数据库 ID 为 `e238e4a3-259a-4fc3-a345-710710850249`，已经写入 `wrangler.toml` 和 `wrangler.auto-lock.toml`。不要将其他数据库 ID 覆盖进生产配置。

在 Cloudflare Dashboard 中，Pages 项目 `web` 的 Production 与 Preview 环境都应存在 D1 绑定：

```text
DB → order
```

## 4. 数据库迁移与备份

当前版本新增的 `migrations/0003_order_items_and_automatic_locks.sql` 会保存订单菜品快照和自动锁单记录。**必须先完成该迁移，再部署包含新逻辑的 Pages 与自动锁单 Worker。**

部署前先导出远程 D1 备份；以下示例的日期为 **2026-07-30**：

```bash
npx wrangler d1 export order --remote \
  --output=/private/tmp/order-before-0003-2026-07-30.sql
```

确认备份文件已经生成后执行全部未应用迁移：

```bash
npx wrangler d1 migrations apply order --remote
```

如果 Wrangler 显示 `0003` 已应用，则无需重复执行 SQL。

## 5. 部署顺序

在 `main` 分支完成测试后，按以下顺序执行：

```bash
# 1) 备份并迁移 D1
npx wrangler d1 export order --remote \
  --output=/private/tmp/order-before-0003-2026-07-30.sql
npx wrangler d1 migrations apply order --remote

# 2) 部署每日自动锁单 Worker
npm run deploy:auto-lock

# 3) 推送 main，让 GitHub 集成的 Pages 构建（如已启用）
git push origin main

# 4) 或者显式部署当前构建产物到 Pages
npm run build
npx wrangler pages deploy dist --project-name web
```

Worker 部署成功后，应显示 Cron Trigger `59 15 * * *`。该时间是 UTC，对应上海时间每日 23:59。

Pages Git 集成配置：生产分支为 `main`，构建命令为 `npm run build`，构建输出目录为 `dist`。如使用 Git 集成，最后一步手工 Pages 部署是可选的；如需要立即发布当前构建，则执行它。

## 6. 部署后验证

先检查生产 bootstrap API：

```bash
curl -fsS https://web-7ev.pages.dev/api/bootstrap
```

响应应包含 `restaurantName`、`menu` 和 `order`。接着使用两个浏览器或两个无痕窗口验证：

1. 管理员以 `菜品名称 -- 价格` 覆盖菜单，并确认另一设备无需刷新即可收到菜单更新。
2. 管理员以 `菜品名称 -- 价格 -- 数量` 覆盖已点订单。
3. 普通用户在另一设备加/减菜；两端加减号之间的总数量应在数秒内一致更新。
4. 验证管理员单项添加/删除、清空菜单、单项/批量管理已点订单和锁定/解锁订单。
5. 在 Cloudflare Dashboard 确认 Worker `web-order-auto-lock` 的 Cron 是 `59 15 * * *`，并且 D1 binding 显示 `DB → order`。

23:59 前后，普通读写请求也会触发一次幂等的兜底锁单检查，因此即使 Cron 有短暂调度延迟，也不会让截止后的订单先写入。管理员手动解锁仍然可用，且不会被这次兜底检查立即重复锁定。

## 7. 本地验证

发布前运行完整验证矩阵：

```bash
npm test
npm run test:workers
npm run build
npm run test:e2e
git diff --check
```

## 8. 恢复建议

恢复前暂停写入并再次备份。建议先恢复到新建 D1 数据库、验证数据无误，再在 Pages 和 Worker 中将 `DB` 绑定切换到恢复库并重新部署；不要在未演练的情况下直接覆盖生产数据库。

## 9. 官方文档

- [Cloudflare Pages Git integration](https://developers.cloudflare.com/pages/configuration/git-integration/)
- [Cloudflare Pages Functions bindings（含 D1）](https://developers.cloudflare.com/pages/functions/bindings/)
- [Cloudflare D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- [Cloudflare D1 import and export data](https://developers.cloudflare.com/d1/best-practices/import-export-data/)
- [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
