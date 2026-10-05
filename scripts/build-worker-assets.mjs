import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";

await rm("dist-worker", { recursive: true, force: true });
await mkdir("dist-worker/admin", { recursive: true });
await cp("dist/assets", "dist-worker/assets", { recursive: true });
await cp("dist/console/index.html", "dist-worker/admin/index.html");
// 管理页面只在 Access 保护的 Worker 上提供；Pages 只保留跳转入口。
await rm("dist/console", { recursive: true, force: true });
await writeFile("dist/.nojekyll", "");
// Pages 不支持响应头配置，生产 HTML 使用 CSP meta 且不允许连接本机。
for (const page of ["index.html", "order/index.html"]) {
  const path = `dist/${page}`;
  const html = (await readFile(path, "utf8")).replace(
    / http:\/\/(?:127\.0\.0\.1|localhost):8787| ws:\/\/(?:127\.0\.0\.1|localhost):\*/g,
    "",
  );
  await writeFile(path, html);
}
console.log("Pages → dist；Worker 管理界面 → dist-worker。");
