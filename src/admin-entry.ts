import { apiBase, $ } from "./common";
if (apiBase) {
  const destination = `${apiBase}/admin/`;
  $<HTMLAnchorElement>("#admin-link").href = destination;
  $("#admin-link").hidden = false;
  location.replace(destination);
} else {
  $("#admin-message").textContent =
    "管理后台尚未连接。请先部署 Worker，再填写 public/site-config.json 的 apiBase 并重新发布。";
}
