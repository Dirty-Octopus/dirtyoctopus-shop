import { $, api } from "./common";
const target = $("#public-content");
if (location.pathname.startsWith("/words")) {
  // Developer note is embedded in HTML and needs no API connection.
} else {
  let cursor: string | null = null,
    first = true;
  const more = $<HTMLButtonElement>("#more-supporters");
  async function load() {
    more.disabled = true;
    try {
      const data = await api<{
        supporters: { display_name: string; message: string }[];
        next_cursor: string | null;
      }>(
        `/api/supporters${cursor ? "?cursor=" + encodeURIComponent(cursor) : ""}`,
      );
      if (first) target.replaceChildren();
      first = false;
      for (const entry of data.supporters) {
        const card = document.createElement("article");
        card.className = "panel";
        const name = document.createElement("h2"),
          message = document.createElement("p");
        name.textContent = entry.display_name;
        message.textContent = entry.message;
        message.className = "author-words";
        card.append(name, message);
        target.append(card);
      }
      if (!target.childElementCount)
        target.textContent = "等待第一位支持者。谢谢你对开源项目的支持。";
      cursor = data.next_cursor;
      more.hidden = !cursor;
      more.textContent = "加载更多";
    } catch {
      if (first) target.textContent = "暂时无法加载支持者。";
      more.hidden = false;
      more.textContent = "重试加载";
    } finally {
      more.disabled = false;
    }
  }
  more.onclick = () => void load();
  void load();
}
