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

for (const width of [1440, 1920])
  test(`the compact reading map hugs the article and ends in a dot at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/notes/framework-demo", { waitUntil: "networkidle" });
    await page.locator("#mix").scrollIntoViewIfNeeded();
    const nav = page.getByRole("navigation", { name: "On this page", exact: true });
    await expect(nav.getByRole("slider")).toBeVisible();
    const geometry = await nav.evaluate((el) => {
      const bounds = el.getBoundingClientRect(),
        slider = el.querySelector<HTMLElement>(".nk-outline-slider")!,
        svg = slider.querySelector("svg")!,
        path = svg.querySelector<SVGPathElement>(".nk-outline-track-base")!,
        terminal = svg.querySelector<SVGCircleElement>(".nk-outline-terminal")!,
        end = path.getPointAtLength(path.getTotalLength());
      return {
        left: bounds.left,
        right: bounds.right,
        width: bounds.width,
        rail: slider.getBoundingClientRect().width,
        viewBox: svg.viewBox.baseVal.width,
        titles: [...el.querySelectorAll(".nk-outline-route .nk-outline-title")].map(
          (label) => label.getBoundingClientRect().width,
        ),
        terminalError: Math.hypot(
          terminal.cx.baseVal.value - end.x,
          terminal.cy.baseVal.value - end.y,
        ),
        radius: terminal.r.baseVal.value,
      };
    });
    expect(geometry.width).toBe(192);
    expect(geometry.left - (width + 980) / 2).toBe(16);
    expect(geometry.right).toBeLessThanOrEqual(width - 16);
    expect(geometry.rail).toBe(44);
    expect(geometry.viewBox).toBe(44);
    for (const label of geometry.titles) expect(label).toBeGreaterThanOrEqual(100);
    expect(geometry.terminalError).toBeLessThan(0.01);
    expect(geometry.radius).toBe(3.5);
    expect(
      await page.locator(".bz-example-nav").evaluate((el) => el.getBoundingClientRect().width),
    ).toBe(980);
    await nav.getByRole("slider").press("End");
    await expect(nav.locator(".nk-outline-terminal")).toHaveClass(/is-reached/);
    await nav.getByRole("slider").press("Home");
    await expect(nav.locator(".nk-outline-terminal")).not.toHaveClass(/is-reached/);
    await page.locator("#mix").scrollIntoViewIfNeeded();
    await nav.getByRole("slider").evaluate((el) => (el as HTMLElement).blur());
    await nav.screenshot({ path: `artifacts/compact-wayfinder/outline-${width}.png` });
    await page.screenshot({ path: `artifacts/compact-wayfinder/page-${width}.png` });
  });

test("the compact header keeps both phone navigation targets usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/notes/framework-demo", { waitUntil: "networkidle" });
  const nav = page.locator(".bz-example-nav");
  const layout = await nav.evaluate((el) => ({
    width: el.getBoundingClientRect().width,
    links: [...el.querySelectorAll("a")].map((a) => a.getBoundingClientRect().height),
    overflow: document.documentElement.scrollWidth > innerWidth,
  }));
  expect(layout.width).toBe(350);
  expect(layout.overflow).toBe(false);
  for (const height of layout.links) expect(height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: "artifacts/compact-wayfinder/page-390.png" });
});
