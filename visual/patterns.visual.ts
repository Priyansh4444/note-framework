import { test, expect } from "./browser-test";
import { mkdirSync } from "node:fs";
const out = "artifacts/pattern-library";
mkdirSync(out, { recursive: true });
async function fixture(page: import("@playwright/test").Page) {
  await page.goto("/visual/fixture.html");
  await page.evaluate(async () => {
    const m = await import("/visual/patterns.fixture.tsx");
    m.mountPatterns();
  });
}
const spec = [
  { name: "morph", selector: ".nk-morph", node: "canvas", method: "morphSnapshot" },
  { name: "layers", selector: ".nk-layers", node: "svg", method: "layerSnapshot" },
  { name: "ink", selector: ".nk-ink", node: "svg", method: "inkSnapshot" },
] as const;
for (const width of [320, 390, 768, 1440])
  test(`example patterns remain dark, readable and in bounds at ${width}px`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/notes/framework-demo#patterns");
    for (const kind of ["morph", "layers", "ink"]) {
      const tab = page.getByRole("tab", {
        name: kind === "layers" ? "Layers" : kind === "ink" ? "Ink" : "Morph",
        exact: true,
      });
      await tab.click();
      const panel = page.locator(`#pattern-panel-${kind}`);
      await expect(panel).toBeVisible();
      const figure = panel.locator("figure");
      await figure.scrollIntoViewIfNeeded();
      const layout = await figure.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return {
          left: r.left,
          right: r.right,
          color: getComputedStyle(el).backgroundColor,
          overflow: document.documentElement.scrollWidth > innerWidth,
          buttons: [...el.querySelectorAll("button")].map((b) => ({
            width: b.getBoundingClientRect().width,
            height: b.getBoundingClientRect().height,
            font: parseFloat(getComputedStyle(b).fontSize),
          })),
        };
      });
      expect(layout.overflow).toBe(false);
      expect(layout.left).toBeGreaterThanOrEqual(0);
      expect(layout.right).toBeLessThanOrEqual(width + 0.5);
      expect(layout.color).toBe("rgb(16, 18, 20)");
      for (const b of layout.buttons) {
        expect(b.height).toBeGreaterThanOrEqual(44);
        expect(b.width).toBeGreaterThanOrEqual(44);
        expect(b.font).toBeGreaterThanOrEqual(15);
      }
      const buttons = figure.getByRole("button");
      await buttons.last().click();
      await expect(buttons.last()).toHaveAttribute("aria-pressed", "true");
      await page.waitForTimeout(180);
      await figure.screenshot({ path: `${out}/${kind}-${width}.png` });
    }
    await page.getByRole("tab", { name: "Morph", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Layers", exact: true })).toBeFocused();
  });
for (const item of spec)
  test(`${item.name} retains geometry on retarget and accepts external selection/source changes`, async ({
    page,
  }) => {
    await fixture(page);
    const figure = page.locator(item.selector);
    await figure.scrollIntoViewIfNeeded();
    const node = figure.locator(item.node);
    await expect
      .poll(() => node.evaluate((n, m) => (n as any)[m]().visible, item.method))
      .toBe(true);
    const snapshot = () => node.evaluate((n, m) => (n as any)[m](), item.method);
    await page.evaluate(() => {
      (window as any).patternsFixture.setValue("b");
    });
    await page.waitForTimeout(120);
    const before = await snapshot();
    expect(before.running).toBe(true);
    const continuity = await node.evaluate((n, arg) => {
      const fn = (n as any)[arg],
        before = fn();
      (window as any).patternsFixture.setValue("a");
      return { before, after: fn() };
    }, item.method);
    if (item.name === "morph")
      expect(continuity.after.contours).toEqual(continuity.before.contours);
    else if (item.name === "layers")
      expect(continuity.after.poses).toEqual(continuity.before.poses);
    else {
      expect(continuity.after.marks).toEqual(continuity.before.marks);
      expect(continuity.after.velocities).toEqual(continuity.before.velocities);
    }
    await expect.poll(async () => (await snapshot()).running).toBe(false);
    const final = await snapshot();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect.poll(async () => (await snapshot()).reduced).toBe(true);
    await page.evaluate(() => {
      (window as any).patternsFixture.setDelta(20);
    });
    if (item.name === "morph") expect((await snapshot()).contours[0][0].x).toBe(80);
    if (item.name === "ink") expect((await snapshot()).marks[0].y).toBe(100);
    if (item.name === "layers")
      await expect(figure.locator(".is-selected .nk-layer-path")).toHaveAttribute(
        "d",
        "M40 60L300 40L300 180",
      );
    expect(final.disposed).toBe(false);
    await node.evaluate((n, m) => {
      (window as any).__lastPatternNode = n;
      (window as any).__lastPatternMethod = m;
    }, item.method);
    await page.evaluate(() => {
      (window as any).patternsFixture.setShown(false);
    });
    await expect(figure).toHaveCount(0);
    expect(
      await page.evaluate(
        () => (window as any).__lastPatternNode[(window as any).__lastPatternMethod]().disposed,
      ),
    ).toBe(true);
  });
test("embedded pattern source changes retain SVG mark and sheet identities", async ({ page }) => {
  await fixture(page);
  await page.evaluate(() => {
    (window as any).__retained = [
      ...document.querySelectorAll(
        ".nk-ink line,.nk-layers .nk-layer-plane,.nk-layers .nk-layer-path",
      ),
    ];
    (window as any).patternsFixture.setValue("b");
    (window as any).patternsFixture.setDelta(25);
  });
  expect(
    await page.evaluate(() => (window as any).__retained.every((n: Element) => n.isConnected)),
  ).toBe(true);
});
for (const slug of ["hairline", "morph", "ink"])
  test(`${slug} standalone ignores the light system theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto(`/studies/${slug}/index.html?theme=light`);
    await page.locator("svg,canvas").first().waitFor();
    const color = await page.locator("html").evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(color).not.toBe("rgb(245, 245, 241)");
    expect(color).not.toBe("rgb(238, 234, 222)");
    const channels = color.match(/\d+/g)!.map(Number);
    expect(Math.max(...channels.slice(0, 3))).toBeLessThan(30);
    await expect(page.getByRole("button", { name: /theme|light mode/i })).toHaveCount(0);
    await page.screenshot({ path: `${out}/${slug}-standalone-dark.png`, fullPage: true });
  });

test("layer occlusion follows displayed elevation rather than the new selection", async ({
  page,
}) => {
  await fixture(page);
  const svg = page.locator(".nk-layers>svg");
  await svg.scrollIntoViewIfNeeded();
  await expect.poll(() => svg.evaluate((n) => (n as any).layerSnapshot().visible)).toBe(true);
  const order = await svg.evaluate((n) => {
    (window as any).__sheetOrder = [...n.children];
    const before = [...n.children];
    (window as any).patternsFixture.setValue("b");
    return before.every((g, i) => g === n.children[i]);
  });
  expect(order).toBe(true);
  await expect.poll(() => svg.evaluate((n) => (n as any).layerSnapshot().running)).toBe(false);
  expect(await svg.locator(":scope > g").last().getAttribute("class")).toContain("is-selected");
});

test("layers and ink reuse the curve edited in the main example", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/notes/framework-demo");
  await page
    .locator(".bz-first-try")
    .getByRole("button", { name: "Straight", exact: true })
    .click();
  await page.getByRole("tab", { name: "Layers", exact: true }).click();
  await expect(page.locator(".nk-layers .is-selected .nk-layer-path")).toHaveAttribute(
    "d",
    "M70 170C210 170 350 170 490 170",
  );
  await page.getByRole("tab", { name: "Ink", exact: true }).click();
  const marks = page.locator(".nk-ink-mark");
  expect(Number(await marks.first().getAttribute("x1"))).toBe(70);
  expect(Number(await marks.first().getAttribute("y1"))).toBe(170);
  expect(Number(await marks.last().getAttribute("x2"))).toBe(490);
  expect(Number(await marks.last().getAttribute("y2"))).toBeCloseTo(170, 8);
});

test("layer ID replacement and reorder preserve the retained sheet and physical motion", async ({
  page,
}) => {
  await fixture(page);
  const svg = page.locator(".nk-layers>svg");
  await svg.scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    (window as any).patternsFixture.setValue("b");
  });
  await expect.poll(() => svg.evaluate((n) => (n as any).layerSnapshot().running)).toBe(false);
  const continuity = await svg.evaluate((n) => {
    const g = n.querySelector('[data-layer-id="b"]')!,
      before = g.getAttribute("transform");
    (window as any).patternsFixture.setLayers([
      { id: "b", label: "B retained", paths: [{ d: "M0 0L200 100" }] },
      { id: "c", label: "C new", paths: [{ d: "M0 100L200 0" }] },
    ]);
    return {
      same: g === n.querySelector('[data-layer-id="b"]'),
      before,
      after: g.getAttribute("transform"),
      ids: [...n.querySelectorAll("[data-layer-id]")].map((g) => g.getAttribute("data-layer-id")),
    };
  });
  expect(continuity.same).toBe(true);
  expect(continuity.after).toBe(continuity.before);
  expect(continuity.ids.sort()).toEqual(["b", "c"]);
  await expect(page.locator('.nk-layers [data-layer-id="b"] .nk-layer-path')).toHaveAttribute(
    "d",
    "M0 0L200 100",
  );
  const reordered = await svg.evaluate((n) => {
    const g = n.querySelector('[data-layer-id="b"]')!,
      before = g.getAttribute("transform");
    (window as any).patternsFixture.setLayers([
      { id: "c", label: "C new", paths: [{ d: "M0 100L200 0" }] },
      { id: "b", label: "B retained", paths: [{ d: "M0 0L200 100" }] },
    ]);
    return { before, after: g.getAttribute("transform") };
  });
  expect(reordered.after).toBe(reordered.before);
  await expect.poll(() => svg.evaluate((n) => (n as any).layerSnapshot().running)).toBe(false);
});
