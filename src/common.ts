import "@fontsource/barlow-condensed/latin-500.css";
import "@fontsource/barlow-condensed/latin-600.css";
import "@fontsource/barlow-condensed/latin-700.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "./style.css";
import "./visual-shell.js";
import { money, statusLabels, type CustomerOrder } from "../shared/catalog";

export const local = ["localhost", "127.0.0.1", "[::1]"].includes(
  location.hostname,
);
export const apiBase = (
  __SHOP_API_BASE__ ||
  (import.meta.env.DEV && local ? "http://127.0.0.1:8787" : "")
).replace(/\/$/, "");
export const $ = <T extends HTMLElement = HTMLElement>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
};
export function text(selector: string, value: string) {
  $(selector).textContent = value;
}
export function message(value: string, error = false) {
  const box = $("#message");
  box.textContent = value;
  box.hidden = !value;
  box.classList.toggle("error", error);
}
export async function api<T>(
  path: string,
  options: { token?: string; body?: unknown; admin?: boolean } = {},
): Promise<T> {
  if (!options.admin && !apiBase)
    throw new Error(
      "商店正在准备上线，暂未开放购买。已有订单请联系 QQ / 微信查询。",
    );
  const headers: Record<string, string> = {};
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.admin) headers["X-Admin-Request"] = "1";
  let response: Response;
  try {
    response = await fetch(`${options.admin ? "" : apiBase}${path}`, {
      method: options.body === undefined ? "GET" : "POST",
      headers,
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: options.admin ? "same-origin" : "omit",
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
      redirect: options.admin ? "error" : "follow",
    });
  } catch {
    throw new Error(
      options.admin
        ? "管理连接失败或登录已过期，请刷新页面重新登录。"
        : "连接未完成，请检查网络后刷新订单。若已付款，请勿重复支付。",
    );
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || !data)
    throw new Error(data?.error || "服务响应异常，请刷新页面后重试。");
  return data as T;
}
export async function busy(
  button: HTMLButtonElement,
  work: () => Promise<void>,
) {
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  message("");
  try {
    await work();
  } catch (error) {
    message(
      error instanceof Error ? error.message : "操作失败，请重试。",
      true,
    );
  } finally {
    button.disabled = false;
    button.removeAttribute("aria-busy");
  }
}
export function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("zh-CN", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Shanghai",
      }).format(new Date(value))
    : "尚未记录";
}
export function showStatus(element: HTMLElement, order: CustomerOrder) {
  element.textContent = statusLabels[order.status];
  element.dataset.status = order.status;
}
export function addDefinition(list: HTMLElement, label: string, value: string) {
  const pair = document.createElement("div");
  const dt = document.createElement("dt");
  dt.textContent = label;
  const dd = document.createElement("dd");
  dd.textContent = value;
  pair.append(dt, dd);
  list.append(pair);
}
export function orderDetails(list: HTMLElement, order: CustomerOrder) {
  list.replaceChildren();
  for (const [label, value] of [
    ["订单号", order.id],
    ["商品", order.product_name],
    ["金额", `${money(order.amount_cents)} ${order.currency}`],
    ["创建时间", formatDate(order.created_at)],
    ["交易单号提交时间", formatDate(order.payment_reference_submitted_at)],
  ])
    addDefinition(list, label, value);
}
export interface SiteConfig {
  qq: string;
  wechat: string;
  qqGroup?: string;
}
export function contactReady(value: string) {
  return Boolean(value.trim()) && value !== "REPLACE_ME";
}
export async function loadContacts(): Promise<boolean> {
  const response = await fetch("/site-config.json", { cache: "no-store" });
  if (!response.ok) throw new Error("联系方式加载失败，请刷新重试。");
  const config = (await response.json()) as SiteConfig;
  if (typeof config.qq !== "string" || typeof config.wechat !== "string")
    throw new Error("商店联系方式配置无效。");
  for (const el of document.querySelectorAll('[data-contact="qq"]'))
    el.textContent = config.qq;
  for (const el of document.querySelectorAll('[data-contact="wechat"]'))
    el.textContent = config.wechat;
  const group =
    typeof config.qqGroup === "string" && /^\d{5,12}$/.test(config.qqGroup)
      ? config.qqGroup
      : "";
  for (const el of document.querySelectorAll('[data-contact="qqGroup"]'))
    el.textContent = group;
  for (const el of document.querySelectorAll<HTMLElement>("[data-community]"))
    el.hidden = !group;
  return contactReady(config.qq) || contactReady(config.wechat);
}
export async function copy(value: string, button: HTMLButtonElement) {
  try {
    await navigator.clipboard.writeText(value);
    const label = button.textContent;
    button.textContent = "已复制";
    setTimeout(() => {
      button.textContent = label;
    }, 1600);
  } catch {
    message("自动复制不可用，请选中文本手动复制。", true);
  }
}
