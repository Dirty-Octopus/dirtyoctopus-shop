import { test, expect } from "@playwright/test";
import { SALE_START_MS } from "../../shared/launch";

test("手册始终可阅读；下载在开售后无需订单直接开放", async ({ page }) => {
  let open = false;
  await page.route("**/api/sale", r => r.fulfill({ json: {
    open, server_now: SALE_START_MS + 1000,
  } }));
  await page.goto("http://127.0.0.1:4183/plugins/spectral-corruptor/");
  await expect(page.locator("#download-windows")).toBeDisabled();
  await expect(page.locator("#download-macos")).toBeDisabled();
  for (const language of ["ZH", "EN"]) {
    const link = page.locator(`a[href="/manuals/Spectral_Corruptor_Manual_${language}.pdf"]`);
    await expect(link).toBeVisible();
    const response = await page.request.get(await link.getAttribute("href") as string);
    expect(response.ok()).toBe(true);
    expect((await response.body()).subarray(0, 5).toString()).toBe("%PDF-");
  }
  await expect(page.locator(".install-notice")).toContainText("974329105");
  await expect(page.locator(".install-notice")).toContainText("C:\\Program Files\\Common Files\\VST3");
  open = true;
  await expect(page.locator("#download-windows")).toHaveAttribute("href", "https://github.com/Dirty-Octopus/spectral-corruptor-plugin/releases/latest/download/SpectralCorruptor-Windows.zip");
  await expect(page.locator("#download-macos")).toHaveAttribute("href", "https://github.com/Dirty-Octopus/spectral-corruptor-plugin/releases/latest/download/SpectralCorruptor-macOS.zip");
  await expect(page.locator("#download-status")).toContainText("下载已开放");
});
