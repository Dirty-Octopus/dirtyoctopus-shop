import { expect, type Locator } from "@playwright/test";
import { lensDisplayPoint } from "../../src/portfolio/crt.js";
// The reference CRT paints a displaced image; target its painted coordinate,
// just as a real pointer does, rather than Playwright's undisplaced DOM centre.
export async function visualClick(control: Locator) {
  await expect(control).toBeVisible();
  await expect(control).toBeEnabled();
  await control.page().evaluate(() => document.fonts.ready);
  await control.evaluate(async (el) => {
    const r = el.getBoundingClientRect();
    if (!el.closest("dialog") && (r.top < 50 || r.bottom > innerHeight - 50))
      window.scrollBy({ top: r.top - innerHeight / 2, behavior: "instant" });
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await expect
    .poll(() =>
      control
        .page()
        .evaluate(() =>
          Math.abs(
            parseFloat(
              (document.querySelector("#site") as HTMLElement).style.top || "0",
            ) + scrollY,
          ),
        ),
    )
    .toBeLessThan(1);
  const bounds = await control.boundingBox();
  if (!bounds) throw new Error("Control has no bounds");
  let point = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
  const view = await control.page().evaluate(() => ({
    crt: document.documentElement.classList.contains("crt-mode"),
    width: document.querySelector(".crt-surface")!.clientWidth,
    height: innerHeight,
  }));
  if (view.crt)
    point = lensDisplayPoint(point.x, point.y, view.width, view.height);
  await control.page().mouse.click(point.x, point.y);
}
