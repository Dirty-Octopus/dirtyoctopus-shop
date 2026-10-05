import { visualClick } from "./visual-click";
import { test, expect, type Locator } from "@playwright/test";
async function bring(control: Locator) {
  await control.evaluate((el) =>
    window.scrollBy(0, el.getBoundingClientRect().top - 300),
  );
  await control.page().waitForTimeout(150);
}
test("主站视觉：严格 CSP、真实 A/B 播放、保留位置与独立设置", async ({
  page,
}) => {
  const errors: string[] = [];
  const audioRequests: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("request", (r) => {
    if (/\.(mp3|wav|ogg|m4a)(\?|$)/.test(r.url())) audioRequests.push(r.url());
  });
  await page.goto("http://127.0.0.1:4183/");
  await expect(page.locator("#enter")).toBeEnabled({ timeout: 10000 });
  await page.screenshot({ path: "/tmp/shop-portal.png" });
  await page.locator("#enter").click();
  await expect(page.locator("#boot")).toBeHidden({ timeout: 10000 });
  await expect(page.locator("html")).toHaveClass(/crt-mode/);
  await page.screenshot({ path: "/tmp/shop-home.png" });
  await expect(page.locator("#qq-group")).toHaveText("974329105");
  await expect(page.locator("[data-community]")).toContainText("私聊发送");
  const audio = page.locator("#demo-audio");
  expect(await audio.evaluate((el) => (el as HTMLAudioElement).paused)).toBe(
    true,
  );
  const play = page.locator("#demo-play");
  await bring(play);
  await play.click();
  await expect(play).toContainText("暂停");
  await expect
    .poll(() => audio.evaluate((el) => (el as HTMLAudioElement).currentTime))
    .toBeGreaterThan(0.3);
  await play.click();
  const position = await audio.evaluate(
    (el) => (el as HTMLAudioElement).currentTime,
  );
  await page.locator("[data-demo=after]").click();
  await expect(page.locator("[data-demo=after]")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect
    .poll(() => audio.evaluate((el) => (el as HTMLAudioElement).currentTime))
    .toBeCloseTo(position, 1);
  expect(await audio.evaluate((el) => (el as HTMLAudioElement).paused)).toBe(
    true,
  );
  await play.click();
  await expect(play).toContainText("暂停");
  await play.click();
  await page.screenshot({ path: "/tmp/shop-demo.png" });
  await page.evaluate(() => {
    localStorage.setItem("dirtyoctopus.order.v1.visual-test", "keep");
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(150);
  await visualClick(page.locator("#system-open"));
  await expect(page.locator("#system-dialog")).toBeVisible();
  await page.locator("#system-dialog [data-treatment=mono]").click();
  await expect(page.locator("body")).toHaveAttribute("data-treatment", "mono");
  await page.locator("#settings-reset").click();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("dirtyoctopus.order.v1.visual-test"),
    ),
  ).toBe("keep");
  await visualClick(page.locator("#system-close"));
  await expect(page.locator("#system-dialog")).not.toBeVisible();
  expect(audioRequests.length).toBeGreaterThanOrEqual(2);
  expect(
    audioRequests.every((url) => url.includes("/assets/audio/glossy-neuro-")),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test("移动端与减少动态效果，进入试听后不横向溢出", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("http://127.0.0.1:4183/");
  await page.locator("#enter-en").click();
  await expect(page.locator("#boot")).toBeHidden();
  await expect(page.locator("body")).toHaveClass(/motion-off/);
  expect(await page.locator("html").getAttribute("class")).not.toContain(
    "crt-mode",
  );
  await bring(page.locator("#demo-play"));
  await page.screenshot({ path: "/tmp/shop-mobile.png" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});
