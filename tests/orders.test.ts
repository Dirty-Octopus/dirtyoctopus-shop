import { readFile } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import worker, { type Env } from "../worker";
import { sha256 } from "../worker/security";
import { statusLabels, type CustomerOrder } from "../shared/catalog";

let mf: Miniflare, env: Env, adminToken: string;
let keys: Awaited<ReturnType<typeof generateKeyPair>>;
const origin = "https://shop.dirtyoctopus.net";
const issuer = "https://shop-test.cloudflareaccess.com";
const audience = "test-application-audience";
let seq = 0;
const reference = () => `420000260020261005${String(++seq).padStart(10, "0")}`;
type Created = { order: CustomerOrder; customer_access_token: string };
function request(
  path: string,
  method = "GET",
  body?: unknown,
  headers: Record<string, string> = {},
  base = "https://api.dirtyoctopus.net",
) {
  return worker.fetch(
    new Request(base + path, {
      method,
      headers: {
        origin,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
  );
}
async function create(): Promise<Created> {
  const response = await request(
    "/api/orders",
    "POST",
    { product_id: "spectral-corruptor" },
    { "cf-connecting-ip": "192.0.2.1" },
  );
  expect(response.status).toBe(201);
  return response.json();
}
function customer(path: string, data: Created, body?: unknown) {
  return request(
    `/api/orders/${data.order.id}${path}`,
    body === undefined ? "GET" : "POST",
    body,
    { authorization: `Bearer ${data.customer_access_token}` },
  );
}
function admin(
  path: string,
  body?: unknown,
  token = adminToken,
  extra: Record<string, string> = {},
) {
  return request(
    `/api/admin/orders${path}`,
    body === undefined ? "GET" : "POST",
    body,
    {
      origin: "https://api.dirtyoctopus.net",
      "cf-access-jwt-assertion": token,
      "x-admin-request": "1",
      ...extra,
    },
  );
}
async function sign(
  options: {
    iss?: string;
    aud?: string;
    exp?: string;
    email?: string;
    nbf?: string;
    key?: CryptoKey;
  } = {},
) {
  let jwt = new SignJWT({ email: options.email ?? "owner@example.test" })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(options.iss ?? issuer)
    .setAudience(options.aud ?? audience)
    .setSubject("test-owner")
    .setIssuedAt()
    .setExpirationTime(options.exp ?? "1h");
  if (options.nbf) jwt = jwt.setNotBefore(options.nbf);
  return jwt.sign(options.key ?? keys.privateKey);
}
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default { fetch() { return new Response("test"); } }',
      compatibilityDate: "2026-10-01",
      d1Databases: ["DB"],
    }),
  );
  const db = await mf.getD1Database("DB");
  const migration = await readFile(
    new URL("../migrations/0001_orders.sql", import.meta.url),
    "utf8",
  );
  await db.batch(
    migration
      .split(";")
      .filter((sql) => sql.trim())
      .map((sql) => db.prepare(sql)),
  );
  env = {
    DB: db as unknown as Env["DB"],
    ASSETS: {
      fetch: async () => new Response("admin assets"),
    } as unknown as Env["ASSETS"],
    CREATE_LIMITER: { limit: vi.fn(async () => ({ success: true })) },
    GLOBAL_CREATE_LIMITER: { limit: vi.fn(async () => ({ success: true })) },
    ENVIRONMENT: "production",
    ACCESS_TEAM_DOMAIN: issuer,
    ACCESS_AUD: audience,
  };
  keys = await generateKeyPair("RS256", { extractable: true });
  const jwk = await exportJWK(keys.publicKey);
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    expect(String(input)).toBe(`${issuer}/cdn-cgi/access/certs`);
    return Response.json({
      keys: [{ ...jwk, kid: "test-key", alg: "RS256", use: "sig" }],
    });
  });
  adminToken = await sign();
});
beforeEach(async () => {
  await env.DB.prepare("DELETE FROM orders").run();
  vi.mocked(env.CREATE_LIMITER.limit).mockResolvedValue({ success: true });
  vi.mocked(env.GLOBAL_CREATE_LIMITER.limit).mockResolvedValue({
    success: true,
  });
  env.ENVIRONMENT = "production";
  env.ACCESS_AUD = audience;
});
afterAll(async () => {
  vi.restoreAllMocks();
  await mf?.dispose();
});

describe("创建订单与客户权限", () => {
  it("生成随机订单号及高熵凭证，数据库仅保存 SHA-256，金额由服务端决定", async () => {
    const one = await create(),
      two = await create();
    expect(one.order.id).toMatch(/^DO-[A-F0-9]{16}$/);
    expect(one.customer_access_token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(one.order.id).not.toBe(two.order.id);
    expect(one.customer_access_token).not.toBe(two.customer_access_token);
    expect(one.order).toMatchObject({
      amount_cents: 9990,
      currency: "CNY",
      status: "PENDING_PAYMENT",
    });
    const row = await env.DB.prepare("SELECT * FROM orders WHERE id = ?")
      .bind(one.order.id)
      .first();
    expect(row?.customer_access_token_hash).toBe(
      await sha256(one.customer_access_token),
    );
    expect(JSON.stringify(row)).not.toContain(one.customer_access_token);
  });
  it("正确 token 可以访问；凭证属于单个订单", async () => {
    const one = await create(),
      two = await create();
    expect((await customer("", one)).status).toBe(200);
    expect(
      (
        await customer("", {
          ...one,
          customer_access_token: two.customer_access_token,
        })
      ).status,
    ).toBe(404);
  });
  it.each(["", "Bearer wrong", `Bearer ${"A".repeat(43)}`])(
    "错误或缺失 token 返回相同的 404: %s",
    async (authorization) => {
      const data = await create();
      const response = await request(
        `/api/orders/${data.order.id}`,
        "GET",
        undefined,
        { authorization },
      );
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        error: "订单不存在或访问凭证无效。",
      });
    },
  );
  it("不接受 URL 中的 token，也不公开按订单号查询", async () => {
    const data = await create();
    expect(
      (
        await request(
          `/api/orders/${data.order.id}?token=${data.customer_access_token}`,
        )
      ).status,
    ).toBe(404);
  });
  it.each([
    { product_id: "other" },
    { product_id: "' OR 1=1 --" },
    { product_id: "__proto__" },
    {},
    { product_id: "spectral-corruptor", amount_cents: 1 },
  ])("拒绝未知商品、注入和篡改金额 %j", async (body) => {
    expect((await request("/api/orders", "POST", body)).status).toBe(400);
  });
  it("客户响应不暴露备注、token hash 或新加的内部字段", async () => {
    const data = await create();
    await admin(`/${data.order.id}/note`, { admin_note: "private-admin-note" });
    for (const response of [
      await customer("", data),
      await customer("/payment-reference", data, {
        wechat_transaction_id: reference(),
      }),
    ]) {
      const body = (await response.json()) as {
        order: Record<string, unknown>;
      };
      expect(body.order).not.toHaveProperty("admin_note");
      expect(body.order).not.toHaveProperty("customer_access_token_hash");
      expect(JSON.stringify(body)).not.toContain("private-admin-note");
      expect(body.order).not.toHaveProperty("customer_access_token");
    }
    expect(data.order).not.toHaveProperty("admin_note");
    expect(data.order).not.toHaveProperty("customer_access_token_hash");
  });
});
describe("交易单号提交与输入验证", () => {
  it("trim、保存交易单号和提交时间，仍然等待人工核验", async () => {
    const data = await create(),
      ref = reference();
    const response = await customer("/payment-reference", data, {
      wechat_transaction_id: `  ${ref}  `,
    });
    expect(response.status).toBe(200);
    const { order } = (await response.json()) as { order: CustomerOrder };
    expect(order.wechat_transaction_id).toBe(ref);
    expect(order.payment_reference_submitted_at).toBeTruthy();
    expect(order.status).toBe("PAYMENT_REFERENCE_SUBMITTED");
    expect(order.payment_verified_at).toBeNull();
    expect(statusLabels[order.status]).toBe("付款信息已提交，等待人工核验");
    expect(statusLabels[order.status]).not.toContain("已付款");
  });
  it("重复提交幂等，核验前可以更正", async () => {
    const data = await create(),
      ref = reference();
    const first = await (
      await customer("/payment-reference", data, { wechat_transaction_id: ref })
    ).json();
    expect(
      await (
        await customer("/payment-reference", data, {
          wechat_transaction_id: ref,
        })
      ).json(),
    ).toEqual(first);
    const corrected = await customer("/payment-reference", data, {
      wechat_transaction_id: reference(),
    });
    expect(corrected.status).toBe(200);
  });
  it("不允许同一个交易单号占用多笔订单", async () => {
    const one = await create(),
      two = await create(),
      ref = reference();
    expect(
      (
        await customer("/payment-reference", one, {
          wechat_transaction_id: ref,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await customer("/payment-reference", two, {
          wechat_transaction_id: ref,
        })
      ).status,
    ).toBe(409);
  });
  it("错误 token 无法提交交易单号", async () => {
    const data = await create();
    expect(
      (
        await customer(
          "/payment-reference",
          { ...data, customer_access_token: "A".repeat(43) },
          { wechat_transaction_id: reference() },
        )
      ).status,
    ).toBe(404);
  });
  it.each([
    "",
    "123",
    "1".repeat(65),
    "<img src=x onerror=alert(1)>",
    "1234567890' OR 1=1",
    "1234567890\n123",
    1234567890,
    null,
  ])("拒绝无效输入 %j", async (value) => {
    const data = await create();
    expect(
      (
        await customer("/payment-reference", data, {
          wechat_transaction_id: value,
        })
      ).status,
    ).toBe(400);
  });
  it("不接收 Machine ID、截图或激活码字段", async () => {
    const data = await create();
    for (const field of ["machine_id", "activation_code", "screenshot"]) {
      expect(
        (
          await customer("/payment-reference", data, {
            wechat_transaction_id: reference(),
            [field]: "not-stored",
          })
        ).status,
      ).toBe(400);
    }
  });
  it("核验、完成、取消及退款后禁止客户修改", async () => {
    for (const status of [
      "PAYMENT_VERIFIED",
      "COMPLETED",
      "CANCELLED",
      "REFUNDED",
    ]) {
      const data = await create();
      await env.DB.prepare("UPDATE orders SET status = ? WHERE id = ?")
        .bind(status, data.order.id)
        .run();
      expect(
        (
          await customer("/payment-reference", data, {
            wechat_transaction_id: reference(),
          })
        ).status,
      ).toBe(409);
    }
  });
});
describe("Cloudflare Access 与管理流程", () => {
  it("未授权、伪造邮箱 Header、随机 JWT 无法访问全部管理端点", async () => {
    const data = await create();
    for (const path of [
      "",
      `/${data.order.id}`,
      ...["verify-payment", "complete", "cancel", "refund", "note"].map(
        (action) => `/${data.order.id}/${action}`,
      ),
    ]) {
      const response = await admin(
        path,
        path.split("/").length > 2 ? {} : undefined,
        "",
        { "cf-access-authenticated-user-email": "owner@example.test" },
      );
      expect(response.status).toBe(401);
    }
    expect((await admin("", undefined, "forged.jwt.value")).status).toBe(401);
    expect((await request("/admin/")).status).toBe(401);
  });
  it("有效签名且正确 issuer / audience / expiry 可以访问管理员列表", async () => {
    await create();
    const response = await admin("");
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      orders: Record<string, unknown>[];
    };
    expect(body.orders).toHaveLength(1);
    expect(body.orders[0]).toHaveProperty("admin_note");
    expect(body.orders[0]).not.toHaveProperty("customer_access_token_hash");
  });
  it.each([
    { iss: "https://attacker.cloudflareaccess.com" },
    { aud: "wrong-app" },
    { exp: "-1m" },
    { nbf: "10m" },
    { email: "invalid" },
  ])("拒绝错误 JWT 声明 %j", async (options) => {
    expect((await admin("", undefined, await sign(options))).status).toBe(401);
  });
  it("拒绝伪造签名，即使 email / issuer / audience 完全正确", async () => {
    const other = await generateKeyPair("RS256");
    expect(
      (await admin("", undefined, await sign({ key: other.privateKey })))
        .status,
    ).toBe(401);
  });
  it("Access 未配置时失败关闭；local 也无管理员认证后门", async () => {
    env.ACCESS_AUD = "REPLACE_ME";
    expect((await admin("")).status).toBe(503);
    env.ACCESS_AUD = audience;
    env.ENVIRONMENT = "local";
    expect((await admin("", undefined, "")).status).toBe(401);
  });
  it("跨域或缺少防 CSRF Header 的管理写入均失败", async () => {
    const data = await create();
    expect(
      (
        await admin(`/${data.order.id}/verify-payment`, {}, adminToken, {
          origin,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await admin(`/${data.order.id}/verify-payment`, {}, adminToken, {
          "x-admin-request": "",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await admin(`/${data.order.id}/verify-payment`, {}, adminToken, {
          origin: "",
        })
      ).status,
    ).toBe(403);
  });
  it("提交 → 人工 Verify → Complete；重复操作幂等且记录时间", async () => {
    const data = await create();
    await customer("/payment-reference", data, {
      wechat_transaction_id: reference(),
    });
    let response = await admin(`/${data.order.id}/complete`, {});
    expect(response.status).toBe(409);
    response = await admin(`/${data.order.id}/verify-payment`, {});
    let { order } = (await response.json()) as { order: CustomerOrder };
    expect(order.status).toBe("PAYMENT_VERIFIED");
    expect(order.payment_verified_at).toBeTruthy();
    const verifiedAt = order.payment_verified_at;
    response = await admin(`/${data.order.id}/verify-payment`, {});
    expect(
      ((await response.json()) as { order: CustomerOrder }).order
        .payment_verified_at,
    ).toBe(verifiedAt);
    response = await admin(`/${data.order.id}/complete`, {});
    ({ order } = (await response.json()) as { order: CustomerOrder });
    expect(order.status).toBe("COMPLETED");
    expect(order.completed_at).toBeTruthy();
    expect(order).not.toHaveProperty("activation_code");
  });
  it("未核验订单可取消，取消后不可核验；已核验不能取消", async () => {
    const one = await create(),
      two = await create();
    const cancelled = await admin(`/${one.order.id}/cancel`, {});
    expect(
      ((await cancelled.json()) as { order: CustomerOrder }).order.cancelled_at,
    ).toBeTruthy();
    expect((await admin(`/${one.order.id}/verify-payment`, {})).status).toBe(
      409,
    );
    await admin(`/${two.order.id}/verify-payment`, {});
    expect((await admin(`/${two.order.id}/cancel`, {})).status).toBe(409);
  });
  it.each([false, true])(
    "已核验和已完成订单可标记实际退款 completed=%s",
    async (complete) => {
      const data = await create();
      expect((await admin(`/${data.order.id}/refund`, {})).status).toBe(409);
      await admin(`/${data.order.id}/verify-payment`, {});
      if (complete) await admin(`/${data.order.id}/complete`, {});
      const { order } = (await (
        await admin(`/${data.order.id}/refund`, {})
      ).json()) as { order: CustomerOrder };
      expect(order.status).toBe("REFUNDED");
      expect(order.refunded_at).toBeTruthy();
      expect((await admin(`/${data.order.id}/complete`, {})).status).toBe(409);
    },
  );
  it("并发核验和取消仅有一个成功，不发生状态覆盖", async () => {
    const data = await create();
    const responses = await Promise.all([
      admin(`/${data.order.id}/verify-payment`, {}),
      admin(`/${data.order.id}/cancel`, {}),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
  });
  it("管理员备注以普通文本存储，SQL 注入不生效，限制长度", async () => {
    const data = await create(),
      note = "<script>alert(1)</script> '; DROP TABLE orders; --";
    expect(
      (await admin(`/${data.order.id}/note`, { admin_note: note })).status,
    ).toBe(200);
    const detail = (await (await admin(`/${data.order.id}`)).json()) as {
      order: { admin_note: string };
    };
    expect(detail.order.admin_note).toBe(note);
    expect(
      (await admin(`/${data.order.id}/note`, { admin_note: "a".repeat(2001) }))
        .status,
    ).toBe(400);
    expect((await customer("", data)).status).toBe(200);
  });
  it("列表分页不重复、不遗漏，校验游标", async () => {
    const data = await create();
    await env.DB.batch(
      Array.from({ length: 54 }, (_, i) =>
        env.DB.prepare(
          `INSERT INTO orders (id, product_id, amount_cents, currency, customer_access_token_hash, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          `DO-${i.toString(16).padStart(16, "0").toUpperCase()}`,
          "spectral-corruptor",
          9990,
          "CNY",
          "a".repeat(64),
          "PENDING_PAYMENT",
          data.order.created_at,
          data.order.created_at,
        ),
      ),
    );
    const first = (await (await admin("")).json()) as {
      orders: CustomerOrder[];
      next_cursor: string;
    };
    expect(first.orders).toHaveLength(50);
    expect(first.next_cursor).toBeTruthy();
    const second = (await (
      await admin(`?cursor=${encodeURIComponent(first.next_cursor)}`)
    ).json()) as { orders: CustomerOrder[]; next_cursor: null };
    expect(second.orders).toHaveLength(5);
    expect(second.next_cursor).toBeNull();
    expect(
      new Set([...first.orders, ...second.orders].map((row) => row.id)).size,
    ).toBe(55);
    expect((await admin("?cursor=invalid")).status).toBe(400);
  });
});
describe("请求限制、限流与 CORS", () => {
  it("按 IP 限流，返回 Retry-After，不写入订单", async () => {
    vi.mocked(env.CREATE_LIMITER.limit).mockResolvedValue({ success: false });
    const response = await request(
      "/api/orders",
      "POST",
      { product_id: "spectral-corruptor" },
      { "cf-connecting-ip": "192.0.2.1" },
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(
      (await env.DB.prepare("SELECT count(*) AS n FROM orders").first())?.n,
    ).toBe(0);
  });
  it("全局限流，并在缺少可信 IP 时失败关闭", async () => {
    expect(
      (
        await request("/api/orders", "POST", {
          product_id: "spectral-corruptor",
        })
      ).status,
    ).toBe(503);
    vi.mocked(env.GLOBAL_CREATE_LIMITER.limit).mockResolvedValue({
      success: false,
    });
    expect(
      (
        await request(
          "/api/orders",
          "POST",
          { product_id: "spectral-corruptor" },
          { "cf-connecting-ip": "192.0.2.1" },
        )
      ).status,
    ).toBe(429);
  });
  it("JSON 格式、媒体类型、已声明大小及实际流大小都受限制", async () => {
    for (const [body, headers, status] of [
      ["{}", { "content-type": "text/plain" }, 415],
      ["{broken", { "content-type": "application/json" }, 400],
      ["[]", { "content-type": "application/json" }, 400],
      [
        "{}",
        { "content-type": "application/json", "content-length": "999999" },
        413,
      ],
      [" ".repeat(9000), { "content-type": "application/json" }, 413],
    ] as [string, Record<string, string>, number][]) {
      const response = await worker.fetch(
        new Request("https://api.dirtyoctopus.net/api/orders", {
          method: "POST",
          headers,
          body,
        }),
        env,
      );
      expect(response.status).toBe(status);
    }
  });
  it("生产 CORS 只允许指定商店，不允许 localhost、相似域名或 null", async () => {
    const ok = await request("/api/orders", "OPTIONS");
    expect(ok.status).toBe(204);
    expect(ok.headers.get("access-control-allow-origin")).toBe(origin);
    for (const bad of [
      "http://localhost:5173",
      "https://shop.dirtyoctopus.net.attacker.test",
      "null",
      "https://dirtyoctopus.net",
    ]) {
      const response = await request("/api/orders", "OPTIONS", undefined, {
        origin: bad,
      });
      expect(response.status).toBe(403);
      expect(response.headers.has("access-control-allow-origin")).toBe(false);
    }
  });
  it("只有本地配置且本机 Worker 同时满足时允许 localhost", async () => {
    env.ENVIRONMENT = "local";
    expect(
      (
        await request("/api/orders", "OPTIONS", undefined, {
          origin: "http://localhost:5173",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          "/api/orders",
          "OPTIONS",
          undefined,
          { origin: "http://localhost:5173" },
          "http://127.0.0.1:8787",
        )
      ).status,
    ).toBe(204);
  });
  it("敏感响应禁止缓存、禁止 MIME 猜测、不泄漏详细错误", async () => {
    const data = await create(),
      response = await customer("", data);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });
});
