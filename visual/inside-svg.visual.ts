import { expect, test, type Locator, type Page } from "./browser-test";

async function open(page: Page, width = 1440) {
  await page.setViewportSize({ width, height: 1100 });
  await page.goto("/notes/inside-svg", { waitUntil: "networkidle" });
  await expect(page.locator("#svg-peel")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}
async function hit(figure: Locator, x: number, y: number) {
  return figure.locator(".svg-artwork").evaluate(
    (node, point) => {
      const svg = node as SVGSVGElement;
      const p = new DOMPoint(point.x, point.y).matrixTransform(svg.getScreenCTM()!);
      return (
        document.elementFromPoint(p.x, p.y)?.closest("[data-layer]")?.getAttribute("data-layer") ??
        null
      );
    },
    { x, y },
  );
}

for (const width of [320, 390, 768, 1440]) {
  test(`SVG layers remain readable and bounded at ${width}px`, async ({ page }, testInfo) => {
    await open(page, width);
    const peel = page.locator("#svg-peel"),
      slider = peel.getByRole("slider", { name: "Separation", exact: true });
    await page.evaluate(() => {
      (window as unknown as { svgNodes: Element[] }).svgNodes = [
        ...document.querySelectorAll(".svg-plane [data-layer]"),
      ];
    });
    const initialTimeline = await slider.evaluate((el) => ({
      top: el.getBoundingClientRect().top + scrollY,
      height: el.getBoundingClientRect().height,
    }));
    for (const key of ["Home", "ArrowRight", "End", "Home", "End"]) {
      await slider.press(key);
      const state = await peel.evaluate((el) => {
        const stage = el.querySelector(".svg-peel-stage")!.getBoundingClientRect();
        const planes = [...el.querySelectorAll(".svg-plane")].map((node) =>
          node.getBoundingClientRect(),
        );
        return {
          stage: { x: stage.x, y: stage.y, right: stage.right, bottom: stage.bottom },
          planes: planes.map((p) => ({ x: p.x, y: p.y, right: p.right, bottom: p.bottom })),
          stable: (window as unknown as { svgNodes: Element[] }).svgNodes.every(
            (n, i) => n === el.querySelectorAll(".svg-plane [data-layer]")[i],
          ),
        };
      });
      expect(state.stable).toBe(true);
      for (const plane of state.planes) {
        expect(plane.x).toBeGreaterThanOrEqual(state.stage.x - 1);
        expect(plane.right).toBeLessThanOrEqual(state.stage.right + 1);
        expect(plane.y).toBeGreaterThanOrEqual(state.stage.y - 1);
        expect(plane.bottom).toBeLessThanOrEqual(state.stage.bottom + 1);
      }
    }
    const finalTimeline = await slider.evaluate((el) => ({
      top: el.getBoundingClientRect().top + scrollY,
      height: el.getBoundingClientRect().height,
    }));
    // Keyboard scrolling changes viewport y; the timeline's document position stays fixed.
    expect(finalTimeline.height).toBe(initialTimeline.height);
    expect(finalTimeline.top).toBeCloseTo(initialTimeline.top, 1);
    const sizes = await page
      .locator(".svg-button,.svg-plane-label,.svg-order-strip,.nk-experiment-action")
      .evaluateAll((nodes) =>
        nodes.map((n) => ({
          font: parseFloat(getComputedStyle(n).fontSize),
          height: n.getBoundingClientRect().height,
          width: n.getBoundingClientRect().width,
          button: n.tagName === "BUTTON",
        })),
      );
    for (const size of sizes) {
      expect(size.font).toBeGreaterThanOrEqual(15);
      if (size.button) {
        expect(size.height).toBeGreaterThanOrEqual(44);
        expect(size.width).toBeGreaterThanOrEqual(44);
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await peel.screenshot({ path: testInfo.outputPath(`peel-${width}.png`) });
    await slider.press("Home");
    await peel.screenshot({ path: testInfo.outputPath(`assembled-${width}.png`) });
    await slider.press("Home");
    for (let i = 0; i < 50; i++) await slider.press("ArrowRight");
    await expect(slider).toHaveAttribute("aria-valuenow", "1300");
    expect(
      await peel
        .locator(".svg-plane-label")
        .evaluateAll((nodes) => nodes.every((n) => getComputedStyle(n).opacity === "0")),
    ).toBe(true);
    await peel.screenshot({ path: testInfo.outputPath(`intermediate-${width}.png`) });
    const clip = page.locator("#svg-clip");
    await clip.getByRole("button", { name: "Left", exact: true }).click();
    await clip.screenshot({ path: testInfo.outputPath(`clip-left-${width}.png`) });
    await clip.getByRole("button", { name: "Right", exact: true }).click();
    await clip.screenshot({ path: testInfo.outputPath(`clip-right-${width}.png`) });
  });
}

test("actual paint order moves the retained sun, and clipping preserves geometry", async ({
  page,
}) => {
  await open(page);
  const order = page.locator("#svg-order"),
    clip = page.locator("#svg-clip");
  await order.scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    (window as unknown as { retainedSun: Element }).retainedSun = document.querySelector(
      '#svg-order [data-layer="sun"]',
    )!;
  });
  expect(await hit(order, 160, 140)).toBe("rear");
  await order.getByRole("button", { name: "Sun in front" }).click();
  expect(await hit(order, 160, 140)).toBe("sun");
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { retainedSun: Element }).retainedSun ===
        document.querySelector('#svg-order [data-layer="sun"]'),
    ),
  ).toBe(true);
  await order.getByRole("button", { name: "Sun in front" }).press("Enter");
  expect(await hit(order, 160, 140)).toBe("rear");
  const geometry = () =>
    clip.locator("[data-scenery]").evaluate((node) => {
      const box = (node as SVGGraphicsElement).getBBox();
      return {
        box: [box.x, box.y, box.width, box.height],
        shapes: [...node.querySelectorAll("[data-layer]")].map((n) => n.outerHTML),
      };
    });
  await clip.scrollIntoViewIfNeeded();
  const original = await geometry();
  await page.evaluate(() => {
    (window as unknown as { clipNodes: Element[] }).clipNodes = [
      ...document.querySelectorAll("#svg-clip [data-layer]"),
    ];
  });
  expect(await hit(clip, 20, 50)).toBe(null);
  for (const position of ["Left", "Right", "Center"]) {
    await clip.getByRole("button", { name: position, exact: true }).click();
    expect(await geometry()).toEqual(original);
  }
  await clip.getByRole("button", { name: "Show beyond the window" }).click();
  expect(await hit(clip, 20, 50)).toBe("sky");
  expect(await geometry()).toEqual(original);
  expect(
    await page.evaluate(() =>
      (window as unknown as { clipNodes: Element[] }).clipNodes.every(
        (n, i) => n === document.querySelectorAll("#svg-clip [data-layer]")[i],
      ),
    ),
  ).toBe(true);
  await clip.getByRole("button", { name: "Show beyond the window" }).press("Space");
  expect(await hit(clip, 20, 50)).toBe(null);
});

test("one scene pauses, seeks, replays and steps under reduced motion", async ({
  page,
}, testInfo) => {
  await open(page, 390);
  const peel = page.locator("#svg-peel"),
    slider = peel.getByRole("slider", { name: "Separation", exact: true });
  await peel.getByRole("button", { name: "Play", exact: true }).click();
  await expect(peel).toHaveAttribute("data-nk-scene-active", "true");
  await page.waitForTimeout(160);
  await peel.getByRole("button", { name: "Pause", exact: true }).click();
  const time = await peel.getAttribute("data-nk-scene-time");
  await page.waitForTimeout(120);
  expect(await peel.getAttribute("data-nk-scene-time")).toBe(time);
  await slider.press("End");
  await expect(peel).toHaveAttribute("data-nk-scene-time", "2600");
  await peel.getByRole("button", { name: "Replay", exact: true }).click();
  expect(Number(await peel.getAttribute("data-nk-scene-time"))).toBeLessThan(500);
  await peel.getByRole("button", { name: "Pause", exact: true }).click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await slider.press("Home");
  await peel.getByRole("button", { name: "Next step", exact: true }).click();
  await expect(peel).toHaveAttribute("data-nk-scene-time", "2600");
  await expect(peel).toHaveAttribute("data-nk-scene-active", "false");
  await peel.getByRole("button", { name: "Replay", exact: true }).click();
  await expect(peel).toHaveAttribute("data-nk-scene-time", "0");
  const forward = page.locator("#svg-order").getByRole("button", { name: "Sun in front" });
  await forward.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  const focus = await forward.evaluate((el) => ({
    width: getComputedStyle(el).outlineWidth,
    style: getComputedStyle(el).outlineStyle,
  }));
  expect(focus.style).toBe("solid");
  expect(parseFloat(focus.width)).toBeGreaterThanOrEqual(2);
  await forward.press("Enter");
  await expect(
    page.locator("#svg-order").getByRole("button", { name: "Sun in front" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.emulateMedia({ forcedColors: "active" });
  await page
    .locator("#svg-order")
    .screenshot({ path: testInfo.outputPath("forced-colors-390.png") });
});
