import { test, expect } from "./browser-test";
import { mkdirSync, readFileSync } from "node:fs";
const out = "artifacts/pattern-recipes";
mkdirSync(out, { recursive: true });

for (const width of [320, 390, 1280])
  test(`linked pattern results and their actual source fit ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/notes/framework-demo");
    await page
      .locator(".bz-first-try")
      .getByRole("button", { name: "Straight", exact: true })
      .click();
    for (const [id, name] of [
      ["morph", "Morph"],
      ["layers", "Layers"],
      ["ink", "Ink"],
    ]) {
      await page.getByRole("tab", { name, exact: true }).click();
      const panel = page.locator(`#pattern-panel-${id}`);
      await expect(panel).toBeVisible();
      const source = page.locator(".bz-pattern-source");
      if (!(await source.getAttribute("open"))) await source.locator(":scope > summary").click();
      await expect(source.locator(".nk-code-block-title")).toHaveText(`pattern-${id}.tsx`);
      await expect(source.locator(".nk-code-block-render")).toContainText(`Pattern${name}`);
      await expect(source.locator(".nk-code-block-render")).toContainText("props.points");
      const result = panel.locator(".nk-morph,.nk-layers,.nk-ink").first();
      await result.scrollIntoViewIfNeeded();
      const layout = await result.evaluate((el) => {
        const box = el.getBoundingClientRect();
        return {
          left: box.left,
          right: box.right,
          overflow: document.documentElement.scrollWidth > innerWidth,
          buttons: [...el.querySelectorAll("button")].map((button) => ({
            height: button.getBoundingClientRect().height,
            font: parseFloat(getComputedStyle(button).fontSize),
          })),
        };
      });
      expect(layout.overflow).toBe(false);
      expect(layout.left).toBeGreaterThanOrEqual(0);
      expect(layout.right).toBeLessThanOrEqual(width + 0.5);
      for (const button of layout.buttons) {
        expect(button.height).toBeGreaterThanOrEqual(44);
        expect(button.font).toBeGreaterThanOrEqual(15);
      }
      await panel.screenshot({ path: `${out}/${id}-${width}.png` });
    }
    const contours = await page
      .locator(".nk-morph canvas")
      .evaluate((n) => (n as any).morphSnapshot().contours);
    // With a straight shared curve, each ribbon's two sides are centered at y=170.
    for (const contour of contours)
      for (let j = 0; j < 4; j++) expect((contour[j].y + contour[7 - j].y) / 2).toBeCloseTo(170, 9);
    await page.getByRole("tab", { name: "Layers", exact: true }).click();
    await expect(page.locator(".nk-layers .is-selected .nk-layer-path")).toHaveAttribute(
      "d",
      "M70 170C210 170 350 170 490 170",
    );
    await page.locator(".nk-layers").getByRole("button", { name: "Handles", exact: true }).click();
    await expect(page.locator(".bz-pattern-contribution p")).toContainText("construction guides");
    await expect(page.locator(".bz-pattern-contribution path")).toHaveAttribute(
      "d",
      "M70 170 L210 170 L350 170 L490 170",
    );
    await page.getByRole("tab", { name: "Ink", exact: true }).click();
    await expect(page.locator(".nk-ink-mark")).toHaveCount(240);
    expect(Number(await page.locator(".nk-ink-mark").first().getAttribute("y1"))).toBe(170);
  });

test("keyboard tabs, material changes and retained geometry work during rapid retargets", async ({
  page,
}) => {
  await page.goto("/notes/framework-demo#patterns");
  const morph = page.getByRole("tab", { name: "Morph", exact: true });
  await morph.focus();
  await page.keyboard.press("End");
  await expect(page.getByRole("tab", { name: "Ink", exact: true })).toBeFocused();
  const ink = page.locator(".nk-ink");
  await ink.getByRole("button", { name: "Hatching", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(ink).toHaveAttribute("data-scene", "hatch");
  await page.getByRole("tab", { name: "Ink", exact: true }).focus();
  await page.keyboard.press("Home");
  await expect(morph).toBeFocused();
  const canvas = page.locator(".nk-morph canvas");
  await canvas.scrollIntoViewIfNeeded();
  await expect.poll(() => canvas.evaluate((n) => (n as any).morphSnapshot().visible)).toBe(true);
  await page.locator(".nk-morph").getByRole("button", { name: "Handles", exact: true }).click();
  await page.waitForTimeout(150);
  const moving = await canvas.evaluate((n) => (n as any).morphSnapshot());
  expect(moving.running).toBe(true);
  expect(moving.identitiesStable).toBe(true);
  await page.locator("#pattern-panel-morph").screenshot({ path: `${out}/morph-intermediate.png` });
  await page.locator(".nk-morph").getByRole("button", { name: "Straight", exact: true }).click();
  await page.locator(".nk-morph").getByRole("button", { name: "Curve", exact: true }).click();
  await expect.poll(() => canvas.evaluate((n) => (n as any).morphSnapshot().moving)).toBe(false);
  expect(await canvas.evaluate((n) => (n as any).morphSnapshot().selected)).toBe("curve");
  await page.getByRole("tab", { name: "Layers", exact: true }).click();
  await page.locator(".nk-layers").getByRole("button", { name: "Chords", exact: true }).click();
  await page.locator(".nk-layers").getByRole("button", { name: "Handles", exact: true }).click();
  await expect(page.locator(".bz-pattern-contribution p")).toContainText("Handles.");
  await page.getByRole("tab", { name: "Ink", exact: true }).click();
  await page.evaluate(() => {
    (window as any).__patternMarks = [...document.querySelectorAll(".nk-ink-mark")];
  });
  await ink.getByRole("button", { name: "Three strands", exact: true }).click();
  await ink.getByRole("button", { name: "Dry brush", exact: true }).click();
  expect(
    await page.evaluate(() =>
      (window as any).__patternMarks.every(
        (mark: Element, i: number) => mark === document.querySelectorAll(".nk-ink-mark")[i],
      ),
    ),
  ).toBe(true);
  await expect
    .poll(() => ink.locator("svg").evaluate((n) => (n as any).inkSnapshot().moving))
    .toBe(false);
});

test("the active code panel copies the actual rendered component file", async ({ page }) => {
  await page.goto("/notes/framework-demo#patterns");
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (window as any).__patternSource = text;
        },
      },
    }),
  );
  const source = page.locator(".bz-pattern-source");
  await source.locator(":scope > summary").click();
  await source.locator(".nk-code-source-tools > summary").click();
  for (const [id, name] of [
    ["morph", "Morph"],
    ["layers", "Layers"],
    ["ink", "Ink"],
  ]) {
    await page.getByRole("tab", { name, exact: true }).click();
    await source.getByRole("button", { name: "Copy source", exact: true }).click();
    expect(await page.evaluate(() => (window as any).__patternSource)).toBe(
      readFileSync(`src/notes/framework-demo/examples/pattern-${id}.tsx`, "utf8"),
    );
    await expect(source.locator(".nk-code-block")).toHaveCount(1);
  }
});

test("inspect curved destinations, material treatments and selected contribution at phone size", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/notes/framework-demo#patterns");
  for (const destination of ["Curve", "Handles", "Straight"]) {
    await page.locator(".nk-morph").getByRole("button", { name: destination, exact: true }).click();
    await page
      .locator("#pattern-panel-morph")
      .screenshot({ path: `${out}/curved-${destination.toLowerCase()}-390.png` });
  }
  await page.getByRole("tab", { name: "Layers", exact: true }).click();
  await page.locator(".nk-layers").getByRole("button", { name: "Chords", exact: true }).click();
  await page
    .locator("#pattern-panel-layers")
    .screenshot({ path: `${out}/selected-chords-390.png` });
  await page.getByRole("tab", { name: "Ink", exact: true }).click();
  for (const material of ["Dry brush", "Three strands", "Hatching"]) {
    await page.locator(".nk-ink").getByRole("button", { name: material, exact: true }).click();
    await page
      .locator("#pattern-panel-ink")
      .screenshot({ path: `${out}/curved-${material.replaceAll(" ", "-").toLowerCase()}-390.png` });
  }
  await page.locator(".bz-pattern-source > summary").click();
  await page.locator(".bz-pattern-source").screenshot({ path: `${out}/source-390.png` });
});
