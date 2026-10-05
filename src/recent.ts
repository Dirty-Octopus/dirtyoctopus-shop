import { $, api, formatDate, showStatus } from "./common";
import { type CustomerOrder } from "../shared/catalog";
import { recentOrders } from "./storage";
async function showRecent() {
  const list = $("#recent-list");
  let saved;
  try {
    saved = recentOrders();
  } catch {
    list.textContent = "无法读取本设备订单，请检查浏览器存储设置。";
    return;
  }
  if (!saved.length) {
    list.textContent =
      "这台设备还没有订单。购买后，可在这里继续付款或查看处理进度。";
    return;
  }
  list.replaceChildren();
  for (const item of saved) {
    const link = document.createElement("a");
    link.className = "recent-order";
    link.href = `/order/?id=${item.id}`;
    const id = document.createElement("strong");
    id.className = "mono";
    id.textContent = item.id;
    const date = document.createElement("span");
    date.textContent = formatDate(item.created_at);
    const status = document.createElement("span");
    status.textContent = "查看订单状态 →";
    status.className = "status";
    link.append(id, date, status);
    list.append(link);
  }
  // 限制首页自动查询数量，其余订单点击后再实时读取。
  await Promise.allSettled(
    saved.slice(0, 10).map(async (item, index) => {
      const { order } = await api<{ order: CustomerOrder }>(
        `/api/orders/${item.id}`,
        { token: item.token },
      );
      showStatus(
        list.children[index].querySelector(".status") as HTMLElement,
        order,
      );
    }),
  );
}
void showRecent();
