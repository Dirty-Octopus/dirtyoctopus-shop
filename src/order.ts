import {
  $,
  api,
  busy,
  copy,
  loadContacts,
  message,
  orderDetails,
  showStatus,
  text,
  formatDate,
} from "./common";
import {
  money,
  orderIdPattern,
  tokenPattern,
  transactionPattern,
  type CustomerOrder,
} from "../shared/catalog";
import { getSaved, saveOrder } from "./storage";

const id = new URLSearchParams(location.search).get("id") ?? "";
let token = getSaved(id)?.token;
let contactsAvailable = false;
let current: CustomerOrder | undefined;
const submit = $<HTMLButtonElement>("#submit-reference");

function render(order: CustomerOrder) {
  current = order;
  $("#order-content").hidden = false;
  $("#restore-section").hidden = true;
  showStatus($("#order-status"), order);
  orderDetails($("#order-details"), order);
  text("#order-id", order.id);
  text("#order-amount", money(order.amount_cents));
  const editable = ["PENDING_PAYMENT", "PAYMENT_REFERENCE_SUBMITTED"].includes(
    order.status,
  );
  $("#payment-section").hidden = !editable;
  $("#qr-panel").hidden =
    order.status !== "PENDING_PAYMENT" || !contactsAvailable;
  $("#contacts-unavailable").hidden = contactsAvailable;
  $("#after-submission").hidden =
    order.status === "PENDING_PAYMENT" ||
    order.status === "CANCELLED" ||
    order.status === "REFUNDED";
  $("#cancel-notice").hidden = order.status !== "CANCELLED";
  $("#refund-notice").hidden = order.status !== "REFUNDED";
  $("#submitted-notice").hidden =
    order.status !== "PAYMENT_REFERENCE_SUBMITTED";
  $<HTMLInputElement>("#transaction-id").value =
    order.wechat_transaction_id ?? "";
  submit.textContent =
    order.status === "PAYMENT_REFERENCE_SUBMITTED"
      ? "更正交易单号"
      : "提交付款信息";
  text("#recorded-reference", order.wechat_transaction_id || "尚未提交");
  text(
    "#last-updated",
    `最后更新：${formatDate(order.updated_at)}（北京时间）`,
  );
  $<HTMLInputElement>("#access-token").value = token ?? "";
  for (const el of document.querySelectorAll<HTMLElement>("[data-step]")) {
    const stage =
      order.status === "PENDING_PAYMENT"
        ? 1
        : order.status === "PAYMENT_REFERENCE_SUBMITTED"
          ? 2
          : order.status === "PAYMENT_VERIFIED"
            ? 3
            : 4;
    el.classList.toggle(
      "active",
      Number(el.dataset.step) === stage &&
        !["CANCELLED", "REFUNDED"].includes(order.status),
    );
  }
}
async function refresh() {
  const data = await api<{ order: CustomerOrder }>(`/api/orders/${id}`, {
    token,
  });
  render(data.order);
}
async function start() {
  if (!orderIdPattern.test(id)) {
    message("订单号无效，请从首页的本设备订单中进入。", true);
    return;
  }
  text("#order-id", id);
  try {
    contactsAvailable = await loadContacts();
  } catch {
    contactsAvailable = false;
  }
  if (!token) {
    $("#restore-section").hidden = false;
    return;
  }
  try {
    await refresh();
  } catch (error) {
    message((error as Error).message, true);
    $("#restore-section").hidden = false;
  }
}
$("#reference-form").addEventListener("submit", (event) => {
  event.preventDefault();
  void busy(submit, async () => {
    const reference = $<HTMLInputElement>("#transaction-id").value.trim();
    if (!transactionPattern.test(reference))
      throw new Error("请从微信账单复制 10–64 位微信支付交易单号。");
    const { order } = await api<{ order: CustomerOrder }>(
      `/api/orders/${id}/payment-reference`,
      { token, body: { wechat_transaction_id: reference } },
    );
    render(order);
    message(
      "付款信息已提交，等待人工核验。下一步：添加 QQ / 微信并发送订单号、付款截图和 Machine ID。",
    );
    window.scrollBy({
      top: $("#after-submission").getBoundingClientRect().top - 40,
      behavior: "instant",
    });
  });
});
$("#restore-form").addEventListener("submit", (event) => {
  event.preventDefault();
  void busy($<HTMLButtonElement>("#restore-button"), async () => {
    const candidate = $<HTMLInputElement>("#restore-token").value.trim();
    if (!tokenPattern.test(candidate))
      throw new Error("访问凭证格式不正确，请粘贴完整凭证。");
    const { order } = await api<{ order: CustomerOrder }>(`/api/orders/${id}`, {
      token: candidate,
    });
    token = candidate;
    render(order);
    try {
      saveOrder(order, token);
    } catch {
      message("订单已打开，但无法保存到本设备。请保留访问凭证。", true);
    }
  });
});
$("#refresh-order").addEventListener("click", (event) =>
  busy(event.currentTarget as HTMLButtonElement, refresh),
);
$("#copy-id").addEventListener("click", (event) =>
  copy(id, event.currentTarget as HTMLButtonElement),
);
$("#copy-token").addEventListener("click", (event) =>
  copy(token ?? "", event.currentTarget as HTMLButtonElement),
);
$("#copy-handoff").addEventListener("click", (event) =>
  copy(
    `商品：${current?.product_name ?? "Spectral Corruptor"}\n商店订单号：${id}\n（请另附微信付款截图和 Machine ID）`,
    event.currentTarget as HTMLButtonElement,
  ),
);
void start();
