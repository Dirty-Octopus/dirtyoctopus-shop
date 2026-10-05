import { test, expect } from "@playwright/test";
import { visualClick } from "./visual-click";
test("售卖入口由服务器开售状态决定，等待页面到点开放且不自动创建订单", async ({
  page,
}) => {
  let open = false,
    creates = 0;
  await page.route("**/api/sale", (route) =>
    route.fulfill({
      json: {
        starts_at: "2026-10-06T21:09:09+08:00",
        server_now: open ? 1791292149000 : Date.parse("2026-10-06T13:09:07Z"),
        open,
      },
    }),
  );
  await page.route("**/api/orders", (route) => {
    creates++;
    return route.fulfill({ status: 500 });
  });
  await page.goto("http://127.0.0.1:4183/plugins/spectral-corruptor/");
  await visualClick(page.locator("#buy"));
  await expect(page).toHaveURL(/\/waiting\/$/);
  await expect(page.locator("#countdown")).toContainText("秒");
  expect(creates).toBe(0);
  open = true;
  await expect(page.locator("#sale-ready")).toBeVisible({ timeout: 8000 });
  expect(creates).toBe(0);
});
test("支持者/文字按纯文本展示，前台没有编辑表单", async ({ page }) => {
  await page.route("**/api/supporters", (r) =>
    r.fulfill({
      json: {
        supporters: [
          {
            display_name: "<img src=x>",
            message: "你好\n<script>test</script>",
          },
        ],
        next_cursor: null,
      },
    }),
  );
  await page.route("**/api/words", (r) =>
    r.fulfill({
      json: { content: { body: "第一行\n第二行 <script>test</script>" } },
    }),
  );
  await page.goto("http://127.0.0.1:4183/supporters/");
  await expect(page.locator("#public-content")).toContainText("<img src=x>");
  await expect(page.locator("#public-content img, #main form")).toHaveCount(0);
  await page.goto("http://127.0.0.1:4183/words/");
  await expect(page.locator("#public-content")).toContainText(
    "第二行 <script>test</script>",
  );
  await expect(
    page.locator("#public-content script, #main textarea"),
  ).toHaveCount(0);
});
test("内容管理入口可录入和修改支持者、保存文字（模拟 Access 后 API）", async ({
  page,
}) => {
  let entry: any = null,
    words = "",
    saved = 0;
  await page.route("**/api/admin/supporters**", async (r) => {
    if (r.request().method() === "POST") {
      entry = {
        ...r.request().postDataJSON(),
        order_id: "DO-ABCDEF1234567890",
      };
      saved++;
      await r.fulfill({ json: { ok: true } });
    } else
      await r.fulfill({
        json: {
          supporters: entry ? [entry] : [],
          next_cursor: null,
          supporter: entry,
        },
      });
  });
  await page.route("**/api/admin/words", async (r) => {
    if (r.request().method() === "POST")
      words = r.request().postDataJSON().body;
    await r.fulfill({ json: { content: { body: words } } });
  });
  await page.goto("/console/content/");
  await page.locator("#supporter-order").fill("DO-ABCDEF1234567890");
  await page.locator("#supporter-name").fill("支持者");
  await page.locator("#supporter-message").fill("谢谢");
  await visualClick(page.locator("#save-supporter"));
  await expect(page.locator("#supporter-result")).toHaveText("留名已保存。");
  expect(saved).toBe(1);
  await page.locator("#words-body").fill("我想说的话\n第二行");
  await visualClick(page.locator("#save-words"));
  await expect(page.locator("#message")).toHaveText("文字已发布。");
  expect(words).toContain("第二行");
});
test("新增两组 A/B 音频能实际解码播放，切换片段停止上一段", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:4183/plugins/spectral-corruptor/");
  for (const track of ["additive-pads", "cool-arps"]) {
    await page.locator("#demo-track").selectOption(track);
    await expect(page.locator("#demo-audio")).toHaveAttribute(
      "src",
      `/assets/audio/${track}-before.mp3`,
    );
    await visualClick(page.locator("#demo-play"));
    await expect
      .poll(() =>
        page
          .locator("#demo-audio")
          .evaluate((el) => (el as HTMLAudioElement).currentTime),
      )
      .toBeGreaterThan(0.1);
    await visualClick(page.locator("[data-demo=after]"));
    await expect(page.locator("#demo-audio")).toHaveAttribute(
      "src",
      `/assets/audio/${track}-after.mp3`,
    );
    await expect
      .poll(() =>
        page
          .locator("#demo-audio")
          .evaluate((el) => (el as HTMLAudioElement).paused),
      )
      .toBe(false);
  }
});
