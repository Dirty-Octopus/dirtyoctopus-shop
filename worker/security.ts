import { createRemoteJWKSet, customFetch, jwtVerify } from "jose";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const MAX_BODY_BYTES = 8192;

export async function readJson(
  request: Request,
): Promise<Record<string, unknown>> {
  if (
    !/^application\/json(?:\s*;|$)/i.test(
      request.headers.get("content-type") ?? "",
    )
  ) {
    throw new HttpError(415, "请使用 application/json。");
  }
  const declared = request.headers.get("content-length");
  if (
    declared &&
    (!/^\d+$/.test(declared) || Number(declared) > MAX_BODY_BYTES)
  ) {
    throw new HttpError(413, "请求内容过大。");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "请求正文不能为空。");
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new HttpError(413, "请求内容过大。");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    const value: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes),
    );
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "JSON 格式不正确。");
  }
}

export function onlyFields(body: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(body).some((key) => !allowed.includes(key)))
    throw new HttpError(400, "请求包含不支持的字段。");
}
export async function sha256(value: string): Promise<string> {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  )
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
export function randomHex(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}
export function randomToken(): string {
  return btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
  )
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
export async function verifyAccess(
  request: Request,
  env: { ACCESS_TEAM_DOMAIN: string; ACCESS_AUD: string },
) {
  if (
    !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(
      env.ACCESS_TEAM_DOMAIN ?? "",
    ) ||
    !env.ACCESS_AUD ||
    env.ACCESS_AUD === "REPLACE_ME"
  ) {
    throw new HttpError(503, "管理员认证尚未配置。");
  }
  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token || token.length > 8192)
    throw new HttpError(401, "请通过 Cloudflare Access 登录。");
  try {
    let jwks = keySets.get(env.ACCESS_TEAM_DOMAIN);
    if (!jwks) {
      jwks = createRemoteJWKSet(
        new URL(`${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`),
        {
          timeoutDuration: 5000,
          [customFetch]: (...args) => fetch(...args),
        },
      );
      keySets.set(env.ACCESS_TEAM_DOMAIN, jwks);
    }
    const { payload } = await jwtVerify(token, jwks, {
      issuer: env.ACCESS_TEAM_DOMAIN,
      audience: env.ACCESS_AUD,
      algorithms: ["RS256"],
      requiredClaims: ["exp", "iat", "sub", "email"],
      clockTolerance: 5,
    });
    if (
      typeof payload.email !== "string" ||
      !payload.email.includes("@") ||
      !payload.sub
    )
      throw new Error();
  } catch {
    throw new HttpError(
      401,
      "管理员登录已失效，请重新通过 Cloudflare Access 登录。",
    );
  }
}
