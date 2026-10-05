import { cp, mkdir, rm, writeFile } from "node:fs/promises";

await rm("dist-worker", { recursive: true, force: true });
await mkdir("dist-worker/admin", { recursive: true });
await cp("dist/assets", "dist-worker/assets", { recursive: true });
await cp("dist/console", "dist-worker/admin", { recursive: true });
// 管理页面只在 Access 保护的 Worker 上提供；Pages 只保留跳转入口。
await rm("dist/console", { recursive: true, force: true });
await writeFile("dist/.nojekyll", "");
console.log("Pages → dist；Worker 管理界面 → dist-worker。");
