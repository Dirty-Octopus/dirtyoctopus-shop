import { test, expect, type Page } from "@playwright/test";
import type { AdminOrder } from "../../shared/catalog";
import siteConfig from "../../public/site-config.json" with { type: "json" };

test("生产构建：外部样式、真实联系方式、严格 CSP 与响应式视觉", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("http://127.0.0.1:4183/");
  await page.evaluate(() => document.fonts.ready);
  const buy = page.getByRole("button", { name: "创建订单并购买" });
  if (siteConfig.apiBase) await expect(buy).toBeEnabled();
  else {
    await expect(buy).toBeDisabled();
    await expect(page.locator("#setup-notice")).toBeVisible();
  }
  await expect(page.locator('[data-contact="wechat"]')).toHaveText(
    siteConfig.wechat,
  );
  expect(
    await page.evaluate(
      () => getComputedStyle(document.documentElement).backgroundColor,
    ),
  ).toBe("rgb(16, 17, 18)");
  const csp = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute("content");
  expect(csp).not.toContain("unsafe-inline");
  expect(csp).not.toContain("localhost");
  expect(csp).not.toContain("127.0.0.1");
  expect(csp).not.toContain("__API_CONNECT_SRC__");
  expect(csp).not.toContain("api.dirtyoctopus.net");
  expect(csp).not.toContain("*.workers.dev");
  if (siteConfig.apiBase) expect(csp).toContain(siteConfig.apiBase);
  await page.screenshot({
    path: "test-results/shop-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.screenshot({
    path: "test-results/shop-mobile.png",
    fullPage: true,
  });
});

async function testContacts(page: Page) {
  await page.route("**/site-config.json", (route) =>
    route.fulfill({ json: { qq: "TEST_ONLY_QQ", wechat: "TEST_ONLY_WECHAT" } }),
  );
}
test("未配置联系方式时阻止购买，实际新付款码与插件图片能加载", async ({
  page,
}) => {
  await page.route("**/site-config.json", (route) =>
    route.fulfill({ json: { qq: "REPLACE_ME", wechat: "REPLACE_ME" } }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "创建订单并购买" }),
  ).toBeDisabled();
  await expect(
    page.getByText(
      "商店正在准备上线，暂未开放购买。有问题请通过下方 QQ / 微信联系我。",
    ),
  ).toBeVisible();
  const image = page.getByAltText(
    "Spectral Corruptor 的输入输出频谱、模块信号链和频域效果参数界面",
  );
  await expect(image).toBeVisible();
  expect(
    await image.evaluate((el) => (el as HTMLImageElement).naturalWidth),
  ).toBe(2360);
  const response = await page.request.get("/assets/newpaymentwx.jpg");
  expect(response.ok()).toBeTruthy();
});
test("生产未配置 API 时管理入口保留说明，不跳转到无效域名", async ({
  page,
}) => {
  test.skip(
    Boolean(siteConfig.apiBase),
    "已配置实际后端，不能在 CI 访问生产管理页面",
  );
  await page.goto("http://127.0.0.1:4183/admin/");
  await expect(page.locator("#admin-message")).toContainText(
    "管理后台尚未连接",
  );
  await expect(page.locator("#admin-link")).toBeHidden();
  await expect(page).toHaveURL("http://127.0.0.1:4183/admin/");
});
test("真实本地 Worker：创建 → 提交 → 刷新 → 最近订单，不会误报付款确认", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await testContacts(page);
  await page.goto("/");
  await page.getByRole("button", { name: "创建订单并购买" }).click();
  await expect(page).toHaveURL(/\/order\/\?id=DO-[A-F0-9]{16}$/);
  const orderUrl = page.url();
  await expect(page.locator("#order-status")).toHaveText("等待付款");
  await expect(page.locator("#qr-panel img")).toHaveAttribute(
    "src",
    "/assets/newpaymentwx.jpg",
  );
  const ref = `TEST${Date.now()}E2E`;
  await page.getByLabel("微信支付交易单号", { exact: true }).fill(ref);
  await page.getByRole("button", { name: "提交付款信息" }).click();
  await expect(page.locator("#order-status")).toHaveText(
    "付款信息已提交，等待人工核验",
  );
  await expect(page.locator("#after-submission")).toBeVisible();
  await expect(page.locator("#qr-panel")).toBeHidden();
  await expect(page.locator("#after-submission")).toContainText("Machine ID");
  await expect(
    page.getByText("Payment Confirmed", { exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(page.locator("#order-status")).toHaveText(
    "付款信息已提交，等待人工核验",
  );
  await page.goto("/");
  await expect(page.locator(".recent-order")).toHaveCount(1);
  await page.locator(".recent-order").click();
  await expect(page).toHaveURL(orderUrl);
  expect(errors).toEqual([]);
});
test("跨设备需要访问凭证，错误凭证不能查看；备份凭证可以恢复", async ({
  page,
  browser,
}) => {
  await testContacts(page);
  await page.goto("/");
  await page.getByRole("button", { name: "创建订单并购买" }).click();
  await expect(page.locator("#order-status")).toHaveText("等待付款");
  const url = page.url();
  const token = await page.locator("#access-token").inputValue();
  const context = await browser.newContext();
  const other = await context.newPage();
  await testContacts(other);
  await other.goto(url);
  await expect(other.locator("#restore-section")).toBeVisible();
  await expect(other.locator("#order-content")).toBeHidden();
  await other
    .getByLabel("Customer Access Token / 订单访问凭证")
    .fill("A".repeat(43));
  await other.getByRole("button", { name: "打开订单", exact: true }).click();
  await expect(other.locator("#message")).toContainText(
    "订单不存在或访问凭证无效",
  );
  await other.getByLabel("Customer Access Token / 订单访问凭证").fill(token);
  await other.getByRole("button", { name: "打开订单", exact: true }).click();
  await expect(other.locator("#order-status")).toHaveText("等待付款");
  expect(other.url()).not.toContain(token);
  await context.close();
});
test("手机 390px 与 320px 不横向溢出，最近订单中的恶意存储不会执行", async ({
  page,
}) => {
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    expect(overflow).toBe(false);
  }
  await page.evaluate(() =>
    localStorage.setItem(
      "dirtyoctopus.order.v1.bad",
      JSON.stringify({
        id: "<img src=x onerror=alert(1)>",
        token: "A".repeat(43),
      }),
    ),
  );
  await page.reload();
  await expect(page.locator("#recent-list img")).toHaveCount(0);
});
test("订单手机布局及输入错误处理", async ({ page }) => {
  await testContacts(page);
  await page.goto("/");
  await page.getByRole("button", { name: "创建订单并购买" }).click();
  await expect(page.locator("#order-status")).toHaveText("等待付款");
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
  }
  await page.getByLabel("微信支付交易单号", { exact: true }).fill("123");
  await page.getByRole("button", { name: "提交付款信息" }).click();
  await expect(page.locator("#order-status")).toHaveText("等待付款");
  expect(
    await page
      .locator("#transaction-id")
      .evaluate((el) => (el as HTMLInputElement).validity.valid),
  ).toBe(false);
});
test("管理 UI：展示备注为文本、人工确认弹窗、核验后再完成（API 响应模拟）", async ({
  page,
}) => {
  const order: AdminOrder = {
    id: "DO-ABCDEF1234567890",
    product_id: "spectral-corruptor",
    product_name: "Spectral Corruptor",
    amount_cents: 9990,
    currency: "CNY",
    status: "PAYMENT_REFERENCE_SUBMITTED",
    wechat_transaction_id: "TESTPAYMENT12345",
    created_at: "2026-10-05T08:00:00.000Z",
    updated_at: "2026-10-05T08:00:00.000Z",
    payment_reference_submitted_at: "2026-10-05T08:01:00.000Z",
    payment_verified_at: null,
    completed_at: null,
    cancelled_at: null,
    refunded_at: null,
    admin_note: "<img src=x onerror=alert(1)>",
  };
  await page.route("**/api/admin/orders**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/verify-payment")) {
      order.status = "PAYMENT_VERIFIED";
      order.payment_verified_at = new Date().toISOString();
    }
    if (path.endsWith("/complete")) {
      order.status = "COMPLETED";
      order.completed_at = new Date().toISOString();
    }
    if (path.endsWith("/note"))
      order.admin_note = route.request().postDataJSON().admin_note;
    await route.fulfill({
      json:
        path === "/api/admin/orders"
          ? { orders: [order], next_cursor: null }
          : { order },
    });
  });
  await page.goto("/console/");
  await page.getByRole("button", { name: order.id, exact: true }).click();
  await expect(page.locator("#admin-note")).toHaveValue(
    "<img src=x onerror=alert(1)>",
  );
  await expect(page.locator("#admin-detail img")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "标记已完成", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "标记付款已核验", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "人工确认收到了此订单的正确金额",
  );
  await page.getByRole("button", { name: "确认已完成此人工操作" }).click();
  await expect(page.locator("#detail-status")).toContainText("付款已人工核验");
  await page.getByRole("button", { name: "标记已完成", exact: true }).click();
  await page.getByRole("button", { name: "确认已完成此人工操作" }).click();
  await expect(page.locator("#detail-status")).toContainText("已完成");
  await page.locator("#admin-note").fill("人工核验备注");
  await page.getByRole("button", { name: "保存备注" }).click();
  await expect(page.locator("#message")).toContainText("备注已保存");
});
