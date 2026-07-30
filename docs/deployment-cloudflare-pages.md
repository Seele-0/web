# Cloudflare Pages + D1 部署指南

本指南使用 GitHub 集成部署 React 静态资源与 Pages Functions，并把 D1 绑定为 `DB`。

## 1. 前置条件

- Cloudflare 账户和已授权的 GitHub 仓库
- 本地已执行 `npm install`
- Wrangler 已登录：`npx wrangler login`

生产管理员密码和会话 Secret 不得写入 Git、README、构建日志或普通环境变量。

## 2. 创建 D1 数据库

数据库名称必须是 `collaborative-ordering`：

```bash
npx wrangler d1 create collaborative-ordering
```

保存命令返回的数据库 ID。若希望使用 Wrangler 的迁移跟踪，可把返回值配置到本地专用的 Wrangler 配置中：

```toml
[[d1_databases]]
binding = "DB"
database_name = "collaborative-ordering"
database_id = "<DATABASE_ID>"
migrations_dir = "migrations"
```

不要把错误的占位 ID 提交到生产配置。

## 3. 初始化数据库

方式 A：配置好上面的 D1 条目后，使用迁移命令：

```bash
npx wrangler d1 migrations apply collaborative-ordering --remote
```

方式 B：不使用迁移跟踪时，按顺序执行两个 SQL 文件：

```bash
npx wrangler d1 execute collaborative-ordering --remote --file=migrations/0001_initial.sql
npx wrangler d1 execute collaborative-ordering --remote --file=migrations/0002_seed.sql
```

也可以在 Cloudflare Dashboard 的 D1 控制台中按 `0001`、`0002` 顺序执行。不要重复执行种子文件，除非已经确认不会触发主键冲突。

## 4. 连接 GitHub 并创建 Pages 项目

1. 打开 Cloudflare Dashboard → **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**。
2. 授权并选择 GitHub 仓库及生产分支。
3. 设置构建命令：`npm run build`。
4. 设置构建输出目录：`dist`。
5. 保存并执行首次部署。

Cloudflare Pages 的 Git 集成会在推送分支时构建部署，并可为非生产分支创建预览部署。

## 5. 绑定 D1

在 Pages 项目中分别配置生产与预览环境：

1. 进入 **Settings → Bindings**。
2. 新增 **D1 database binding**。
3. 变量名填写 `DB`。
4. 数据库选择 `collaborative-ordering`。
5. 对 Production 和 Preview 环境都完成绑定。
6. 保存后重新部署；绑定变更不会自动注入到已经完成的旧部署。

Functions 代码通过 `context.env.DB` 读取数据库，因此变量名必须严格为 `DB`。

## 6. 配置加密 Secret

在 Pages 项目的生产与预览环境分别添加加密 Secret：

- `ADMIN_PASSWORD`：强且唯一的管理员密码
- `ADMIN_SESSION_SECRET`：至少 32 个随机字符，用于签名四小时管理员会话

可用本地命令生成随机值，例如：

```bash
openssl rand -base64 48
```

在 Dashboard 的 **Settings → Variables and Secrets** 中选择 Secret/Encrypt 类型，不要使用明文变量。保存后重新部署。

## 7. 部署后检查

访问生产域名：

```bash
curl -i https://<YOUR_PAGES_DOMAIN>/api/bootstrap
```

必须返回 HTTP `200`，JSON 中应包含：

- `restaurantName`
- `menu`
- `order`

再用浏览器验证姓名入口、加菜、订单总览、历史页和 `/admin` 登录。若 `/api/bootstrap` 返回 500，优先检查 `DB` 是否绑定到当前环境，以及两个迁移是否都已执行。

## 8. 备份与恢复

先创建不提交到 Git 的备份目录：

```bash
mkdir -p backups
npx wrangler d1 export collaborative-ordering --remote --output=backups/collaborative-ordering-$(date +%F).sql
```

恢复前先暂停写入并再次备份当前数据库。建议优先恢复到一个新建的 D1 数据库，验证无误后再切换 Pages 的 `DB` 绑定：

```bash
npx wrangler d1 create collaborative-ordering-restore
npx wrangler d1 execute collaborative-ordering-restore --remote --file=backups/<BACKUP_FILE>.sql
```

验证恢复库后，在 Production/Preview 的 Pages Bindings 中将 `DB` 切换到恢复库，并重新部署。直接覆盖生产库风险更高，不建议在未演练时执行。

## 9. 官方文档

- [Cloudflare Pages Git integration](https://developers.cloudflare.com/pages/configuration/git-integration/)
- [Cloudflare Pages Functions bindings（含 D1）](https://developers.cloudflare.com/pages/functions/bindings/)
- [Cloudflare D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- [Cloudflare D1 import and export data](https://developers.cloudflare.com/d1/best-practices/import-export-data/)
