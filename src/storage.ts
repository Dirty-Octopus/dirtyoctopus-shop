import {
  orderIdPattern,
  tokenPattern,
  type CustomerOrder,
} from "../shared/catalog";
const prefix = "dirtyoctopus.order.v1.";
export interface SavedOrder {
  id: string;
  token: string;
  created_at: string;
}
export function saveOrder(
  order: Pick<CustomerOrder, "id" | "created_at">,
  token: string,
) {
  if (!orderIdPattern.test(order.id) || !tokenPattern.test(token))
    throw new Error("订单凭证格式异常。");
  localStorage.setItem(
    prefix + order.id,
    JSON.stringify({ id: order.id, token, created_at: order.created_at }),
  );
}
export function getSaved(id: string): SavedOrder | undefined {
  try {
    const value = JSON.parse(
      localStorage.getItem(prefix + id) ?? "null",
    ) as SavedOrder | null;
    if (
      value &&
      value.id === id &&
      orderIdPattern.test(value.id) &&
      tokenPattern.test(value.token) &&
      typeof value.created_at === "string" &&
      Number.isFinite(Date.parse(value.created_at))
    )
      return value;
  } catch {
    /* 损坏或不可用的本地存储不作为可信凭证。 */
  }
}
export function recentOrders(): SavedOrder[] {
  const result: SavedOrder[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(prefix)) {
      const saved = getSaved(key.slice(prefix.length));
      if (saved) result.push(saved);
    }
  }
  return result.sort((a, b) => b.created_at.localeCompare(a.created_at));
}
export function checkStorage() {
  const key = `${prefix}probe`;
  try {
    localStorage.setItem(key, "1");
    localStorage.removeItem(key);
  } catch {
    throw new Error(
      "浏览器无法保存订单凭证，请允许此网站使用本地存储后再购买。",
    );
  }
}
