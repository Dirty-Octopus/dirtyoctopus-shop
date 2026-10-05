import { $, api, busy } from "./common";
import { orderIdPattern } from "../shared/catalog";
import { scrollContentIntoView } from "./portfolio/viewport.js";
type Supporter = {
  order_id: string;
  display_name: string;
  message: string;
  published: number;
  order_status?: string;
};
let cursor: string | null = null;
const id = () => {
  const value = $<HTMLInputElement>("#supporter-order")
    .value.trim()
    .toUpperCase();
  if (!orderIdPattern.test(value)) throw new Error("请输入完整订单号。");
  return value;
};
function fill(s: Supporter) {
  $<HTMLInputElement>("#supporter-order").value = s.order_id;
  $<HTMLInputElement>("#supporter-name").value = s.display_name;
  $<HTMLTextAreaElement>("#supporter-message").value = s.message;
  $<HTMLInputElement>("#supporter-published").checked = Boolean(s.published);
}
async function list(append = false) {
  const data = await api<{
    supporters: Supporter[];
    next_cursor: string | null;
  }>("/api/admin/supporters" + (append && cursor ? "?cursor=" + cursor : ""), {
    admin: true,
  });
  const list = $("#supporter-list");
  if (!append) list.replaceChildren();
  for (const s of data.supporters) {
    const button = document.createElement("button");
    button.className = "button";
    button.textContent = `${s.display_name} · ${s.order_id} · ${s.published ? "公开" : "隐藏"} · ${s.order_status}`;
    button.onclick = () => {
      fill(s);
      scrollContentIntoView($("#supporter-form"));
    };
    list.append(button);
  }
  cursor = data.next_cursor;
  $("#more-admin-supporters").hidden = !cursor;
}
$("#load-supporter").onclick = () =>
  void busy($<HTMLButtonElement>("#load-supporter"), async () => {
    const order = id();
    const data = await api<{ supporter: Supporter | null }>(
      "/api/admin/supporters/" + order,
      { admin: true },
    );
    fill(
      data.supporter ?? {
        order_id: order,
        display_name: "",
        message: "",
        published: 1,
      },
    );
    $("#supporter-result").textContent = data.supporter
      ? "已读取，可编辑原记录。"
      : "该订单尚未留名，填写后保存。";
  });
$("#supporter-form").onsubmit = (e) => {
  e.preventDefault();
  void busy($<HTMLButtonElement>("#save-supporter"), async () => {
    await api("/api/admin/supporters/" + id(), {
      admin: true,
      body: {
        display_name: $<HTMLInputElement>("#supporter-name").value,
        message: $<HTMLTextAreaElement>("#supporter-message").value,
        published: $<HTMLInputElement>("#supporter-published").checked,
      },
    });
    $("#supporter-result").textContent = "留名已保存。";
    await list();
  });
};
$("#reload-supporters").onclick = () =>
  void busy($<HTMLButtonElement>("#reload-supporters"), () => list());
$("#more-admin-supporters").onclick = () =>
  void busy($<HTMLButtonElement>("#more-admin-supporters"), () => list(true));
$("#words-form").onsubmit = (e) => {
  e.preventDefault();
  void busy($<HTMLButtonElement>("#save-words"), async () => {
    await api("/api/admin/words", {
      admin: true,
      body: { body: $<HTMLTextAreaElement>("#words-body").value },
    });
    $("#message").textContent = "文字已发布。";
    $("#message").hidden = false;
  });
};
void busy($<HTMLButtonElement>("#reload-supporters"), async () => {
  await list();
  const data = await api<{ content: { body: string } }>("/api/admin/words", {
    admin: true,
  });
  $<HTMLTextAreaElement>("#words-body").value = data.content.body;
  $<HTMLTextAreaElement>("#words-body").disabled = false;
  $<HTMLButtonElement>("#save-words").disabled = false;
});
