import { test, expect } from "./browser-test";
import { measureTaste } from "../scripts/taste-measure";
test("row alignment checks HTML controls without flattening SVG geometry", async ({ page }) => {
  await page.setContent(
    '<main><svg width="200" height="100"><g role="slider"><circle cx="40" cy="40" r="20"/></g><g role="slider"><circle cx="100" cy="42" r="20"/></g></svg><div style="display:flex"><button>A</button><button style="transform:translateY(2px)">B</button></div></main>',
  );
  const findings = (await page.evaluate(measureTaste)).filter(
    (f) => f.rule === "near-miss-alignment",
  );
  expect(findings).toHaveLength(1);
  expect(findings[0].ids.every((id) => id.includes("button"))).toBe(true);
});
for (const width of [390, 1440])
  test(`diff remains operable and overflow is disclosed at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const badFonts: string[] = [];
    page.on("response", (r) => {
      if (/\.(woff2?|ttf)(\?|$)/.test(r.url()) && r.status() !== 200)
        badFonts.push(`${r.status()} ${r.url()}`);
    });
    await page.goto("/notes/framework-demo", { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    expect(badFonts).toEqual([]);
    const outer = page
      .locator("#code details")
      .filter({ has: page.locator(".nk-code-example") })
      .first();
    await outer.locator(":scope > summary").click();
    const diff = outer.locator(".nk-code-example").first();
    await expect(diff.locator("figure")).toHaveAttribute("data-current-version", "after");
    const toggle = diff.locator(".nk-code-block-switch");
    if (width === 390) await expect(toggle).toBeVisible();
    else await diff.hover();
    await toggle.click();
    await expect(diff.locator("figure")).toHaveAttribute("data-current-version", "before");
    await toggle.click();
    await expect(diff.locator("figure")).toHaveAttribute("data-current-version", "after");
    const listing = diff.locator(".nk-code-block-render");
    if (width === 390) {
      const rowTop = await listing.evaluate(
        (e) => e.shadowRoot!.querySelector("[data-morph-row]")!.getBoundingClientRect().top,
      );
      const button = await toggle.boundingBox();
      expect(rowTop).toBeGreaterThanOrEqual(button!.y + button!.height);
    }
    const overflow = await listing.evaluate((e) => {
      const pre = e.shadowRoot!.querySelector("pre") as HTMLElement;
      return pre.scrollWidth > pre.clientWidth + 1;
    });
    await expect(diff.locator(".nk-code-source-body")).toBeHidden();
    if (overflow) {
      await listing.focus();
      await listing.press("ArrowRight");
      expect(
        await listing.evaluate(
          (e) => (e.shadowRoot!.querySelector("pre") as HTMLElement).scrollLeft,
        ),
      ).toBeGreaterThan(0);
      await expect(diff.locator(".nk-code-block-scroll-hint")).toBeVisible();
    }
    await diff.screenshot({ path: `artifacts/council-design/r8/code-${width}.png` });
  });

test("reduced motion preserves every subdivision lesson", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/notes/framework-demo", { waitUntil: "networkidle" });
  const f = page.locator("#flatten-experiment");
  const s = f.getByRole("slider", { name: "Subdivision playback", exact: true });
  await s.press("Home");
  const action = f.locator("[data-nk-scene-action]");
  for (const n of ["1", "2", "4", "8", "16"]) {
    await expect(f.locator(".bz-count")).toHaveText(n);
    if (n !== "16") await action.click();
  }
  await expect(action).toHaveText("Replay");
  await action.click();
  await expect(f.locator(".bz-count")).toHaveText("1");
});
