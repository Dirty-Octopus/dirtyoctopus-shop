import { readFileSync } from "node:fs";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ command, mode }) => {
  const config = JSON.parse(readFileSync("public/site-config.json", "utf8"));
  const apiBase = (
    loadEnv(mode, process.cwd(), "VITE_").VITE_API_BASE ||
    (command === "build" ? config.apiBase : "") ||
    ""
  )
    .trim()
    .replace(/\/$/, "");
  if (apiBase) {
    const url = new URL(apiBase);
    const local =
      command === "serve" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      url.origin !== apiBase ||
      (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
      /REPLACE_ME|YOUR_SUBDOMAIN|\*/i.test(apiBase)
    )
      throw new Error(
        "API 地址必须是完整的 HTTPS origin，不含路径、通配符或占位符。",
      );
  }
  return {
    define: { __SHOP_API_BASE__: JSON.stringify(apiBase) },
    plugins: [
      {
        name: "shop-ready-before-paint",
        transformIndexHtml: {
          order: "post",
          handler: (html) => html.replace(
            /<script type="module"(?![^>]*blocking=)/g,
            '<script type="module" blocking="render"',
          ),
        },
      },
      {
        name: "shop-csp",
        // Vite 开发模式用 style 标签热更新 CSS；生产构建仍只允许外部样式。
        transformIndexHtml: (html) => {
          const development = command === "serve";
          const sources = [
            apiBase,
            development
              ? "http://127.0.0.1:8787 http://localhost:8787 ws://127.0.0.1:* ws://localhost:*"
              : "",
          ]
            .filter(Boolean)
            .join(" ");
          const result = html.replace("__API_CONNECT_SRC__", sources);
          return development
            ? result.replace(
                "style-src 'self'",
                "style-src 'self' 'unsafe-inline'",
              )
            : result;
        },
      },
    ],
    build: {
      rollupOptions: {
        input: [
          "index.html",
          "supporters/index.html",
          "words/index.html",
          "waiting/index.html",
          "console/content/index.html",
          "order/index.html",
          "orders/index.html",
          "contact/index.html",
          "plugins/spectral-corruptor/index.html",
          "admin/index.html",
          "console/index.html",
        ],
      },
    },
  };
});
