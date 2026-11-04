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
      .locator(
        ".nk-choice button,.nk-action,.svg-plane-label,.svg-order-strip,.nk-experiment-action",
      )
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
    await clip.getByRole("radio", { name: "Left", exact: true }).click();
    await clip.screenshot({ path: testInfo.outputPath(`clip-left-${width}.png`) });
    await clip.getByRole("radio", { name: "Right", exact: true }).click();
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
  await order.getByRole("radio", { name: "Sun in front" }).click();
  expect(await hit(order, 160, 140)).toBe("sun");
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { retainedSun: Element }).retainedSun ===
        document.querySelector('#svg-order [data-layer="sun"]'),
    ),
  ).toBe(true);
  await order.getByRole("radio", { name: "Sun in front" }).press("ArrowLeft");
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
    await clip.getByRole("radio", { name: position, exact: true }).click();
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
  const forward = page.locator("#svg-order").getByRole("radio", { name: "Sun behind" });
  await forward.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  const focus = await forward.evaluate((el) => ({
    width: getComputedStyle(el).outlineWidth,
    style: getComputedStyle(el).outlineStyle,
  }));
  expect(focus.style).toBe("solid");
  expect(parseFloat(focus.width)).toBeGreaterThanOrEqual(2);
  await forward.press("ArrowRight");
  await expect(
    page.locator("#svg-order").getByRole("radio", { name: "Sun in front" }),
  ).toHaveAttribute("aria-checked", "true");
  await page.emulateMedia({ forcedColors: "active" });
  await page
    .locator("#svg-order")
    .screenshot({ path: testInfo.outputPath("forced-colors-390.png") });
});

test("the path instrument writes the source's own bell and follows the slit", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/notes/inside-svg", { waitUntil: "networkidle" });
  const root = page.locator("#svg-path"),
    source = root.getByRole("slider", { name: "Source line" }),
    ink = root.locator("[data-path-ink]"),
    live = root.locator("[data-instrument-live]");
  await source.scrollIntoViewIfNeeded();
  // At rest it is the finished bell, at the stroke the source asks for.
  await expect(live).toContainText("11/11 C · pen 59 82");
  await expect(ink).toHaveAttribute("stroke-width", "6");
  await expect(ink).toHaveAttribute("stroke-linejoin", "round");
  const finished = await ink.evaluate((el) => (el as SVGPathElement).getTotalLength());
  expect(Number((await live.innerText()).match(/length (\d+)/)![1])).toBeCloseTo(finished, -1);

  // Each key is one line: nothing inked yet, then the pen lands, then the first curve.
  await source.press("Home");
  await expect(ink).toHaveAttribute("stroke-width", "1.25");
  for (let i = 0; i < 3; i++) await source.press("ArrowDown");
  await expect(live).toContainText("1/11 M · pen 50 10");
  await source.press("ArrowDown");
  await expect(live).toContainText("2/11 C · pen 23 45");
  await expect(source).toHaveAttribute("aria-valuetext", /C 31 10, 23 26, 23 45|V 62/);

  // Nodes persist through dragging, and the real path's length matches the readout mid-stroke.
  const node = await ink.elementHandle();
  const box = (await source.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.45);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.6, { steps: 4 });
  await page.mouse.up();
  expect(await node!.evaluate((el) => el.isConnected)).toBe(true);
  const drawn = await ink.evaluate((el) => (el as SVGPathElement).getTotalLength());
  expect(Number((await live.innerText()).match(/length (\d+)/)![1])).toBeCloseTo(drawn, -1);

  // The slit's window shows true text; beyond it, the source reads as noise.
  const lines = root.locator(".svg-path-text");
  const shown = await lines.allInnerTexts();
  expect(shown.join("\n")).not.toContain("stroke-linejoin");
  await source.press("End");
  await source.press("ArrowUp");
  await source.press("ArrowUp");
  await expect(lines.nth(15)).toContainText("stroke-linejoin");

  // Play writes it again from the first line on one clock.
  await root.locator("[data-nk-scene-action]").click();
  await expect(root).toHaveAttribute("data-nk-scene-active", "true");
  await expect
    .poll(async () => Number(await root.getAttribute("data-nk-scene-time")))
    .toBeLessThan(6400);
  await expect(root.locator("[data-nk-scene-action]")).toHaveAttribute(
    "data-nk-scene-action",
    "play",
    { timeout: 9000 },
  );
  await expect(live).toContainText("11/11 C");
});

test("on a phone only the grip takes the slit, so the source still scrolls the page", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/notes/inside-svg", { waitUntil: "networkidle" });
  const root = page.locator("#svg-path");
  await root.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  const touch = await root.evaluate((el) => ({
    column: getComputedStyle(el.querySelector(".svg-path-source")!).touchAction,
    grip: getComputedStyle(el.querySelector(".svg-path-grip")!).touchAction,
    gripSize: (() => {
      const box = el.querySelector(".svg-path-grip")!.getBoundingClientRect();
      return [box.width, box.height];
    })(),
    picture: el.querySelector(".nk-diagram")!.getBoundingClientRect().bottom,
    source: el.querySelector(".svg-path-source")!.getBoundingClientRect().top,
  }));
  expect(touch.column).toBe("pan-y");
  expect(touch.grip).toBe("none");
  expect(touch.gripSize).toEqual([44, 44]);
  expect(touch.picture).toBeLessThanOrEqual(touch.source);
});
