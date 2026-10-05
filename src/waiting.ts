import "./waiting.css";
import { SALE_START_MS } from "../shared/launch";
const countdown = document.querySelector<HTMLElement>("#countdown")!,
  ready = document.querySelector<HTMLElement>("#sale-ready")!;
let offset = 0,
  confirmedOpen = false;
const apiBase =
  __SHOP_API_BASE__ || (import.meta.env.DEV ? "http://127.0.0.1:8787" : "");
async function calibrate() {
  try {
    const r = await fetch(apiBase + "/api/sale", {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error();
    const data = await r.json();
    offset = data.server_now - Date.now();
    confirmedOpen = data.open;
    tick();
  } catch {
    countdown.textContent = "正在重试校准时间…";
  }
}
function tick() {
  const seconds = Math.max(
    0,
    Math.ceil((SALE_START_MS - Date.now() - offset) / 1000),
  );
  if (confirmedOpen) {
    ready.hidden = false;
    countdown.parentElement!.hidden = true;
    return;
  }
  const d = Math.floor(seconds / 86400),
    h = Math.floor((seconds % 86400) / 3600),
    m = Math.floor((seconds % 3600) / 60),
    s = seconds % 60;
  countdown.textContent = seconds
    ? `${d ? d + " 天 " : ""}${String(h).padStart(2, "0")} 时 ${String(m).padStart(2, "0")} 分 ${String(s).padStart(2, "0")} 秒`
    : "正在确认开售…";
}
setInterval(() => {
  tick();
  if (Date.now() + offset >= SALE_START_MS && !confirmedOpen) void calibrate();
}, 1000);
setInterval(() => void calibrate(), 30000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) void calibrate();
});
void calibrate();
