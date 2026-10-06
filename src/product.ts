import { $, api, apiBase, busy, copy, loadContacts, message } from "./common";
import { product, type CustomerOrder } from "../shared/catalog";
import { SALE_START_MS } from "../shared/launch";
import { checkStorage, saveOrder } from "./storage";

const buy = $<HTMLButtonElement>("#buy");
loadContacts()
  .then((ready) => {
    buy.disabled = !ready || !apiBase;
    if (!ready || !apiBase) {
      $("#setup-notice").hidden = false;
    }
  })
  .catch((error) => message(error.message, true));

buy.addEventListener("click", () =>
  busy(buy, async () => {
    const sale = await api<{ open: boolean }>("/api/sale");
    if (!sale.open) {
      location.assign("/waiting/");
      return;
    }
    checkStorage();
    const data = await api<{
      order: CustomerOrder;
      customer_access_token: string;
    }>("/api/orders", { body: { product_id: product.id } });
    try {
      saveOrder(data.order, data.customer_access_token);
    } catch {
      // 创建成功但存储失败时，把仅返回一次的凭证保留在当前页面，不能悄悄丢失。
      $("#recovery-backup").hidden = false;
      $("#backup-id").textContent = data.order.id;
      $<HTMLInputElement>("#backup-token").value = data.customer_access_token;
      $<HTMLAnchorElement>("#backup-order-link").href =
        `/order/?id=${data.order.id}`;
      message(
        "订单已创建，但浏览器未能保存凭证。请先复制下方访问凭证，再进入订单页面。",
        true,
      );
      return;
    }
    location.assign(`/order/?id=${data.order.id}`);
  }),
);
$("#copy-backup").addEventListener("click", (event) =>
  copy(
    $<HTMLInputElement>("#backup-token").value,
    event.currentTarget as HTMLButtonElement,
  ),
);

import "./demo";

// Public downloads follow sale timing; purchasing and activation are separate.
const downloads = [
  { id: "#download-windows", label: "Windows", url: "https://github.com/Dirty-Octopus/spectral-corruptor-plugin/releases/latest/download/SpectralCorruptor-Windows.zip" },
  { id: "#download-macos", label: "macOS", url: "https://github.com/Dirty-Octopus/spectral-corruptor-plugin/releases/latest/download/SpectralCorruptor-macOS.zip" },
];
let downloadOpen = false;
let checkingDownloads = false;
let downloadClockOffset = 0;
async function refreshDownloads() {
  if (checkingDownloads || downloadOpen) return;
  checkingDownloads = true;
  try {
    const sale = await api<{ open: boolean; server_now: number }>("/api/sale");
    downloadClockOffset = sale.server_now - Date.now();
    if (!sale.open) return;
    downloadOpen = true;
    for (const item of downloads) {
      const link = document.createElement("a");
      link.id = item.id.slice(1);
      link.className = "button primary";
      link.href = item.url;
      link.textContent = `${item.label} · 直接下载 ↓`;
      $(item.id).replaceWith(link);
    }
    $("#download-status").textContent = "下载已开放 · 选择你的系统";
  } catch {
    $("#download-status").textContent = "下载未开放 · 暂时无法确认开售状态，正在重试";
  } finally {
    checkingDownloads = false;
  }
}
void refreshDownloads();
const downloadTimer = window.setInterval(() => {
  if (downloadOpen) window.clearInterval(downloadTimer);
  else if (Date.now() + downloadClockOffset >= SALE_START_MS) void refreshDownloads();
}, 1000);
window.setInterval(() => void refreshDownloads(), 30000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) void refreshDownloads();
});
