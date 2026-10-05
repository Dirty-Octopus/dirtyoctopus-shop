import { readFile } from "node:fs/promises";
import { parse, printParseErrorCode } from "jsonc-parser";
const config = JSON.parse(await readFile("public/site-config.json", "utf8"));
const errors = [];
const worker = parse(await readFile("wrangler.jsonc", "utf8"), errors, {
  allowTrailingComma: true,
});
if (errors.length)
  throw new Error(
    `wrangler.jsonc 格式错误：${errors.map((error) => printParseErrorCode(error.error)).join(", ")}`,
  );
const missing = [];
try {
  const url = new URL(config.apiBase);
  if (
    url.protocol !== "https:" ||
    url.origin !== config.apiBase ||
    !/^dirtyoctopus-shop-api\.[a-z0-9-]+\.workers\.dev$/.test(url.hostname) ||
    /REPLACE_ME|YOUR_SUBDOMAIN/i.test(config.apiBase)
  )
    throw new Error("invalid origin");
} catch {
  missing.push(
    "public/site-config.json：apiBase 填写实际部署的 https://dirtyoctopus-shop-api.<你的子域>.workers.dev",
  );
}
if (!worker.workers_dev || worker.routes?.length)
  missing.push(
    "wrangler.jsonc：保留 workers_dev: true，不配置自定义域名 routes",
  );
if (
  ![config.qq, config.wechat].some(
    (value) =>
      typeof value === "string" && value.trim() && value !== "REPLACE_ME",
  )
)
  missing.push("public/site-config.json：至少填写一个有效 QQ / 微信联系方式");
if (worker.vars.ACCESS_TEAM_DOMAIN.includes("REPLACE_ME"))
  missing.push("wrangler.jsonc：ACCESS_TEAM_DOMAIN");
if (worker.vars.ACCESS_AUD === "REPLACE_ME")
  missing.push("wrangler.jsonc：ACCESS_AUD");
if (worker.d1_databases[0].database_id.startsWith("00000000"))
  missing.push("wrangler.jsonc：D1 database_id");
if (missing.length) {
  console.error(
    "上线前还需填写：\n" + missing.map((value) => `- ${value}`).join("\n"),
  );
  process.exitCode = 1;
} else
  console.log(
    "静态配置检查通过。仍需在线验证 Access 策略、DNS、TLS、付款码和完整人工订单流程。",
  );
