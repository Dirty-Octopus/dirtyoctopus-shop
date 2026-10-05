import type { Env } from "./index";
import { HttpError, onlyFields, readJson } from "./security";
import { orderIdPattern } from "../shared/catalog";
const json = (value: unknown) => Response.json(value);
function text(value: unknown, max: number, required = false): string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value) ||
    (required && !value.trim())
  )
    throw new HttpError(
      400,
      `请输入${required ? "非空、" : ""}不超过 ${max} 字符的文本。`,
    );
  return value.trim();
}
function offset(request: Request) {
  const raw = new URL(request.url).searchParams.get("cursor") ?? "0";
  if (!/^\d{1,7}$/.test(raw)) throw new HttpError(400, "分页参数无效。");
  return Number(raw);
}
export async function publicContent(request: Request, env: Env, path: string) {
  if (request.method !== "GET") throw new HttpError(405, "此页面只提供浏览。");
  if (path === "/api/words") {
    const row = await env.DB.prepare(
      "SELECT body, updated_at FROM site_content WHERE id = ?",
    )
      .bind("words")
      .first();
    return json({ content: row ?? { body: "", updated_at: null } });
  }
  const start = offset(request);
  const { results } = await env.DB.prepare(
    `SELECT s.display_name, s.message, s.created_at FROM supporters s JOIN orders o ON o.id = s.order_id WHERE s.published = ? AND o.status IN (?, ?) ORDER BY s.created_at DESC, s.order_id DESC LIMIT ? OFFSET ?`,
  )
    .bind(1, "PAYMENT_VERIFIED", "COMPLETED", 51, start)
    .all();
  return json({
    supporters: results.slice(0, 50),
    next_cursor: results.length > 50 ? String(start + 50) : null,
  });
}
// Caller verifies Access JWT and same-origin POST before entering this handler.
export async function adminContent(
  request: Request,
  env: Env,
  path: string,
): Promise<Response | null> {
  if (path === "/api/admin/words") {
    if (request.method === "GET")
      return publicContent(request, env, "/api/words");
    if (request.method !== "POST") throw new HttpError(405, "请求方法不支持。");
    const body = await readJson(request);
    onlyFields(body, ["body"]);
    const value = text(body.body, 2000),
      now = new Date().toISOString();
    await env.DB.prepare(
      "INSERT INTO site_content (id, body, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at",
    )
      .bind("words", value, now)
      .run();
    return json({ content: { body: value, updated_at: now } });
  }
  if (path === "/api/admin/supporters") {
    if (request.method !== "GET") throw new HttpError(405, "请求方法不支持。");
    const start = offset(request);
    const { results } = await env.DB.prepare(
      "SELECT s.*, o.status AS order_status FROM supporters s JOIN orders o ON o.id = s.order_id ORDER BY s.created_at DESC, s.order_id DESC LIMIT ? OFFSET ?",
    )
      .bind(51, start)
      .all();
    return json({
      supporters: results.slice(0, 50),
      next_cursor: results.length > 50 ? String(start + 50) : null,
    });
  }
  const match = path.match(/^\/api\/admin\/supporters\/(DO-[A-F0-9]{16})$/);
  if (!match) return null;
  const id = match[1];
  if (!orderIdPattern.test(id)) throw new HttpError(400, "订单号无效。");
  if (request.method === "GET")
    return json({
      supporter: await env.DB.prepare(
        "SELECT * FROM supporters WHERE order_id = ?",
      )
        .bind(id)
        .first(),
    });
  if (request.method !== "POST") throw new HttpError(405, "请求方法不支持。");
  const body = await readJson(request);
  onlyFields(body, ["display_name", "message", "published"]);
  const name = text(body.display_name, 60, true),
    message = text(body.message, 1000);
  if (typeof body.published !== "boolean")
    throw new HttpError(400, "请选择公开状态。");
  const now = new Date().toISOString();
  // One row per paid order, even on repeated/concurrent saves. Never create unpaid entries.
  const result = await env.DB.prepare(
    `INSERT INTO supporters (order_id, display_name, message, published, created_at, updated_at)
    SELECT id, ?, ?, ?, ?, ? FROM orders WHERE id = ? AND (status IN (?, ?) OR (? = 0 AND EXISTS (SELECT 1 FROM supporters WHERE order_id = ?)))
    ON CONFLICT(order_id) DO UPDATE SET display_name = excluded.display_name, message = excluded.message, published = excluded.published, updated_at = excluded.updated_at`,
  )
    .bind(
      name,
      message,
      body.published ? 1 : 0,
      now,
      now,
      id,
      "PAYMENT_VERIFIED",
      "COMPLETED",
      body.published ? 1 : 0,
      id,
    )
    .run();
  if (!result.meta.changes)
    throw new HttpError(
      409,
      "仅已核验付款或已完成订单可以公开留名；退款订单仅可保存为隐藏。",
    );
  return json({ ok: true });
}
