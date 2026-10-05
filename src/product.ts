import { $, api, apiBase, busy, copy, loadContacts, message } from "./common";
import { product, type CustomerOrder } from "../shared/catalog";
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
