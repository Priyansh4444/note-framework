import { expect, test } from "./browser-test";

for (const width of [390, 1440]) {
  test(`weights keep exact ties and a separate grip at ${width}px`, async ({ page }) => {
    const fonts: number[] = [];
    page.on("response", (response) => {
      if (/\.woff2?(?:\?|$)/.test(response.url())) fonts.push(response.status());
    });
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/notes/framework-demo#weights", { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    expect(fonts.length).toBeGreaterThan(0);
    expect(fonts.every((status) => status === 200)).toBe(true);
    const root = page.locator("#weight-experiment");
    await root.scrollIntoViewIfNeeded();
    expect((await root.boundingBox())!.height).toBeLessThan(765);
    const grip = root.getByRole("slider", { name: "Chart cursor t", exact: true });
    await expect(grip.locator("[data-handle-mark=bar]")).toHaveCount(1);
    await expect(grip.locator(".nk-handle-dot")).toHaveCount(0);
    await expect(root.locator(".nk-area")).toHaveCount(1);
    for (const [key, target, ties] of [
      ["Home", 0, 1],
      ["End", 1, 1],
      ["Home", 0, 1],
    ] as const) {
      await grip.press(key);
      await expect(grip).toHaveAttribute("aria-valuenow", String(target));
      await expect(root.locator("[data-weight-tie]")).toHaveCount(ties);
      const state = await root.evaluate((el) => {
        const marks = [...el.querySelectorAll<SVGCircleElement>("[data-weight-point]")];
        const handle = el.querySelector<SVGGElement>('[aria-label="Chart cursor t"]')!;
        const hit = handle.querySelector<SVGCircleElement>(".nk-handle-hit")!;
        return {
          y: hit.cy.baseVal.value,
          positions: marks.map((n) => ({ x: n.cx.baseVal.value, y: n.cy.baseVal.value })),
          label: handle.getAttribute("aria-valuenow"),
          hit: hit.getBoundingClientRect().width,
        };
      });
      expect(state.hit).toBeCloseTo(44, 1);
      expect(state.y).toBeGreaterThan(148);
      const t = Number(state.label);
      const weights = [(1 - t) ** 3, 3 * t * (1 - t) ** 2, 3 * t * t * (1 - t), t ** 3];
      for (let i = 0; i < 4; i++) {
        expect(state.positions[i].x).toBeCloseTo(44 + 496 * t, 8);
        expect(state.positions[i].y).toBeCloseTo(148 - 132 * weights[i], 8);
      }
    }
    for (let i = 0; i < 5; i++) await grip.press("Shift+ArrowRight");
    await expect(grip).toHaveAttribute("aria-valuenow", "0.5");
    await expect(root.locator("[data-weight-tie]")).toHaveCount(2);
    await expect(root.locator("[data-weight-tie]").first()).toHaveAttribute(
      "aria-label",
      /equal weight/,
    );
    await grip.evaluate((el) => (el as SVGElement).blur());
    await root.screenshot({ path: test.info().outputPath(`weights-${width}.png`) });
    const labels = await root.locator("svg text").evaluateAll((nodes) =>
      nodes.map((n) => {
        const b = n.getBoundingClientRect(),
          s = n.closest("svg")!.getBoundingClientRect();
        return (
          b.left >= s.left - 1 &&
          b.right <= s.right + 1 &&
          b.top >= s.top - 1 &&
          b.bottom <= s.bottom + 1
        );
      }),
    );
    expect(labels.every(Boolean)).toBe(true);
    for (const [name, keys] of [
      ["Control point P₀", ["Shift+ArrowLeft", "Shift+ArrowUp"]],
      ["Control point P₃", ["Shift+ArrowRight", "Shift+ArrowDown"]],
    ] as const) {
      const point = root.getByRole("slider", { name, exact: true });
      for (const key of keys) for (let i = 0; i < 15; i++) await point.press(key);
    }
    const escaped = await root.locator("svg text").evaluateAll((nodes) =>
      nodes
        .filter((node) => {
          const box = node.getBoundingClientRect(),
            frame = node.closest("svg")!.getBoundingClientRect();
          return (
            box.left < frame.left - 1 ||
            box.right > frame.right + 1 ||
            box.top < frame.top - 1 ||
            box.bottom > frame.bottom + 1
          );
        })
        .map((node) => node.textContent),
    );
    expect(escaped).toEqual([]);
  });
}

test("weights bar drags without moving any chart datum off its true value", async ({ page }) => {
  await page.goto("/notes/framework-demo#weights", { waitUntil: "networkidle" });
  const root = page.locator("#weight-experiment");
  const grip = root.getByRole("slider", { name: "Chart cursor t", exact: true });
  await grip.scrollIntoViewIfNeeded();
  await grip.press("Home");
  const start = await grip.locator(".nk-handle-hit").evaluate((el) => {
    const n = el as SVGCircleElement,
      p = new DOMPoint(n.cx.baseVal.value, n.cy.baseVal.value).matrixTransform(n.getScreenCTM()!);
    const end = new DOMPoint(540, n.cy.baseVal.value).matrixTransform(n.getScreenCTM()!);
    return { x: p.x, y: p.y, end: end.x };
  });
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + (start.end - start.x) * 0.7, start.y);
  await page.mouse.up();
  expect(Number(await grip.getAttribute("aria-valuenow"))).toBeCloseTo(0.7, 6);
});
