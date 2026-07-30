# 协作点餐

面向约 10 人小团队的移动端协作点餐应用。前端使用 React、Vite 与 TypeScript，后端使用 Cloudflare Pages Functions 和 D1。

## 功能

- 姓名 + 持久设备 ID，无需普通用户账号
- 每台设备独立记录点菜贡献，避免多人覆盖
- 2 秒轮询、乐观更新、离线写入队列和自动重放
- 手动均摊人数、订单总览和只读历史订单
- 管理员餐馆名称、Markdown 菜单、锁定与清空操作
- 金额全程使用整数分；业务日期使用 `Asia/Shanghai`

## 本地开发

```bash
npm install
npm run dev
```

`npm run dev` 只启动 Vite 前端。需要真实 Pages Functions 与 D1 时，使用 E2E 启动流程或自行配置本地 D1 后运行 `npm run preview:pages`。

## 验证

```bash
npm test
npm run test:workers
npm run test:e2e
npm run build
```

首次运行 E2E 前，如本机还没有 Chromium：

```bash
npx playwright install chromium
```

`npm run test:e2e` 会自动：

1. 构建前端；
2. 重置 `.wrangler/e2e` 中的隔离数据库；
3. 应用 `migrations/0001_initial.sql` 与 `migrations/0002_seed.sql`；
4. 临时生成仅供测试使用的 `.dev.vars`；
5. 在 `http://127.0.0.1:8788` 启动 Pages 本地预览；
6. 完成后恢复或删除临时 `.dev.vars`。

测试管理员密码为 `e2e-admin-password`，只用于本地 E2E，绝不能用于生产环境。

## 页面

- `/`：菜单与协作点餐
- `/overview`：今日订单总览
- `/history`：历史订单
- `/history/:date`：只读历史详情
- `/admin`：管理员入口

## 菜单 Markdown

支持列表或两列表格，金额可写元或人民币符号：

```markdown
- 酸菜鱼 | 68
- 米饭 | 2.00
```

导入顺序就是展示顺序；未包含在新 Markdown 中的旧菜品会停用。

## 部署

完整的 GitHub → Cloudflare Pages、D1 绑定、Secret、备份与恢复步骤见 [`docs/deployment-cloudflare-pages.md`](docs/deployment-cloudflare-pages.md)。
