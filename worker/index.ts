import { SALE_START, SALE_START_MS } from "../shared/launch";
import { publicContent, adminContent } from "./content";
import type { D1Database, RateLimit } from "@cloudflare/workers-types";
import {
  statuses,
  products,
  orderIdPattern,
  tokenPattern,
  transactionPattern,
  type CustomerOrder,
  type OrderStatus,
} from "../shared/catalog";
import {
  HttpError,
  onlyFields,
  randomHex,
  randomToken,
  readJson,
  sha256,
  verifyAccess,
} from "./security";

export interface Env {
  DB: D1Database;
  ASSETS: { fetch(url: string): Promise<Response> };
  CREATE_LIMITER: RateLimit;
  GLOBAL_CREATE_LIMITER: RateLimit;
  ENVIRONMENT: string;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
}
interface OrderRow extends Omit<CustomerOrder, "product_name"> {
  customer_access_token_hash: string;
  admin_note: string;
  archived_at: string | null;
}
const SHOP_ORIGIN = "https://shop.dirtyoctopus.net";
const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
function isLocal(request: Request, env: Env) {
  return (
    env.ENVIRONMENT === "local" && localHosts.has(new URL(request.url).hostname)
  );
}
function allowedCustomerOrigin(origin: string, request: Request, env: Env) {
  if (origin === SHOP_ORIGIN) return true;
  if (!isLocal(request, env)) return false;
  try {
    const url = new URL(origin);
    return (
      url.protocol === "http:" &&
      localHosts.has(url.hostname) &&
      url.origin === origin
    );
  } catch {
    return false;
  }
}
function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}
function customerOrder(row: OrderRow): CustomerOrder {
  // 显式白名单，避免未来新增内部字段被意外暴露。
  return {
    id: row.id,
    product_id: row.product_id,
    product_name:
      products[row.product_id as keyof typeof products]?.name ?? row.product_id,
    amount_cents: row.amount_cents,
    currency: row.currency,
    status: row.status,
    wechat_transaction_id: row.wechat_transaction_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    payment_reference_submitted_at: row.payment_reference_submitted_at,
    payment_verified_at: row.payment_verified_at,
    completed_at: row.completed_at,
    cancelled_at: row.cancelled_at,
    refunded_at: row.refunded_at,
  };
}
function adminOrder(row: OrderRow) {
  return {
    ...customerOrder(row),
    admin_note: row.admin_note,
    archived_at: row.archived_at,
  };
}
async function expireOrders(env: Env) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    "UPDATE orders SET status = ?, expired_at = ?, updated_at = ? WHERE status = ? AND created_at <= ?",
  )
    .bind(
      "EXPIRED",
      now,
      now,
      "PENDING_PAYMENT",
      new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    )
    .run();
}
async function findOrder(env: Env, id: string) {
  const row = await env.DB.prepare("SELECT * FROM orders WHERE id = ?")
    .bind(id)
    .first<OrderRow>();
  if (!row) throw new HttpError(404, "订单不存在或访问凭证无效。");
  return row;
}
async function authorizeCustomer(request: Request, env: Env, id: string) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  if (!tokenPattern.test(token))
    throw new HttpError(404, "订单不存在或访问凭证无效。");
  const row = await env.DB.prepare(
    "SELECT * FROM orders WHERE id = ? AND customer_access_token_hash = ?",
  )
    .bind(id, await sha256(token))
    .first<OrderRow>();
  if (!row) throw new HttpError(404, "订单不存在或访问凭证无效。");
  return row;
}
async function createOrder(request: Request, env: Env) {
  if (!isLocal(request, env) && Date.now() < SALE_START_MS)
    throw new HttpError(
      403,
      "敬请等待，北京时间 2026 年 10 月 6 日 21:09:09 开售。",
    );
  const body = await readJson(request);
  onlyFields(body, ["product_id"]);
  if (
    typeof body.product_id !== "string" ||
    !Object.hasOwn(products, body.product_id)
  ) {
    throw new HttpError(400, "请选择有效的商品。");
  }
  const ip = isLocal(request, env)
    ? "local"
    : request.headers.get("cf-connecting-ip");
  if (!ip || !env.CREATE_LIMITER || !env.GLOBAL_CREATE_LIMITER)
    throw new HttpError(503, "创建订单暂不可用。");
  // 匿名购买没有账户；按 Cloudflare 提供的 IP 限流，不信任 X-Forwarded-For。
  const perIp = await env.CREATE_LIMITER.limit({
    key: `create:${await sha256(ip)}`,
  });
  if (!perIp.success)
    throw new HttpError(429, "创建过于频繁，请一分钟后重试。");
  const global = await env.GLOBAL_CREATE_LIMITER.limit({ key: "create:all" });
  if (!global.success)
    throw new HttpError(429, "当前订单较多，请一分钟后重试。");
  const product = products[body.product_id as keyof typeof products];
  const token = randomToken();
  const hash = await sha256(token);
  const now = new Date().toISOString();
  for (let attempt = 0; attempt < 3; attempt++) {
    const id = `DO-${randomHex(8)}`;
    const result = await env.DB.prepare(
      `INSERT INTO orders
      (id, product_id, amount_cents, currency, customer_access_token_hash, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`,
    )
      .bind(
        id,
        product.id,
        product.amount_cents,
        product.currency,
        hash,
        "PENDING_PAYMENT",
        now,
        now,
      )
      .run();
    if (result.meta.changes)
      return json(
        {
          order: customerOrder(await findOrder(env, id)),
          customer_access_token: token,
        },
        201,
      );
  }
  throw new HttpError(503, "暂时无法生成订单，请重试。");
}
async function submitReference(request: Request, env: Env, row: OrderRow) {
  const body = await readJson(request);
  onlyFields(body, ["wechat_transaction_id"]);
  if (typeof body.wechat_transaction_id !== "string")
    throw new HttpError(400, "请填写微信支付交易单号。");
  const reference = body.wechat_transaction_id.trim();
  if (!transactionPattern.test(reference))
    throw new HttpError(
      400,
      "交易单号需为 10–64 位字母、数字、连字符或下划线，请从微信账单复制。",
    );
  if (
    !["PENDING_PAYMENT", "PAYMENT_REFERENCE_SUBMITTED"].includes(row.status)
  ) {
    throw new HttpError(409, "当前订单状态不允许修改付款信息，请联系开发者。");
  }
  if (row.wechat_transaction_id === reference)
    return json({ order: customerOrder(row) });
  const now = new Date().toISOString();
  try {
    const result = await env.DB.prepare(
      `UPDATE orders SET wechat_transaction_id = ?, status = ?,
      payment_reference_submitted_at = ?, updated_at = ? WHERE id = ? AND status = ? AND updated_at = ?`,
    )
      .bind(
        reference,
        "PAYMENT_REFERENCE_SUBMITTED",
        now,
        now,
        row.id,
        row.status,
        row.updated_at,
      )
      .run();
    if (!result.meta.changes)
      throw new HttpError(409, "订单已更新，请刷新后重试。");
  } catch (error) {
    if (
      error instanceof Error &&
      /UNIQUE constraint failed: orders.wechat_transaction_id/.test(
        error.message,
      )
    ) {
      throw new HttpError(
        409,
        "此交易单号已提交，请检查本设备已有订单或联系开发者。",
      );
    }
    throw error;
  }
  return json({ order: customerOrder(await findOrder(env, row.id)) });
}

const transitions: Record<
  string,
  { from: OrderStatus[]; to: OrderStatus; timestamp: string }
> = {
  "verify-payment": {
    from: ["PENDING_PAYMENT", "PAYMENT_REFERENCE_SUBMITTED"],
    to: "PAYMENT_VERIFIED",
    timestamp: "payment_verified_at",
  },
  complete: {
    from: ["PAYMENT_VERIFIED"],
    to: "COMPLETED",
    timestamp: "completed_at",
  },
  cancel: {
    from: ["PENDING_PAYMENT", "PAYMENT_REFERENCE_SUBMITTED"],
    to: "CANCELLED",
    timestamp: "cancelled_at",
  },
  refund: {
    from: ["PAYMENT_VERIFIED", "COMPLETED"],
    to: "REFUNDED",
    timestamp: "refunded_at",
  },
};
async function adminRoute(request: Request, env: Env, path: string) {
  await verifyAccess(request, env);
  if (request.method === "POST") {
    // JWT 通过后仍限制同源写入，防止 Cookie 身份的 CSRF。
    if (
      request.headers.get("origin") !== new URL(request.url).origin ||
      request.headers.get("x-admin-request") !== "1"
    ) {
      throw new HttpError(403, "管理员操作必须来自同源管理页面。");
    }
  }
  const content = await adminContent(request, env, path);
  if (content) return content;
  if (path === "/api/admin/orders" && request.method === "GET") {
    const params = new URL(request.url).searchParams;
    const q = (params.get("q") ?? "").trim().toUpperCase();
    const status = params.get("status") ?? "";
    const sorts = {
      newest: ["created_at", "DESC"],
      oldest: ["created_at", "ASC"],
      id_asc: ["id", "ASC"],
      id_desc: ["id", "DESC"],
    } as const;
    const sort = params.get("sort") ?? "newest";
    const archive = params.get("archive") ?? "active";
    if (!["active", "archived", "all"].includes(archive))
      throw new HttpError(400, "归档筛选无效。");
    if (
      !/^[A-Z0-9-]{0,19}$/.test(q) ||
      (status && !statuses.includes(status as OrderStatus)) ||
      !Object.hasOwn(sorts, sort)
    )
      throw new HttpError(400, "筛选或排序参数无效。");
    const [column, direction] = sorts[sort as keyof typeof sorts];
    const conditions = ["id LIKE ?", "(? = '' OR status = ?)"];
    if (archive !== "all")
      conditions.push(
        archive === "archived"
          ? "archived_at IS NOT NULL"
          : "archived_at IS NULL",
      );
    const values: (string | number)[] = [q + "%", status, status];
    const cursor = params.get("cursor");
    if (cursor) {
      const [created, id, ...extra] = cursor.split("|");
      if (
        extra.length ||
        !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(created) ||
        !orderIdPattern.test(id ?? "")
      )
        throw new HttpError(400, "分页参数无效。");
      const op = direction === "ASC" ? ">" : "<";
      if (column === "id") {
        conditions.push(`id ${op} ?`);
        values.push(id);
      } else {
        conditions.push(
          `(created_at ${op} ? OR (created_at = ? AND id ${op} ?))`,
        );
        values.push(created, created, id);
      }
    }
    const { results } = await env.DB.prepare(
      `SELECT * FROM orders WHERE ${conditions.join(" AND ")} ORDER BY ${column} ${direction}, id ${direction} LIMIT ?`,
    )
      .bind(...values, 51)
      .all<OrderRow>();
    const visible = results.slice(0, 50),
      last = visible.at(-1);
    return json({
      orders: visible.map(adminOrder),
      next_cursor:
        results.length > 50 && last ? `${last.created_at}|${last.id}` : null,
    });
  }
  const match = path.match(
    /^\/api\/admin\/orders\/(DO-[A-F0-9]{16})(?:\/(verify-payment|complete|cancel|refund|note|archive|unarchive))?$/,
  );
  if (!match) throw new HttpError(404, "接口不存在。");
  const [, id, action] = match;
  const row = await findOrder(env, id);
  if (!action && request.method === "GET")
    return json({ order: adminOrder(row) });
  if (!action || request.method !== "POST")
    throw new HttpError(405, "请求方法不支持。");
  const body = await readJson(request);
  const now = new Date().toISOString();
  if (action === "archive" || action === "unarchive") {
    onlyFields(body, []);
    await env.DB.prepare("UPDATE orders SET archived_at = ? WHERE id = ?")
      .bind(action === "archive" ? now : null, id)
      .run();
  } else if (action === "note") {
    onlyFields(body, ["admin_note"]);
    if (
      typeof body.admin_note !== "string" ||
      body.admin_note.length > 2000 ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(body.admin_note)
    ) {
      throw new HttpError(400, "备注需为不超过 2000 字符的文本。");
    }
    await env.DB.prepare(
      "UPDATE orders SET admin_note = ?, updated_at = ? WHERE id = ?",
    )
      .bind(body.admin_note.trim(), now, id)
      .run();
  } else {
    onlyFields(body, []);
    const transition = transitions[action];
    if (row.status === transition.to) return json({ order: adminOrder(row) });
    if (!transition.from.includes(row.status))
      throw new HttpError(409, "当前状态不允许此操作，请刷新订单。");
    // 列名来自上方固定映射；所有外部输入都使用绑定参数。
    const result = await env.DB.prepare(
      `UPDATE orders SET status = ?, ${transition.timestamp} = ?, updated_at = ? WHERE id = ? AND status = ?`,
    )
      .bind(transition.to, now, now, id, row.status)
      .run();
    if (!result.meta.changes)
      throw new HttpError(409, "订单已更新，请刷新后重试。");
  }
  return json({ order: adminOrder(await findOrder(env, id)) });
}

async function route(request: Request, env: Env): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (path.startsWith("/api/orders") || path.startsWith("/api/admin/"))
    await expireOrders(env);
  if (path === "/api/sale" && request.method === "GET")
    return json({
      starts_at: SALE_START,
      server_now: Date.now(),
      open: isLocal(request, env) || Date.now() >= SALE_START_MS,
    });
  if (path === "/api/supporters" || path === "/api/words")
    return publicContent(request, env, path);
  if (path === "/api/health" && request.method === "GET")
    return json({ ok: true });
  if (path === "/admin" || path.startsWith("/admin/")) {
    await verifyAccess(request, env);
    if (request.method !== "GET" && request.method !== "HEAD")
      throw new HttpError(405, "请求方法不支持。");
    return env.ASSETS.fetch(request.url);
  }
  if (
    path.startsWith("/assets/") &&
    (request.method === "GET" || request.method === "HEAD")
  ) {
    return env.ASSETS.fetch(request.url);
  }
  if (path === "/api/admin" || path.startsWith("/api/admin/"))
    return adminRoute(request, env, path);
  if (path === "/api/orders") {
    if (request.method !== "POST") throw new HttpError(405, "请求方法不支持。");
    return createOrder(request, env);
  }
  const match = path.match(
    /^\/api\/orders\/(DO-[A-F0-9]{16})(\/payment-reference)?$/,
  );
  if (match) {
    const row = await authorizeCustomer(request, env, match[1]);
    if (!match[2] && request.method === "GET")
      return json({ order: customerOrder(row) });
    if (match[2] && request.method === "POST")
      return submitReference(request, env, row);
    throw new HttpError(405, "请求方法不支持。");
  }
  throw new HttpError(404, "接口不存在。");
}

export default {
  async scheduled(_event: unknown, env: Env) {
    await expireOrders(env);
  },
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("origin");
    const url = new URL(request.url);
    const admin =
      url.pathname === "/api/admin" || url.pathname.startsWith("/api/admin/");
    const staticResource = url.pathname.startsWith("/assets/");
    const allowedOrigin =
      origin &&
      (admin || staticResource
        ? origin === url.origin
        : allowedCustomerOrigin(origin, request, env));
    let response: Response;
    try {
      if (origin && !allowedOrigin)
        throw new HttpError(403, "不允许此来源访问。");
      if (request.method === "OPTIONS") {
        if (!origin || !allowedOrigin)
          throw new HttpError(403, "不允许此来源访问。");
        response = new Response(null, { status: 204 });
      } else {
        response = await route(request, env);
      }
    } catch (error) {
      // 不将 JWT、交易单号、SQL 或其他请求内容写入日志/返回前端。
      response = json(
        {
          error:
            error instanceof HttpError
              ? error.message
              : "服务暂不可用，请稍后重试。",
        },
        error instanceof HttpError ? error.status : 500,
      );
    }
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("X-Frame-Options", "DENY");
    headers.set("Vary", "Origin");
    headers.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    );
    if (allowedOrigin) {
      headers.set("Access-Control-Allow-Origin", origin!);
      headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      headers.set(
        "Access-Control-Allow-Headers",
        "Authorization, Content-Type, X-Admin-Request",
      );
      headers.set("Access-Control-Max-Age", "600");
    }
    if (response.status === 429) headers.set("Retry-After", "60");
    return new Response(response.body, { status: response.status, headers });
  },
};
