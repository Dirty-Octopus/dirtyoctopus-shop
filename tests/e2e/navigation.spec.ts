import { test, expect } from "@playwright/test";
import { visualClick } from "./visual-click";
test("真实分页：浏览、详情试听、订单、联系方式", async ({ page }) => {
  await page.goto("http://127.0.0.1:4183/");
  await expect(page.locator("[data-enter]")).toHaveCount(1);
  await page.locator("#enter").click();
  await expect(page.locator("#boot")).toBeHidden();
  await expect(page.locator(".brand-name strong")).toHaveText("SHOP");
  await expect(page.locator("#demo, #recent-list, #contact-title")).toHaveCount(
    0,
  );
  await visualClick(page.locator(".preview a"));
  await expect(page).toHaveURL(/\/plugins\/spectral-corruptor\/$/);
  await expect(page.locator("#demo")).toHaveCount(1);
  for (const [path, selector] of [
    ["/orders/", "#recent-list"],
    ["/contact/", "#contact-title"],
  ]) {
    await visualClick(page.locator(`.navigation-block a[href="${path}"]`));
    await expect(page).toHaveURL(new RegExp(path + "$"));
    await expect(page.locator(selector)).toBeVisible();
    await expect(
      page.locator(`.navigation-block a[href="${path}"]`),
    ).toHaveClass(/active/);
    await page.reload();
    await expect(page.locator(selector)).toBeVisible();
  }
  await expect(page.locator("#qq-group")).toHaveText("974329105");
});
test("非 Chromium 默认关闭 CRT", async ({ browser }) => {
  for (const userAgent of [
    "Mozilla/5.0 Version/18.0 Safari/605.1.15",
    "Mozilla/5.0 Firefox/140.0",
  ]) {
    const context = await browser.newContext({ userAgent });
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:4183/contact/");
    await expect(page.locator("html")).not.toHaveClass(/crt-mode/);
    await context.close();
  }
});
test("入口水声、点击、Logo、预选中、滚动音效与静音记忆", async ({ page }) => {
  const sounds = new Set<string>();
  page.on("response", (r) => {
    if (r.ok() && r.url().includes("/assets/sfx/"))
      sounds.add(r.url().split("/").pop()!);
  });
  await page.goto("http://127.0.0.1:4183/");
  await expect(page.locator("#enter")).toBeEnabled();
  const face = await page.locator(".portal-visual").boundingBox();
  await page.mouse.click(
    face!.x + face!.width * 0.15,
    face!.y + face!.height * 0.75,
  );
  await expect.poll(() => sounds.has("water.wav")).toBe(true);
  await page.locator("#enter").click();
  await expect(page.locator("#boot")).toBeHidden();
  await visualClick(page.locator("#site [data-sfx=logo]").first());
  await page.locator("#system-open").hover();
  await page.mouse.move(500, 400);
  await page.mouse.wheel(0, 333);
  await expect.poll(() => sounds.has("lowerclack.wav")).toBe(true);
  await expect.poll(() => sounds.has("suprise.wav")).toBe(true);
  await expect.poll(() => sounds.has("preselect.wav")).toBe(true);
  expect(sounds.has("clickeffect.wav")).toBe(true);
  expect(sounds.has("clickevent.wav")).toBe(true);
  await visualClick(page.locator("#sfx-toggle"));
  await expect(page.locator("#sfx-toggle")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await page.goto("http://127.0.0.1:4183/contact/");
  await expect(page.locator("#sfx-toggle")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});

test("详情图片共享过渡、默认单次试听与反复切页", async ({ page }) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    window.addEventListener("pagereveal", (event) => {
      const transition = event.viewTransition;
      if (transition) transition.ready.then(() => {
        document.documentElement.dataset.transitionReady = "true";
      }).catch(() => { document.documentElement.dataset.transitionReady = "failed"; });
    });
  });
  await page.goto("http://127.0.0.1:4183/");
  await page.locator("#enter").click();
  await expect(page.locator("#boot")).toBeHidden();
  for (let i = 0; i < 3; i++) {
    await visualClick(page.locator('.preview a'));
    await expect(page.locator("#demo-loop")).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator("#demo-track option")).toHaveText(["Neuro Squarifier", "additive pads", "cool arps"]);
    expect(await page.locator("#demo-audio").evaluate((el: HTMLAudioElement) => el.loop)).toBe(false);
    await expect(page.locator("html")).toHaveAttribute("data-transition-ready", "true");
    const image = await page.locator(".preview").boundingBox();
    const copy = await page.locator(".product-copy").boundingBox();
    expect(image!.x + image!.width).toBeLessThanOrEqual(copy!.x);
    await page.evaluate(async () => {
      await Promise.all(document.getAnimations().filter(animation =>
        animation.effect instanceof KeyframeEffect && animation.effect.pseudoElement?.startsWith("::view-transition")
      ).map(animation => animation.finished.catch(() => {})));
    });
    await page.screenshot({ path: "test-results/product-detail.png" });
    await visualClick(page.locator('.navigation-block a[href="/contact/"]'));
    await expect(page.locator("#contact-title")).toBeVisible();
    await visualClick(page.locator('.navigation-block a[href="/"]'));
    await expect(page.locator("#boot")).toBeHidden();
    await expect(page.locator("#site")).toBeVisible();
  }
  expect(errors).toEqual([]);
});
