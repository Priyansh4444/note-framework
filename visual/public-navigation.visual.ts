import { test, expect, type Page } from "./browser-test";
const origin = process.env.PUBLIC_TEST_URL;
test.skip(!origin, "Set PUBLIC_TEST_URL to test real document navigation and study policies.");
test.use({ baseURL: origin });

async function nativeClick(page: Page, selector: string) {
  const [response] = await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded" }),
    page.locator(selector).first().click(),
  ]);
  expect(
    response,
    "The link must load a document instead of entering an unregistered SPA route",
  ).not.toBeNull();
  expect(response!.status()).toBe(200);
}

test("agent instructions and checksums navigate as actual text documents", async ({ page }) => {
  for (const path of ["/llms.txt", "/starter.sha256"]) {
    await page.goto("/");
    await nativeClick(page, `a[href="${path}"]`);
    await expect(page.locator("#app")).toHaveCount(0);
    expect((await page.locator("body").innerText()).length).toBeGreaterThan(50);
  }
});

test("all study posters load, actual study links navigate and shipped controls execute", async ({
  page,
}) => {
  await page.goto("/studies");
  for (const image of await page.locator(".study-poster img").all()) {
    await image.scrollIntoViewIfNeeded();
    await expect
      .poll(() => image.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0))
      .toBe(true);
  }
  const studies = ["hairline", "mechanical-arm", "morph", "ink"];
  for (const slug of studies) {
    await page.goto("/studies");
    await nativeClick(page, `.study-open[href="/studies/${slug}/index.html"]`);
    await expect(page.locator("body")).not.toBeEmpty();
    if (slug === "morph" || slug === "ink") {
      const canvas = page.locator("canvas").first();
      await expect
        .poll(() =>
          canvas.evaluate((el: HTMLCanvasElement) => {
            const context = el.getContext("2d")!;
            const pixels = context.getImageData(0, 0, el.width, el.height).data;
            return pixels.some((value, i) => i % 4 !== 3 && value > 40);
          }),
        )
        .toBe(true);
      const button = page.locator(slug === "morph" ? '[data-form="2"]' : '[data-scene="1"]');
      await button.click();
      await expect(button).toHaveAttribute(
        slug === "morph" ? "aria-pressed" : "aria-current",
        "true",
      );
    }
    await nativeClick(page, 'a[href="/studies"]');
    await expect(page.locator(".study-grid")).toBeVisible();
  }
});

test("application fonts and scripts produce no security-policy violations", async ({ page }) => {
  await page.addInitScript(() => {
    const violations: string[] = [];
    Object.defineProperty(window, "policyViolations", { value: violations });
    window.addEventListener("securitypolicyviolation", (event) =>
      violations.push(`${event.violatedDirective}: ${event.blockedURI}`),
    );
  });
  for (const path of [
    "/docs/",
    "/notes/framework-demo",
    "/studies/morph/index.html",
    "/studies/ink/index.html",
  ]) {
    await page.goto(path, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => Reflect.get(window, "policyViolations"))).toEqual([]);
  }
});
