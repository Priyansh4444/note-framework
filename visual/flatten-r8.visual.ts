import { expect, test } from "./browser-test";

for (const width of [1440, 390]) {
  test(`flattening stays live, compact and honest at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/notes/framework-demo#flatten", { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    const figure = page.locator("#flatten-experiment");
    const summary = page.locator("[data-flatten-summary]");
    await figure.scrollIntoViewIfNeeded();
    const before = await summary.textContent();
    const handle = figure.getByRole("slider", { name: "Control point P₁", exact: true });
    await handle.focus();
    await handle.press("Shift+ArrowDown");
    await expect(summary).not.toHaveText(before!);
    await expect(summary.locator("[data-gap-eight]")).toHaveText(/\d+\.\d+/);
    const slider = figure.getByRole("slider", { name: "Subdivision playback", exact: true });
    await slider.press("End");
    await expect(figure.locator(".bz-count")).toHaveText("16");
    await expect(figure.locator("[data-gap-marker]")).toHaveAttribute("visibility", "hidden");
    await expect(figure.locator('.nk-dot[visibility="visible"]')).toHaveCount(0);
    expect((await figure.boundingBox())!.height).toBeLessThan(765);
    await figure.screenshot({ path: test.info().outputPath(`flatten-${width}.png`) });
    await page.getByRole("radio", { name: "Straight", exact: true }).click();
    await expect(summary.locator("[data-gap-eight]")).toHaveText("0.00");
    await expect(summary.locator("[data-gap-sixteen]")).toHaveText("0.00");
    await expect(summary).toContainText("one segment already draws it exactly");
    await expect(figure.locator("[data-gap-marker]")).toHaveAttribute("visibility", "hidden");
    await expect(figure.locator("figcaption")).toContainText("Zero error");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
  });
}

test("the disclosed error chart labels its actual units and fits its positive bound", async ({
  page,
}) => {
  await page.goto("/notes/framework-demo#flatten", { waitUntil: "networkidle" });
  const figure = page.locator("#flatten-experiment");
  await figure.getByText("Compare the gaps and error bounds", { exact: true }).click();
  const chart = figure.getByRole("img", { name: /^Log–log chart/ });
  await expect(chart).toContainText("segments n");
  await expect(chart).toContainText("gap (units)");
  await expect(chart).toContainText("200");
  await expect(chart).not.toContainText("1000");
});

for (const width of [320, 390, 1440])
  test(`log ticks remain separated at ${width}px after geometry changes`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/notes/framework-demo", { waitUntil: "networkidle" });
    await page.getByRole("heading", { level: 1 }).waitFor({ state: "visible" });
    await page.evaluate(() => document.fonts.ready);
    const f = page.locator("#flatten-experiment");
    await f.getByText("Compare the gaps and error bounds", { exact: true }).click();
    const chart = f.getByRole("img", { name: /^Log–log chart/ });
    for (const move of [false, true]) {
      if (move) {
        const h = f.getByRole("slider", { name: "Control point P₁", exact: true });
        await h.press("Shift+ArrowDown");
      }
      await expect
        .poll(() =>
          chart
            .locator('text[text-anchor="end"]')
            .evaluateAll(
              (ns) => ns.filter((n) => getComputedStyle(n).visibility !== "hidden").length,
            ),
        )
        .toBeGreaterThanOrEqual(2);
      const ys = await chart.locator('text[text-anchor="end"]').evaluateAll((ns) =>
        ns
          .filter((n) => getComputedStyle(n).visibility !== "hidden")
          .map((n) => {
            const r = n.getBoundingClientRect();
            return { top: r.top, bottom: r.bottom, text: n.textContent };
          })
          .sort((a, b) => a.top - b.top),
      );
      expect(ys.length).toBeGreaterThanOrEqual(2);
      for (let i = 1; i < ys.length; i++)
        expect(ys[i].top - ys[i - 1].bottom, JSON.stringify(ys)).toBeGreaterThanOrEqual(2);
    }
    await chart.screenshot({ path: test.info().outputPath(`log-chart-${width}.png`) });
  });
