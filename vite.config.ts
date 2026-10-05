import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    {
      name: "local-style-csp",
      apply: "serve",
      // Vite 开发模式用 style 标签热更新 CSS；生产构建仍只允许外部样式。
      transformIndexHtml: (html) =>
        html.replace("style-src 'self'", "style-src 'self' 'unsafe-inline'"),
    },
  ],
  build: {
    rollupOptions: {
      input: [
        "index.html",
        "order/index.html",
        "admin/index.html",
        "console/index.html",
      ],
    },
  },
});
