import { mkdir, writeFile } from "node:fs/promises";
import { expect, test, type Locator } from "./browser-test";

const artifacts = "/tmp/rounded-playhead";
test.beforeAll(() => mkdir(artifacts, { recursive: true }));

async function roundedPaint(slider: Locator, coreClass: string, railClass: string) {
  const paint = await slider.evaluate(
    (el, { coreClass, railClass }) => {
      const core = el.querySelector<SVGPathElement>(`.${coreClass}`)!;
      const focus = el.querySelector<SVGPathElement>(`.${coreClass}-focus`)!;
      const rail = el.querySelector<SVGPathElement>(`.${railClass}`)!;
      const style = (path: SVGPathElement) => {
        const s = getComputedStyle(path);
        return {
          cap: s.strokeLinecap,
          join: s.strokeLinejoin,
          width: s.strokeWidth,
          stroke: s.stroke,
          opacity: s.opacity,
        };
      };
      return {
        core: style(core),
        focus: style(focus),
        rail: style(rail),
        length: core.getTotalLength(),
        samePath: core.getAttribute("d") === focus.getAttribute("d"),
        outline: getComputedStyle(el).outlineStyle,
      };
    },
    { coreClass, railClass },
  );
  expect(paint.core.cap).toBe("round");
  expect(paint.core.join).toBe("round");
  expect(paint.focus.cap).toBe("round");
  expect(paint.focus.join).toBe("round");
  expect(paint.rail.cap).toBe("round");
  expect(paint.core.width).toBe("4px");
  expect(paint.focus.width).toBe("8px");
  expect(paint.length).toBeCloseTo(24, 1);
  expect(paint.samePath).toBe(true);
  expect(paint.outline).toBe("none");
  expect(paint.focus.opacity).toBe("1");
  expect(paint.core.stroke).not.toBe("none");
  expect(paint.focus.stroke).not.toBe(paint.core.stroke);
  expect(paint.rail.stroke).not.toBe("none");
  return paint;
}

for (const width of [1280, 390, 320])
  test(`scene paint has soft ends at Home, middle and End at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/notes/framework-demo", { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    const figure = page.locator(".bz-first-try figure");
    const slider = figure.getByRole("slider", { name: "Curve playback", exact: true });
    await expect(
      figure.locator(".nk-timeline-slider:visible, input[type=range]:visible"),
    ).toHaveCount(1);
    const measurements = [];
    for (const forcedColors of ["none", "active"] as const) {
      await page.emulateMedia({ forcedColors });
      for (const position of ["Home", "middle", "End"]) {
        await slider.press(position === "middle" ? "Home" : position);
        if (position === "middle") for (let i = 0; i < 50; i++) await slider.press("ArrowRight");
        const fraction = position === "Home" ? 0 : position === "End" ? 1 : 0.5;
        expect(Number(await slider.getAttribute("aria-valuenow"))).toBeCloseTo(fraction * 6000, 5);
        measurements.push({
          forcedColors,
          position,
          ...(await roundedPaint(slider, "nk-timeline-thumb", "nk-timeline-rail")),
        });
        await slider.screenshot({
          path: `${artifacts}/scene-${width}-${forcedColors}-${position}.png`,
        });
      }
    }
    await writeFile(
      `${artifacts}/scene-paint-${width}.json`,
      JSON.stringify(measurements, null, 2),
    );
  });

test("reading paint has the same soft ends and localized focus at Home, middle and End", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/notes/framework-demo", { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const slider = page.getByRole("slider", { name: "Reading position", exact: true });
  const measurements = [];
  for (const forcedColors of ["none", "active"] as const) {
    await page.emulateMedia({ forcedColors });
    for (const position of ["Home", "middle", "End"]) {
      await slider.press(position === "middle" ? "Home" : position);
      if (position === "middle") for (let i = 0; i < 50; i++) await slider.press("ArrowDown");
      await expect
        .poll(() =>
          slider.evaluate(
            (el) =>
              Number(el.getAttribute("aria-valuenow")) / Number(el.getAttribute("aria-valuemax")),
          ),
        )
        .toBeCloseTo(position === "Home" ? 0 : position === "End" ? 1 : 0.5, 2);
      measurements.push({
        forcedColors,
        position,
        ...(await roundedPaint(slider, "nk-outline-playhead", "nk-outline-track-base")),
      });
      await slider.screenshot({ path: `${artifacts}/reading-${forcedColors}-${position}.png` });
    }
  }
  await writeFile(`${artifacts}/reading-paint.json`, JSON.stringify(measurements, null, 2));
});

for (const width of [1280, 390, 320])
  test(`existing P0–P3 labels stay readable and in bounds through presets and point keys at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/notes/framework-demo", { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    const figure = page.locator(".bz-first-try figure");
    const handles = figure.locator(".bz-handle");
    const labels = handles.locator(".bz-label");
    await expect(labels).toHaveText(["P0", "P1", "P2", "P3"]);
    // Retain actual browser node references across preset and coordinate updates.
    const persistent = await figure.evaluateHandle((el) =>
      [...el.querySelectorAll(".bz-handle")].flatMap((handle) => [
        handle,
        handle.querySelector(".bz-label"),
      ]),
    );
    const measurements: unknown[] = [];
    async function measure(state: string) {
      await figure.locator(".nk-diagram").scrollIntoViewIfNeeded();
      for (const label of await labels.all()) await expect(label).toBeVisible();
      const geometry = await figure.evaluate((el) => {
        const box = el.querySelector(".nk-diagram")!.getBoundingClientRect();
        return [...el.querySelectorAll<SVGTextElement>(".bz-handle .bz-label")].map((label) => {
          const b = label.getBoundingClientRect(),
            m = label.getScreenCTM()!,
            s = getComputedStyle(label);
          const clippingAncestors = [];
          for (let parent = label.parentElement; parent; parent = parent.parentElement) {
            const style = getComputedStyle(parent),
              bounds = parent.getBoundingClientRect();
            if (
              (style.overflowX !== "visible" && (b.left < bounds.left || b.right > bounds.right)) ||
              (style.overflowY !== "visible" && (b.top < bounds.top || b.bottom > bounds.bottom))
            )
              clippingAncestors.push(parent.className);
          }
          return {
            text: label.textContent,
            fontPx: parseFloat(s.fontSize) * Math.hypot(m.a, m.b),
            fill: s.fill,
            opacity: s.opacity,
            svgClearance: Math.min(
              b.left - box.left,
              box.right - b.right,
              b.top - box.top,
              box.bottom - b.bottom,
            ),
            clippingAncestors,
            viewportClearance: Math.min(b.left, innerWidth - b.right),
          };
        });
      });
      for (const label of geometry) {
        expect(label.fontPx).toBeGreaterThanOrEqual(15.9);
        expect(label.fill).not.toBe("none");
        expect(label.opacity).toBe("1");
        // SVG overflow is intentionally visible: test the actual clipping bounds.
        expect(label.clippingAncestors, `${state} ${label.text} clipping`).toEqual([]);
        expect(
          label.viewportClearance,
          `${state} ${label.text} viewport bounds`,
        ).toBeGreaterThanOrEqual(0);
      }
      expect(
        await figure.evaluate((el, prior) => {
          const current = [...el.querySelectorAll(".bz-handle")].flatMap((handle) => [
            handle,
            handle.querySelector(".bz-label"),
          ]);
          return prior.every((node, i) => node === current[i]);
        }, persistent),
      ).toBe(true);
      measurements.push({ state, labels: geometry });
    }
    for (const preset of ["Arch", "S bend", "Straight"]) {
      await figure.getByRole("button", { name: preset, exact: true }).click();
      await measure(preset);
      await page.screenshot({ path: `${artifacts}/labels-${width}-${preset}.png` });
    }
    for (let i = 0; i < 4; i++) {
      await figure.getByRole("button", { name: "Arch", exact: true }).click();
      const handle = handles.nth(i);
      const start = await handle.locator(".bz-dot").getAttribute("cx");
      await handle.press("ArrowRight");
      await expect(handle.locator(".bz-dot")).toHaveAttribute("cx", String(Number(start) + 4));
      await measure(`P${i} ArrowRight`);
      for (const key of [
        i < 2 ? "Shift+ArrowLeft" : "Shift+ArrowRight",
        i === 0 || i === 3 ? "Shift+ArrowDown" : "Shift+ArrowUp",
      ])
        for (let step = 0; step < 28; step++) await handle.press(key);
      await expect(handle.locator(".bz-dot")).toHaveAttribute("cx", i < 2 ? "24" : "536");
      await expect(handle.locator(".bz-dot")).toHaveAttribute(
        "cy",
        i === 0 || i === 3 ? "316" : "24",
      );
      await measure(`P${i} boundary`);
      await page.screenshot({ path: `${artifacts}/labels-${width}-P${i}-boundary.png` });
    }
    await writeFile(`${artifacts}/labels-${width}.json`, JSON.stringify(measurements, null, 2));
    await persistent.dispose();
  });
