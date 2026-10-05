# Dirty Octopus 音频插件商店

一个小型、人工核验付款的插件商店：GitHub Pages 静态前端 + TypeScript Cloudflare Worker + D1。没有账户、购物车、自动支付、截图上传或 License 系统。

- 商店：`https://shop.dirtyoctopus.net`
- API：`https://dirtyoctopus-shop-api.umckspectre.workers.dev`
- 管理入口：商店 `/admin/` 跳转到上述 Worker 的 `/admin/`
- 域名注册、续费及 DNS 均保留在 **Namecheap**；不修改 Nameservers，不需要 `api.dirtyoctopus.net`。
- 商品：Spectral Corruptor，`spectral-corruptor`，**9990 分 / ¥99.90 CNY**。
- 视觉参考现有 Portfolio 的黑黄蓝配色、字体、标志与切角模块。此项目不修改 Portfolio，也不接管 `dirtyoctopus.net` 根域名。

## 购买与交付

1. 买家创建订单，浏览器保存订单号及 256-bit 随机访问凭证。
2. 买家使用微信扫码支付 ¥99.90。
3. 买家打开微信账单，复制“微信支付交易单号”，在订单页提交。
4. 状态变为 **付款信息已提交，等待人工核验**，并隐藏付款码，避免重复付款。
5. 买家添加 QQ / 微信，直接发送 **商店订单号、付款截图、Machine ID**。
6. 你核对自己的微信账单和截图，在管理页标记“付款已核验”。
7. 你在网站之外生成并通过 QQ / 微信发送 Activation Code，然后标记“已完成”。

网站不接收 Machine ID、截图或激活码字段。管理员备注也不应存放这些内容。交易单号不构成付款证明；必须核对你自己的微信账单。

## 目录与配置

| 文件                                   | 用途                                      |
| -------------------------------------- | ----------------------------------------- |
| `index.html` / `src/home.ts`           | 商店与本设备订单                          |
| `order/index.html` / `src/order.ts`    | 付款、订单状态、凭证恢复                  |
| `admin/index.html`                     | Pages 上的管理员跳转入口                  |
| `console/index.html` / `src/admin.ts`  | 构建后只在 Worker `/admin/` 提供管理页面  |
| `public/site-config.json`              | **公开 API 地址及 QQ / 微信联系方式配置** |
| `public/assets/newpaymentwx.jpg`       | 最新微信收款码，来源于工作区同名文件      |
| `public/assets/spectral-corruptor.png` | 插件真实预览图                            |
| `shared/catalog.ts`                    | 商品目录、服务端金额和状态文案            |
| `worker/`                              | API、JWT 校验、输入校验                   |
| `migrations/0001_orders.sql`           | D1 初始表及索引                           |
| `wrangler.jsonc`                       | 生产 Worker / D1 / Access / 限流配置      |
| `wrangler.local.jsonc`                 | 仅本地开发配置，无生产自定义域名          |
| `.github/workflows/pages.yml`          | main 推送后测试、构建、部署 Pages         |

QQ 与微信已经从 Portfolio 读取并填入。后续只改 `public/site-config.json`，重新构建并推送即可。尚未配置 API 地址或不存在有效联系方式时，前端会停止创建订单，避免付款后找不到开发者。

**收款码已按最新要求改为 `newpaymentwx.jpg`，不再使用旧 `wechat-pay.png` / `WeixinPayCode.png`。** 直接替换 `public/assets/newpaymentwx.jpg`，保持文件名不变。图片展示为原图，没有重绘二维码。上线前必须用微信实际识别一次，核对收款人及应付 ¥99.90；代码测试无法证明微信收款账户或到账能力。

插件预览图替换 `public/assets/spectral-corruptor.png`。原始工作区图片被忽略，仅提交发布资源副本。主站的原始音频和其他媒体不进入本仓库。

## 本地开发

需要 Node.js 22.12 或更高版本、npm。依赖使用 lockfile 固定；不需要 Docker、Redis 或 VPS。

```bash
npm ci
npm run build
npm run db:local
```

两个终端分别运行：

```bash
# 终端 1：本地 API 与本地 D1（不会操作远程数据库）
npm run dev:api

# 终端 2：Vite 前端
npm run dev
```

打开 `http://127.0.0.1:5173`，API 默认使用 `http://127.0.0.1:8787`。本地数据位于 `.wrangler/`，不提交 Git。不要在本地测试时实际付款；使用测试交易单号即可验证流程。

本地管理员没有绕过认证的开关。`npm test` 用临时 RSA 密钥签发 JWT 并模拟 Cloudflare JWKS 响应，验证真正的签名校验逻辑；浏览器管理 UI 测试仅模拟 API 响应。要手动体验生产管理流程，应配置 Access 后在生产或独立测试 Worker 上登录。

生产 API 地址只需填写 `public/site-config.json` 的 `apiBase`，然后重新构建、推送。构建时会同步写入前端与 HTML 的 CSP `connect-src`，不需要再到多个页面修改域名，也不会放行全部 `*.workers.dev`。当前已填写实际 Worker 地址。若将 `apiBase` 留空，仍可发布商品展示页，但会禁用购买并保留管理入口的配置说明。

本地开发默认连接 `http://127.0.0.1:8787`；可以用 `.env.local` 中的 `VITE_API_BASE` 覆盖公开地址。生产构建只接受不含路径的 HTTPS origin，禁止本地 HTTP 地址。`VITE_` 变量与 `site-config.json` 都是公开数据，**绝不能放 Cloudflare Token、Access 服务凭证或其他 Secret**。

## 自动化测试与构建

```bash
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run check:launch
```

- 集成测试使用实际 workerd / Miniflare D1 数据库执行 migration 与参数化 SQL，不是内存 Map 代替数据库。
- 测试覆盖随机订单、凭证 hash、正确/错误 token、交易单号 trim/长度/重复、输入大小限制、备注隔离、JWT 签名/过期/issuer/audience、CSRF、状态转换与并发冲突、取消/退款、分页与 CORS。
- 浏览器测试覆盖本地真实 Worker 的创建/提交/刷新/最近订单/凭证恢复，以及 390px、320px 布局和管理操作确认弹窗。管理 UI 测试的 API 响应是模拟数据，Access API 认证另有集成测试。
- `check:launch` 仅检查配置是否填写；不能代替在线 DNS、Access 策略、TLS 或实际收款核对。
- `dist/` 是 GitHub Pages 产物；`dist-worker/` 是 Worker 静态管理资源。不要把 `console/` 源目录作为 Pages 发布根目录。
- `npm run preview` 用于检查生产静态产物；生产 CSP 不开放本机 API，因此完整本地订单流程使用 `npm run dev`。

## 你需要在 Cloudflare 做的配置

### 1. workers.dev 子域与 D1

在 Cloudflare **Workers & Pages** 初始化账户的 `workers.dev` 子域。无需将 `dirtyoctopus.net` 添加到 Cloudflare，也无需迁移注册商或 DNS。Worker 名称固定为 `dirtyoctopus-shop-api`，因此最终地址通常为 `https://dirtyoctopus-shop-api.<账户子域>.workers.dev`，以实际部署输出为准。

在本地终端登录 Cloudflare 并创建 D1：

```bash
npx wrangler login
npx wrangler d1 create dirtyoctopus-shop
```

将命令返回的真实 `database_id` 填入 **`wrangler.jsonc`**，替换全零占位符。`wrangler.local.jsonc` 可以保留本地占位 ID。

应用生产 migration（先确认命令目标名称）：

```bash
npm run db:remote
```

迁移会创建 `orders` 表、创建时间分页索引，以及交易单号唯一索引。金额为整数分。相同微信交易单号不能被提交到多笔订单，即使原订单取消/退款也保留该记录，异常情况人工核对。

### 2. 创建 Cloudflare Access 应用

在 Zero Trust 的 **Access / Applications** 创建一个 **Self-hosted** 应用，例如 `Dirty Octopus Shop Admin`。在**同一个应用**中加入下面的 public hostname/path 条目，使其使用同一个 AUD：

| Hostname                                       | Path           |
| ---------------------------------------------- | -------------- |
| `dirtyoctopus-shop-api.<账户子域>.workers.dev` | `/admin`       |
| `dirtyoctopus-shop-api.<账户子域>.workers.dev` | `/admin/*`     |
| `dirtyoctopus-shop-api.<账户子域>.workers.dev` | `/api/admin`   |
| `dirtyoctopus-shop-api.<账户子域>.workers.dev` | `/api/admin/*` |

Dashboard 某些版本的 path 输入不带前导 `/`，以界面实际提示为准。确保根路径和子路径均受保护。**不要开启整个 Worker 的 “Protect this Worker behind Access / All traffic”，也不要保护整个 hostname；买家 `/api/orders` 必须保持公开可达。只保护上表管理路径。**

设置 Allow 策略，仅允许**你自己的管理员邮箱**，通过你的身份提供商或邮箱验证码登录。不要添加 Everyone / Bypass；不要把买家或公共邮箱域设为管理员。使用较短会话时间，例如 8 小时。

把以下配置写入 `wrangler.jsonc` 的 `vars`：

```json
{
  "ENVIRONMENT": "production",
  "ACCESS_TEAM_DOMAIN": "https://你的团队名.cloudflareaccess.com",
  "ACCESS_AUD": "该应用的完整Application-Audience-AUD"
}
```

Team Domain 与 AUD 是认证标识，并非可独立登录的密码。后端使用 `jose` 获取团队 JWKS，验证 **RS256 签名、issuer、audience、有效期及用户身份声明**。仅提供 `Cf-Access-Authenticated-User-Email` 无效；`Cf-Access-Jwt-Assertion` 也必须有有效签名。不允许服务 Token 代替带 email 的管理员身份。未配置时返回 503，缺少或伪造 JWT 返回 401。

官方参考：[workers.dev 上按 hostname/path 保护 Access](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)、[Access JWT 验证](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)、[Access 应用路径](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/)。

### 3. 部署 Worker，再连接商店

确认 D1 migration 和 Access 配置已完成：

```bash
npm run check
npm run deploy:worker
```

`wrangler.jsonc` 已启用 `workers_dev: true`、关闭 `preview_urls`，没有 Custom Domain / routes 配置。部署后，在输出或 **Workers & Pages → dirtyoctopus-shop-api → Settings / Domains & Routes** 复制真实的 `workers.dev` HTTPS 地址。首次部署可保持前端 `apiBase` 为空，取得地址后再发布前端。

修改 `public/site-config.json`，保留现有联系方式，将 `apiBase` 填为实际地址，例如（`YOUR_SUBDOMAIN` 必须替换）：

```json
{
  "apiBase": "https://dirtyoctopus-shop-api.YOUR_SUBDOMAIN.workers.dev",
  "qq": "256246372",
  "wechat": "CambridgePocketKnife"
}
```

不要添加结尾 `/api`、路径或 Token。核对 Access 的 hostname 与最终地址完全一致，然后运行 `npm run check:launch`，把配置提交并推送到 `main`，由 Actions 重新发布 Pages。管理 API 始终验证 JWT，即使 Access 路径设置遗漏也不会匿名放行。

验证 `<实际 API 地址>/api/health` 返回 `{"ok":true}`，管理 `/admin/` 会先要求 Access 登录。前者仅证明 Worker 可达；完整订单测试才能证明 D1、CORS 与人工处理流程正常。**无需在 Namecheap 添加 `api` 的 CNAME，也不要把自定义域名直接 CNAME 到 workers.dev 以代替 Custom Domain。**

生产 API 使用手动 `npm run deploy:worker` 部署，避免每次前端推送误迁移数据库。当前 GitHub Actions **不需要** Cloudflare API Token。以后若另加 Worker CI，令牌仅放 GitHub Secrets，并限定 Worker 编辑及目标 D1 权限。

## 你需要在 GitHub 做的配置

1. 将当前代码提交并推送到 `Dirty-Octopus/dirtyoctopus-shop` 的 `main` 分支。
2. 仓库 **Settings / Pages / Build and deployment / Source** 选择 **GitHub Actions**。
3. 在 **Settings / Pages / Custom domain** 填写 **`shop.dirtyoctopus.net`**。`public/CNAME` 已包含此值，但自定义 Actions 发布仍需在仓库 Pages 设置中绑定域名。
4. 配置 DNS 后等待检查通过及证书签发，再打开 **Enforce HTTPS**。
5. 查看 Actions 的 **Test and deploy shop**。`main` push 会执行 typecheck、API 测试、build、浏览器测试，成功后发布 `dist/`。PR 只测试，不发布。首次开启 Pages 后若旧运行失败，重新运行工作流。

只操作 **dirtyoctopus-shop** 仓库的 Pages，不改 **Portfolio4Music** 仓库设置。GitHub Pages 权限由 workflow 的 `pages: write` / `id-token: write` 提供，无需在前端设置 GitHub Token。

参考：[GitHub Pages 自定义工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。

## `shop.dirtyoctopus.net` DNS

在 Namecheap → **Domain List → dirtyoctopus.net → Manage → Advanced DNS → Host Records → Add New Record** 添加：

| Type         | Host   | Value                     | TTL       |
| ------------ | ------ | ------------------------- | --------- |
| CNAME Record | `shop` | `dirty-octopus.github.io` | Automatic |

Value **不带 `https://`、仓库路径或 `/`**。Nameservers 保持 Namecheap 原有设置；保留 `@` / `www` / MX / TXT 等现有记录，不修改 Portfolio 的绑定。若 `shop` 已有冲突记录，仅核对并处理 `shop` 的记录。

GitHub Pages 中应已绑定 `shop.dirtyoctopus.net`。绑定后，默认 `dirty-octopus.github.io/dirtyoctopus-shop/` 部署链接会跳转到商店域名；若 `shop` 还没有 DNS 记录，这个入口也无法打开。仓库中的 CNAME 文件不能替代 Namecheap 的 DNS 记录。

保存后等待 DNS 生效，在 GitHub → 仓库 **Settings → Pages** 检查 DNS / 证书状态，再打开 **Enforce HTTPS**。DNS 传播及 HTTPS 选项准备可能需要最多 24 小时。可通过公共 DNS 查询确认，而不要仅依赖可能被本地代理改写的 `dig` 结果：

```bash
curl 'https://dns.google/resolve?name=shop.dirtyoctopus.net&type=CNAME'
```

期望 `Status: 0` 且 Answer 指向 `dirty-octopus.github.io.`；`Status: 3` 表示查询仍为 NXDOMAIN。若已看到正确记录，但 HTTPS 仍失败，检查 Pages 证书状态，避免反复删除/重新添加域名。

建议在 GitHub 账户/组织 Pages 设置中按其提示验证自定义域名所有权，使用 GitHub 给出的确切 TXT 值。不要自行猜测验证码。待 GitHub Pages 检测通过、TLS 生效后测试商店与原 Portfolio 均可访问。

参考：[Namecheap 的 GitHub Pages DNS 指南](https://www.namecheap.com/support/knowledgebase/article.aspx/9645/2208/how-do-i-link-my-domain-to-github-pages/)、[GitHub Pages 自定义子域名](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)。

## API 与安全边界

### 买家 API

```http
POST /api/orders
Content-Type: application/json

{"product_id":"spectral-corruptor"}
```

返回 `201`：`{ "order": { ...客户字段 }, "customer_access_token": "..." }`。凭证仅在创建响应中出现一次，不能从数据库还原。订单号是 8 字节安全随机值，例如 `DO-7F3A91C28B4E6D05`，不会使用数据库自增 ID。订单号可以发送给开发者；访问凭证应私密保管。

```http
GET /api/orders/DO-7F3A91C28B4E6D05
Authorization: Bearer <customer_access_token>
```

```http
POST /api/orders/DO-7F3A91C28B4E6D05/payment-reference
Authorization: Bearer <customer_access_token>
Content-Type: application/json

{"wechat_transaction_id":"从微信复制的交易单号"}
```

交易单号 trim 后接受 10–64 位 ASCII 字母、数字、`-`、`_`；不接受空格、HTML 或脚本。可以在待付款/待人工核验时更正；重复相同提交幂等。客户 API 显式白名单输出，不返回 `admin_note`、hash、认证配置或其他内部字段。

所有 JSON POST 请求最大 **8 KiB**，包括实际读取的流大小，不能通过伪造 Content-Length 绕过。管理员备注最多 2000 字符。所有用户值使用 D1 `.bind()` 参数化查询；前端动态文字使用 `textContent` / `.value`，不拼接 HTML。

### CORS、认证及限流

- 生产买家 API 的浏览器来源只允许 **`https://shop.dirtyoctopus.net`**。不存在 `*` 或任意子域放行。
- 仅当 Worker `ENVIRONMENT=local` 且请求目标是 loopback 时，允许 `http://localhost:*` / `http://127.0.0.1:*` / IPv6 loopback。生产不会因为设置了 local 变量就开放远程 localhost CORS。
- CORS 不是认证；无 Origin 的客户端仍必须提交正确的 Customer Access Token 或 Access JWT。
- 管理页面与 API 同源，避免跨域 Access Cookie / 预检登录问题。管理 POST 还要求精确的同源 Origin 与 `X-Admin-Request: 1`，防止 CSRF。
- 创建订单使用 Cloudflare 原生 Rate Limit Binding：每个 Cloudflare 客户 IP **5 次/分钟**，全局 **60 次/分钟**；触发返回 429 / Retry-After。只信任 `CF-Connecting-IP`，不信任 X-Forwarded-For。共享网络可能共享配额。
- Rate Limit Binding 是轻量防滥用，不是全世界严格同步的总量限制。若流量增加，可调阈值或以后添加 Turnstile；当前没有引入其他基础设施。
- `namespace_id` 是账户内限流命名空间，当前为 `10099` / `10100`，若其他 Worker 已使用这两个值，请改成未使用的正整数字符串。
- localStorage 保存每笔订单独立的 ID / Token，避免多个标签页覆盖整个订单列表。清除浏览器数据会丢失凭证；买家可从订单页备份并在其他设备恢复，URL 中不包含 token。

参考：[Cloudflare 原生限流绑定](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)。

## 管理员操作

访问商店 `/admin/`，跳转到 API 域名并通过 Cloudflare Access 登录。列表每页 50 笔，可加载更多，也可按订单号直接查找。所有时间显示北京时间；数据库保存 UTC ISO 时间。

| 状态                          | 含义                            | 允许的人工操作 |
| ----------------------------- | ------------------------------- | -------------- |
| `PENDING_PAYMENT`             | 已创建，尚未提交交易单号        | 核验 / 取消    |
| `PAYMENT_REFERENCE_SUBMITTED` | 仅提交信息，等待人工核验        | 核验 / 取消    |
| `PAYMENT_VERIFIED`            | 已根据截图/微信账单人工核对收款 | 完成 / 退款    |
| `COMPLETED`                   | 已通过 QQ / 微信发送激活码      | 退款           |
| `CANCELLED`                   | 未核验订单取消                  | 仅备注         |
| `REFUNDED`                    | 已在微信完成人工退款            | 仅备注         |

如果买家直接通过 QQ / 微信提供付款证明，允许从待付款状态人工核验。不能跳过核验直接完成，也不能取消已核验订单，应先在微信实际退款再标记退款。并发变更使用条件更新避免覆盖；重复相同状态操作不会重写时间。每次状态操作都有明确的人工确认弹窗。

管理接口：

- `GET /api/admin/orders`（可选 `cursor`，使用响应的 `next_cursor`）
- `GET /api/admin/orders/:id`
- `POST /api/admin/orders/:id/verify-payment`
- `POST /api/admin/orders/:id/complete`
- `POST /api/admin/orders/:id/cancel`
- `POST /api/admin/orders/:id/refund`
- `POST /api/admin/orders/:id/note`，正文 `{ "admin_note": "..." }`

其他管理 POST 使用 `{}` JSON 正文。网站只记录退款状态，不向微信发起退款；它也不检查、生成、保存或发送 Activation Code。

## 数据库备份

在修改生产 migration 或批量人工操作前，先导出一份 SQL：

```bash
mkdir -p backups
npx wrangler d1 export dirtyoctopus-shop --remote --output=backups/orders-2026-10-05.sql
```

用实际日期替换文件名，妥善加密保存。`backups/` 已被 Git 忽略；其中包含交易单号和内部备注，不要上传公开仓库。也可以在 Cloudflare D1 Dashboard 查看数据库及可用的恢复选项。

恢复前先创建独立 D1 数据库测试导入与订单读取，确认无误后再决定生产切换。不要把备份直接执行到仍在服务且有新订单的生产数据库，以免覆盖数据。

参考：[D1 导出与导入](https://developers.cloudflare.com/d1/best-practices/import-export-data/)。

## 正式上线核对表

- [ ] Cloudflare D1 已创建，真实 ID 已填写，远程 migration 已应用。
- [ ] Cloudflare Access 的四个管理路径在同一个应用下，仅允许管理员邮箱。
- [ ] `ACCESS_TEAM_DOMAIN` / `ACCESS_AUD` 已填写，`npm run check:launch` 通过。
- [ ] Worker 的真实 `workers.dev` 地址已部署，已填写 `site-config.json` 的 `apiBase` 并重新发布前端。
- [ ] GitHub Pages Source 已选 Actions，Custom domain 已填 shop，工作流成功。
- [ ] Namecheap 只增加/更新 `shop` CNAME，Nameservers 与根域名 Portfolio 保持原状；无需配置 `api`。
- [ ] `shop.dirtyoctopus.net` TLS 正常，Enforce HTTPS 已开启。
- [ ] 用微信识别 `newpaymentwx.jpg`，核对收款对象和 ¥99.90；确认联系方式无误。
- [ ] 在生产创建一笔小范围人工测试订单，验证：无凭证看不到、提交后仍等待核验、无 Access 登录无法管理、核验/完成/取消/退款含义正确。
- [ ] 生产测试后对测试订单正确备注及处理；不要把未收到的真实付款标记已核验。
- [ ] 备份一次 D1，并确认备份不在 Git 中。

没有配置云端账户、DNS 和 Access 之前，**本地构建与测试通过不等于已经正式上线**。
