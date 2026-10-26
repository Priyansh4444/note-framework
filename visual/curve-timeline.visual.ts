import { expect, test, type Page } from "./browser-test";
async function setup(page: Page, width = 390) {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto("/visual/fixture.html", { waitUntil: "networkidle" });
  await page.addScriptTag({
    type: "module",
    content:
      'import {mountCurveTimelineFixture} from "/visual/curve-timeline.fixture.tsx"; mountCurveTimelineFixture();',
  });
  await page.evaluate(() => document.fonts.ready);
  return page.locator("[data-nk-timeline]");
}
for (const width of [1440, 768, 390, 320])
  test(`S scrubber follows actual path and has readable targets at ${width}px`, async ({
    page,
  }) => {
    const timeline = await setup(page, width),
      slider = timeline.getByRole("slider");
    await expect(slider).toHaveAttribute("aria-orientation", "horizontal");
    for (const key of ["Home", "ArrowRight", "PageUp", "End"]) {
      await slider.press(key);
      const geometry = await timeline.evaluate((el) => {
        const root = el.closest("[data-nk-scene]")!,
          u =
            Number(root.getAttribute("data-nk-scene-time")) /
            Number(root.getAttribute("data-nk-scene-length"));
        const path = el.querySelector<SVGPathElement>(".nk-timeline-rail")!,
          thumb = el.querySelector<SVGPathElement>(".nk-timeline-thumb")!;
        const expected = path.getPointAtLength(path.getTotalLength() * u),
          length = thumb.getTotalLength();
        const at = path.getTotalLength() * u,
          start = Math.max(0, Math.min(path.getTotalLength() - 24, at - 12));
        const actual = thumb.getPointAtLength(at - start);
        return {
          tag: thumb.tagName,
          length,
          error: Math.hypot(expected.x - actual.x, expected.y - actual.y),
          u,
        };
      });
      expect(geometry.tag).toBe("path");
      expect(geometry.length).toBeCloseTo(24, 1);
      expect(geometry.error).toBeLessThan(0.5);
      if (key === "Home") expect(geometry.u).toBe(0);
      if (key === "End") expect(geometry.u).toBe(1);
    }
    const geometry = await timeline.evaluate((el) => {
      const figure = el.closest("figure")!,
        stage = figure.querySelector(".nk-experiment-stage")!.getBoundingClientRect(),
        actions = figure.querySelector(".nk-experiment-actions")!.getBoundingClientRect(),
        r = el.getBoundingClientRect();
      return {
        right: r.right,
        scroll: document.documentElement.scrollWidth,
        gap: r.top - stage.bottom,
        actionGap: actions.top - r.bottom,
        buttons: [...el.querySelectorAll("button")].map((button) => ({
          width: button.getBoundingClientRect().width,
          height: button.getBoundingClientRect().height,
          size: parseFloat(getComputedStyle(button).fontSize),
        })),
      };
    });
    expect(geometry.scroll).toBeLessThanOrEqual(width);
    expect(geometry.right).toBeLessThanOrEqual(width);
    expect(geometry.gap).toBeGreaterThanOrEqual(24);
    expect(geometry.actionGap).toBeGreaterThanOrEqual(16);
    for (const button of geometry.buttons) {
      expect(button.width).toBeGreaterThanOrEqual(44);
      expect(button.height).toBeGreaterThanOrEqual(44);
      expect(button.size).toBeGreaterThanOrEqual(15);
    }
    await slider.press("ArrowLeft");
    await page
      .locator("figure")
      .screenshot({ path: `/tmp/service-curves/kit-timeline-${width}.png` });
  });

test("offset grab, primary capture, Escape, cancellation and resize never resume playback", async ({
  page,
}) => {
  const timeline = await setup(page),
    slider = timeline.getByRole("slider");
  const points = await slider.evaluate((el) => {
    const thumb = el.querySelector<SVGPathElement>(".nk-timeline-thumb")!,
      rail = el.querySelector<SVGPathElement>(".nk-timeline-rail")!;
    const point = thumb.getPointAtLength(17),
      q = new DOMPoint(point.x, point.y).matrixTransform(thumb.getScreenCTM()!);
    const next = rail.getPointAtLength(rail.getTotalLength() * 0.7),
      r = new DOMPoint(next.x, next.y).matrixTransform(rail.getScreenCTM()!);
    return { grab: { x: q.x, y: q.y }, next: { x: r.x, y: r.y }, length: rail.getTotalLength() };
  });
  const initial = Number(await slider.getAttribute("aria-valuenow"));
  await page.mouse.move(points.grab.x, points.grab.y);
  await page.mouse.down();
  expect(
    (Math.abs(Number(await slider.getAttribute("aria-valuenow")) - initial) / 6000) * points.length,
  ).toBeLessThan(1);
  await page.mouse.move(points.next.x, points.next.y);
  expect(Number(await slider.getAttribute("aria-valuenow"))).toBeGreaterThan(initial);
  await slider.press("Escape");
  const escaped = await slider.getAttribute("aria-valuenow");
  await page.mouse.move(points.grab.x, points.grab.y);
  expect(await slider.getAttribute("aria-valuenow")).toBe(escaped);
  await page.mouse.up();
  await slider.dispatchEvent("pointerdown", {
    pointerId: 9,
    button: 0,
    isPrimary: false,
    clientX: points.grab.x,
    clientY: points.grab.y,
  });
  expect(await slider.getAttribute("aria-valuenow")).toBe(escaped);
  for (const reason of ["pointercancel", "lostpointercapture", "resize"]) {
    await page.mouse.move(points.grab.x, points.grab.y);
    await page.mouse.down();
    if (reason === "resize") await page.setViewportSize({ width: 400, height: 1000 });
    else await slider.dispatchEvent(reason, { pointerId: 1, isPrimary: true });
    const stopped = await slider.getAttribute("aria-valuenow");
    await page.mouse.move(points.next.x, points.next.y);
    expect(await slider.getAttribute("aria-valuenow")).toBe(stopped);
    await page.mouse.up();
  }
  await expect(page.locator("[data-nk-scene]")).toHaveAttribute("data-nk-scene-active", "false");
});

test("zoom, enlarged text, reduced motion and forced colors preserve the rail", async ({
  page,
}) => {
  const timeline = await setup(page, 390);
  await page.evaluate(() => {
    document.documentElement.style.zoom = "1.5";
    document.documentElement.style.fontSize = "24px";
  });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(390);
  const fit = await timeline.evaluate((el) => {
    const slider = el.querySelector(".nk-timeline-slider")!,
      svg = slider.querySelector("svg")!;
    return { slider: slider.getBoundingClientRect().width, svg: svg.getBoundingClientRect().width };
  });
  expect(Math.abs(fit.slider - fit.svg)).toBeLessThan(1);
  await timeline.getByRole("slider").press("Home");
  await timeline.getByRole("slider").press("ArrowRight");
  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
  await expect(page.getByRole("button", { name: "Next step", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next step", exact: true }).click();
  await expect(page.locator("[data-nk-scene]")).toHaveAttribute("data-nk-scene-active", "false");
  expect(
    await timeline.locator(".nk-timeline-thumb").evaluate((el) => getComputedStyle(el).stroke),
  ).not.toBe("none");
  await page
    .locator("figure")
    .screenshot({ path: "/tmp/service-curves/kit-timeline-zoom-forced-colors.png" });
});

test("keyboard focus follows only the blue marker, including forced colors", async ({ page }) => {
  const timeline = await setup(page),
    slider = timeline.getByRole("slider");
  await slider.press("End");
  for (const forcedColors of ["none", "active"] as const) {
    await page.emulateMedia({ forcedColors });
    const focus = await slider.evaluate((el) => {
      const core = el.querySelector<SVGPathElement>(".nk-timeline-thumb")!,
        ring = el.querySelector<SVGPathElement>(".nk-timeline-thumb-focus")!;
      return {
        outline: getComputedStyle(el).outlineStyle,
        opacity: getComputedStyle(ring).opacity,
        core: core.getAttribute("d"),
        ring: ring.getAttribute("d"),
        length: ring.getTotalLength(),
        stroke: getComputedStyle(ring).stroke,
        coreStroke: getComputedStyle(core).stroke,
      };
    });
    expect(focus.outline).toBe("none");
    expect(focus.opacity).toBe("1");
    expect(focus.core).toBe(focus.ring);
    expect(focus.length).toBeCloseTo(24, 1);
    expect(focus.stroke).not.toBe("none");
    expect(focus.stroke).not.toBe(focus.coreStroke);
  }
  await page.emulateMedia({ forcedColors: "none" });
  await page.locator("figure").screenshot({ path: "/tmp/service-curves/kit-timeline-focused.png" });
});

for (const width of [320, 390, 768, 1440])
  test(`actual demo stage, controls and actions stay separated at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/notes/framework-demo", { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    const measured = await page.locator(".nk-experiment-with-timeline").evaluateAll((bodies) =>
      bodies.map((body) => {
        const figure = body.closest("figure")!,
          stage = body.querySelector(".nk-experiment-stage")!.getBoundingClientRect(),
          timeline = body.querySelector("[data-nk-timeline]")!.getBoundingClientRect();
        const groups = [
          body,
          ...figure.querySelectorAll(
            ":scope > .nk-experiment-controls,:scope > .nk-experiment-actions",
          ),
        ]
          .map((el) => el.getBoundingClientRect())
          .filter((r) => r.height > 0)
          .sort((a, b) => a.top - b.top);
        return {
          stageGap: timeline.top - stage.bottom,
          groupGaps: groups.slice(1).map((r, i) => r.top - groups[i].bottom),
        };
      }),
    );
    expect(measured.length).toBeGreaterThanOrEqual(4);
    for (const figure of measured) {
      expect(figure.stageGap).toBeGreaterThanOrEqual(24);
      for (const gap of figure.groupGaps) expect(gap).toBeGreaterThanOrEqual(16);
    }
    await page
      .locator(".bz-first-try .nk-experiment")
      .screenshot({ path: `/tmp/service-curves/kit-construction-${width}.png` });
  });

test("the whole shifted endpoint marker is grabbable without a jump", async ({ page }) => {
  const timeline = await setup(page),
    slider = timeline.getByRole("slider");
  for (const key of ["Home", "End"]) {
    await slider.press(key);
    const at = await slider.getAttribute("aria-valuenow");
    const point = await timeline.locator(".nk-timeline-thumb").evaluate((el, key) => {
      const path = el as SVGPathElement,
        p = path.getPointAtLength(key === "Home" ? 24 : 0),
        q = new DOMPoint(p.x, p.y).matrixTransform(path.getScreenCTM()!);
      return { x: q.x, y: q.y };
    }, key);
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    expect(Math.abs(Number(await slider.getAttribute("aria-valuenow")) - Number(at))).toBeLessThan(
      0.001,
    );
    await page.mouse.up();
  }
});

test("integrated Service rail keeps localized keyboard focus and bottom actions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/notes/shared-service", { waitUntil: "networkidle" });
  const slider = page.getByRole("slider", { name: "Service position", exact: true });
  await slider.press("End");
  const focus = await slider.evaluate((el) => ({
    outline: getComputedStyle(el).outlineStyle,
    opacity: getComputedStyle(el.querySelector(".nk-timeline-thumb-focus")!).opacity,
  }));
  expect(focus.outline).toBe("none");
  expect(focus.opacity).toBe("1");
  await page
    .locator("figure.nk-experiment")
    .screenshot({ path: "/tmp/service-curves/kit-service-focused-1440.png" });
});
