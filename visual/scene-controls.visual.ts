import { expect, test } from "./browser-test";

for (const width of [1280, 390, 320])
  test(`real animated figures have one position slider at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/notes/framework-demo", { waitUntil: "networkidle" });
    await page.locator("#weights > details > summary").click();
    const figures = page.locator("figure[data-nk-scene]");
    await expect(figures).toHaveCount(4);
    for (const figure of await figures.all()) {
      // Point handles also expose slider roles, but edit independent control-point coordinates.
      await expect(
        figure.locator(".nk-timeline-slider:visible, .nk-parameter input:visible"),
      ).toHaveCount(1);
      await expect(figure.locator(".nk-parameter, input[type=range]")).toHaveCount(0);
      const slider = figure.locator(".nk-timeline-slider");
      await expect(slider).toHaveAttribute("role", "slider");
      await expect(slider).toHaveAttribute("aria-orientation", "horizontal");
      await slider.press("End");
      await expect(figure).toHaveAttribute(
        "data-nk-scene-time",
        (await figure.getAttribute("data-nk-scene-length"))!,
      );
      await slider.press("Home");
      await expect(figure).toHaveAttribute("data-nk-scene-time", "0");
    }

    await page.goto("/docs#animate", { waitUntil: "networkidle" });
    const sweep = page.locator("#animate figure[data-nk-scene]");
    await expect(sweep).toHaveCount(1);
    await expect(
      sweep.locator(".nk-timeline-slider:visible, .nk-parameter input:visible"),
    ).toHaveCount(1);
    await expect(sweep.locator(".nk-parameter, input[type=range]")).toHaveCount(0);
    const timeline = sweep.getByRole("slider", { name: "Curve playback", exact: true });
    for (const [key, fraction] of [
      ["Home", 0],
      ["ArrowRight", 0.01],
      ["End", 1],
    ] as const) {
      await timeline.press(key);
      expect(Number(await timeline.getAttribute("aria-valuenow"))).toBeCloseTo(fraction * 3600, 6);
      const point = await sweep
        .locator("circle")
        .last()
        .evaluate((el) => [Number(el.getAttribute("cx")), Number(el.getAttribute("cy"))]);
      expect(point[0]).toBeCloseTo(40 + 320 * fraction, 6);
      expect(point[1]).toBeCloseTo(160 - 280 * fraction * (1 - fraction), 6);
    }

    const input = page.locator("#interact .nk-parameter input[type=range]");
    await expect(input).toBeVisible();
    for (const [key, value, mixed] of [
      ["Home", "0", "20.0"],
      ["ArrowRight", "0.05", "23.0"],
      ["End", "1", "80.0"],
      ["ArrowLeft", "0.95", "77.0"],
    ] as const) {
      await input.press(key);
      await expect(input).toHaveValue(value);
      await expect(page.locator("#interact .guide-readout strong")).toHaveText(mixed);
    }
  });
