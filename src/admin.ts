import { scrollContentIntoView } from "./portfolio/viewport.js";
import {
  $,
  addDefinition,
  api,
  busy,
  formatDate,
  message,
  orderDetails,
  showStatus,
} from "./common";
import {
  money,
  orderIdPattern,
  statusLabels,
  type AdminOrder,
} from "../shared/catalog";

let selected: AdminOrder | undefined;
let nextCursor: string | null = null;
const rows = new Map<string, AdminOrder>();
const confirmations: Record<string, string> = {
  "verify-payment":
    "我已根据付款截图及自己的微信账单，人工确认收到了此订单的正确金额。",
  complete: "我已通过 QQ / 微信向买家发送 Activation Code，此交易已完成。",
  cancel:
    "我确认取消这笔尚未核验付款的订单。如果买家实际已付款，应先核验并人工退款。",
  refund: "我已在微信中实际完成退款，现在仅记录退款状态。本操作不会自动退钱。",
};
function paintRows() {
  const body = $("#orders");
  body.replaceChildren();
  for (const order of rows.values()) {
    const row = document.createElement("tr");
    const identity = document.createElement("td");
    const button = document.createElement("button");
    button.className = "row-order";
    button.textContent = order.id;
    button.addEventListener("click", () =>
      busy(button, () => openOrder(order.id)),
    );
    const name = document.createElement("small");
    name.textContent = order.product_name;
    identity.append(button, name);
    row.append(identity);
    for (const value of [
      money(order.amount_cents),
      statusLabels[order.status],
      order.wechat_transaction_id ?? "未提交",
      formatDate(order.created_at),
      formatDate(order.payment_reference_submitted_at),
    ]) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    }
    body.append(row);
  }
  $("#empty").hidden = rows.size > 0;
}
async function loadOrders(append = false) {
  const params = new URLSearchParams({
    q: $<HTMLInputElement>("#filter-id").value.trim(),
    status: $<HTMLSelectElement>("#filter-status").value,
    sort: $<HTMLSelectElement>("#filter-sort").value,
    archive: $<HTMLSelectElement>("#filter-archive").value,
  });
  if (append && nextCursor) params.set("cursor", nextCursor);
  const query = "?" + params.toString();
  const data = await api<{ orders: AdminOrder[]; next_cursor: string | null }>(
    `/api/admin/orders${query}`,
    { admin: true },
  );
  if (!append) rows.clear();
  for (const order of data.orders) rows.set(order.id, order);
  nextCursor = data.next_cursor;
  $("#load-more").hidden = !nextCursor;
  paintRows();
}
function renderDetail(order: AdminOrder) {
  selected = order;
  $("#archive-order").textContent = order.archived_at ? "恢复订单" : "归档订单";
  $("#admin-detail").hidden = false;
  $("#detail-title").textContent = order.id;
  showStatus($("#detail-status"), order);
  const list = $("#detail-data");
  orderDetails(list, order);
  for (const [label, value] of [
    ["微信支付交易单号", order.wechat_transaction_id ?? "未提交"],
    ["付款核验时间", formatDate(order.payment_verified_at)],
    ["完成时间", formatDate(order.completed_at)],
    ["取消时间", formatDate(order.cancelled_at)],
    ["退款时间", formatDate(order.refunded_at)],
  ])
    addDefinition(list, label, value);
  $<HTMLTextAreaElement>("#admin-note").value = order.admin_note;
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    "[data-action]",
  )) {
    const allowed =
      button.dataset.action === "verify-payment" ||
      button.dataset.action === "cancel"
        ? ["PENDING_PAYMENT", "PAYMENT_REFERENCE_SUBMITTED"]
        : button.dataset.action === "complete"
          ? ["PAYMENT_VERIFIED"]
          : ["PAYMENT_VERIFIED", "COMPLETED"];
    button.disabled = !allowed.includes(order.status);
  }
}
async function openOrder(id: string) {
  const { order } = await api<{ order: AdminOrder }>(
    `/api/admin/orders/${id}`,
    { admin: true },
  );
  renderDetail(order);
  scrollContentIntoView($("#admin-detail"));
}
function confirmAction(action: string, id: string): Promise<boolean> {
  const dialog = $<HTMLDialogElement>("#confirm-dialog");
  $("#confirm-order-id").textContent = id;
  $("#confirm-description").textContent = confirmations[action];
  dialog.returnValue = "cancel";
  dialog.showModal();
  return new Promise((resolve) =>
    dialog.addEventListener(
      "close",
      () => resolve(dialog.returnValue === "confirm"),
      { once: true },
    ),
  );
}
for (const button of document.querySelectorAll<HTMLButtonElement>(
  "[data-action]",
)) {
  button.addEventListener("click", async () => {
    if (!selected) return;
    const id = selected.id,
      action = button.dataset.action!;
    if (!(await confirmAction(action, id))) return;
    await busy(button, async () => {
      const { order } = await api<{ order: AdminOrder }>(
        `/api/admin/orders/${id}/${action}`,
        { admin: true, body: {} },
      );
      renderDetail(order);
      if (rows.has(id)) rows.set(id, order);
      paintRows();
      message("订单状态已更新。");
    });
    // busy 结束后重新按状态禁用按钮。
    if (selected) renderDetail(selected);
  });
}
$("#note-form").addEventListener("submit", (event) => {
  event.preventDefault();
  void busy($<HTMLButtonElement>("#save-note"), async () => {
    if (!selected) return;
    const { order } = await api<{ order: AdminOrder }>(
      `/api/admin/orders/${selected.id}/note`,
      {
        admin: true,
        body: { admin_note: $<HTMLTextAreaElement>("#admin-note").value },
      },
    );
    renderDetail(order);
    message("备注已保存，仅管理员可见。");
  });
});
$("#find-form").addEventListener("submit", (event) => {
  event.preventDefault();
  void busy($<HTMLButtonElement>("#find-button"), async () => {
    const id = $<HTMLInputElement>("#find-id").value.trim().toUpperCase();
    if (!orderIdPattern.test(id)) throw new Error("请填写完整商店订单号。");
    await openOrder(id);
  });
});
$("#reload").addEventListener("click", (event) =>
  busy(event.currentTarget as HTMLButtonElement, () => loadOrders()),
);
$("#load-more").addEventListener("click", (event) =>
  busy(event.currentTarget as HTMLButtonElement, () => loadOrders(true)),
);
$("#close-detail").addEventListener("click", () => {
  $("#admin-detail").hidden = true;
  selected = undefined;
});
void busy($<HTMLButtonElement>("#reload"), () => loadOrders());

for (const [value, label] of Object.entries(statusLabels)) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  $("#filter-status").append(option);
}
$("#filter-form").onsubmit = (e) => {
  e.preventDefault();
  void busy($<HTMLButtonElement>("#apply-filters"), () => loadOrders());
};
$("#archive-order").onclick = () =>
  void busy($<HTMLButtonElement>("#archive-order"), async () => {
    if (!selected) return;
    const { order } = await api<{ order: AdminOrder }>(
      `/api/admin/orders/${selected.id}/${selected.archived_at ? "unarchive" : "archive"}`,
      { admin: true, body: {} },
    );
    renderDetail(order);
    await loadOrders();
    message(order.archived_at ? "订单已归档。" : "订单已恢复。");
  });
