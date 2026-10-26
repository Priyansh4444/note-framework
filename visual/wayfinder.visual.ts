import { expect, test } from "./browser-test";
async function setup(page: import("@playwright/test").Page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/notes/framework-demo", { waitUntil: "networkidle" });
  await page.locator("#mix").scrollIntoViewIfNeeded();
  await page.evaluate(() => document.fonts.ready);
  const nav = page.getByRole("navigation", { name: "On this page", exact: true });
  await expect(nav.getByRole("slider", { name: "Reading position", exact: true })).toBeVisible();
  return nav;
}
test("page slider follows native scroll and all keys without changing history", async ({
  page,
}) => {
  const nav = await setup(page),
    slider = nav.getByRole("slider");
  const previous = Number(await slider.getAttribute("aria-valuenow"));
  await page.mouse.move(700, 500);
  await page.mouse.wheel(0, 400);
  await expect
    .poll(async () => Number(await slider.getAttribute("aria-valuenow")))
    .toBeGreaterThan(previous);
  const history = await page.evaluate(() => window.history.length),
    url = page.url();
  await slider.focus();
  await slider.press("End");
  await expect
    .poll(() =>
      page.evaluate(() => Math.abs(scrollY - document.documentElement.scrollHeight + innerHeight)),
    )
    .toBeLessThan(2);
  await slider.press("ArrowUp");
  const y = await page.evaluate(() => scrollY);
  await slider.press("ArrowDown");
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(y);
  await slider.press("PageUp");
  expect(await page.evaluate(() => scrollY)).toBeLessThan(y);
  await slider.press("Home");
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  expect(page.url()).toBe(url);
  expect(await page.evaluate(() => window.history.length)).toBe(history);
});
test("pointer projection, cancellation, disclosure remeasurement and wide diagram clearance", async ({
  page,
}) => {
  const nav = await setup(page),
    slider = nav.getByRole("slider");
  const geometry = await nav.evaluate((el) => {
    const path = el.querySelector<SVGPathElement>(".nk-outline-track-base")!,
      matrix = path.getScreenCTM()!;
    return {
      curve: path.getAttribute("d"),
      points: [0.25, 0.6, 0.85].map((t) => {
        const p = path.getPointAtLength(path.getTotalLength() * t);
        const q = new DOMPoint(p.x, p.y).matrixTransform(matrix);
        return { x: q.x, y: q.y };
      }),
      nav: el.getBoundingClientRect().left,
      wide: (innerWidth - 980) / 2 + 980,
    };
  });
  expect(geometry.curve).toContain("Q");
  expect(geometry.nav).toBeGreaterThan(geometry.wide);
  for (const fraction of [0.25, 0.6, 0.85]) {
    const point = await slider.evaluate((el, fraction) => {
      const path = el.querySelector<SVGPathElement>(".nk-outline-track-base")!,
        p = path.getPointAtLength(path.getTotalLength() * fraction);
      const q = new DOMPoint(p.x, p.y).matrixTransform(path.getScreenCTM()!);
      return { x: q.x, y: q.y };
    }, fraction);
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.up();
    const error = await slider.evaluate((el, point) => {
      const thumb = el.querySelector<SVGPathElement>(".nk-outline-playhead")!;
      const p = thumb.getPointAtLength(thumb.getTotalLength() / 2);
      const q = new DOMPoint(p.x, p.y).matrixTransform(thumb.getScreenCTM()!);
      return Math.hypot(point.x - q.x, point.y - q.y);
    }, point);
    expect(error).toBeLessThan(1.5);
  }
  await slider.dispatchEvent("pointercancel", { pointerId: 1, isPrimary: true });
  await slider.focus();
  await slider.press("Home");
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await page.locator("#nest").scrollIntoViewIfNeeded();
  await expect(nav.locator("a[aria-current=location]")).toHaveCount(1);
  await page.evaluate(() => document.fonts.dispatchEvent(new Event("loadingdone")));
  await page.waitForTimeout(40);
  await nav.screenshot({ path: "/tmp/diff-page-motion/implementation-wayfinder.png" });
});
for (const width of [320, 390, 768, 1360])
  test(`small page map keeps semantic Contents at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/notes/framework-demo", { waitUntil: "networkidle" });
    await expect(
      page.getByRole("navigation", { name: "On this page", exact: true }).getByRole("slider"),
    ).not.toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
  });

test("grabbing the reading thumb off center preserves the page before moving", async ({ page }) => {
  const nav = await setup(page);
  const thumb = nav.locator(".nk-outline-playhead");
  const grab = await thumb.evaluate((el) => {
    const path = el as SVGPathElement,
      p = path.getPointAtLength(16);
    const q = new DOMPoint(p.x, p.y).matrixTransform(path.getScreenCTM()!);
    return { x: q.x, y: q.y };
  });
  const initial = await page.evaluate(() => scrollY);
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  expect(Math.abs((await page.evaluate(() => scrollY)) - initial)).toBeLessThan(1);
  await page.mouse.move(grab.x, grab.y + 15);
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(initial);
  await page.mouse.up();
});

test("reading marker is a blue 24px path segment at document endpoints", async ({ page }) => {
  const nav = await setup(page),
    slider = nav.getByRole("slider");
  for (const key of ["Home", "End"]) {
    await slider.press(key);
    await expect
      .poll(async () =>
        nav.locator(".nk-outline-playhead").evaluate((el, key) => {
          const marker = el as SVGPathElement,
            rail = el.closest("svg")!.querySelector<SVGPathElement>(".nk-outline-track-base")!;
          const a = marker.getPointAtLength(key === "Home" ? 0 : marker.getTotalLength());
          const b = rail.getPointAtLength(key === "Home" ? 0 : rail.getTotalLength());
          return Math.hypot(a.x - b.x, a.y - b.y);
        }, key),
      )
      .toBeLessThan(0.5);
    const shape = await nav.locator(".nk-outline-playhead").evaluate((el) => ({
      tag: el.tagName,
      length: (el as SVGPathElement).getTotalLength(),
      fill: getComputedStyle(el).fill,
      stroke: getComputedStyle(el).stroke,
    }));
    expect(shape.tag).toBe("path");
    expect(shape.length).toBeCloseTo(24, 1);
    expect(shape.fill).toBe("none");
    expect(shape.stroke).not.toBe("none");
  }
  await expect(nav.locator(".nk-outline-playhead-halo")).toHaveCount(0);
  await nav.screenshot({ path: "/tmp/service-curves/kit-wayfinder.png" });
});

test("reading keyboard focus is confined to its line marker", async ({ page }) => {
  const nav = await setup(page),
    slider = nav.getByRole("slider");
  await slider.press("Home");
  for (const forcedColors of ["none", "active"] as const) {
    await page.emulateMedia({ forcedColors });
    const focus = await slider.evaluate((el) => {
      const core = el.querySelector<SVGPathElement>(".nk-outline-playhead")!,
        ring = el.querySelector<SVGPathElement>(".nk-outline-playhead-focus")!;
      return {
        outline: getComputedStyle(el).outlineStyle,
        opacity: getComputedStyle(ring).opacity,
        same: core.getAttribute("d") === ring.getAttribute("d"),
        length: ring.getTotalLength(),
        stroke: getComputedStyle(ring).stroke,
        coreStroke: getComputedStyle(core).stroke,
      };
    });
    expect(focus.outline).toBe("none");
    expect(focus.opacity).toBe("1");
    expect(focus.same).toBe(true);
    expect(focus.length).toBeCloseTo(24, 1);
    expect(focus.stroke).not.toBe(focus.coreStroke);
  }
});
