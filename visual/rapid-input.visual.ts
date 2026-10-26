import { test, expect, type Page } from "./browser-test";
import { railPoint } from "./scene-control";

async function setup(page: Page) {
  await page.goto("/visual/fixture.html", { waitUntil: "networkidle" });
  await page.addScriptTag({
    type: "module",
    content:
      'import { mountParameterFixture } from "/visual/parameter.fixture.tsx"; mountParameterFixture();',
  });
  await page.waitForFunction(() => !!window.parameterFixture);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => {
    window.parameterFixture.setMax(32);
    window.parameterFixture.setStep(1);
    window.parameterFixture.setValue(16);
  });
  const root = page.locator('[data-parameter="main"] .nk-parameter');
  await expect(root.locator("input")).toHaveValue("16");
  await page.evaluate(() => new Promise(requestAnimationFrame));
  const box = (await root.locator("input").boundingBox())!;
  const c = await root
    .locator(".nk-parameter-fill")
    .evaluate((el: SVGPathElement) => el.getPointAtLength(el.getTotalLength()).x);
  await page.mouse.move(box.x + c, box.y + 22);
  await page.mouse.down();
  await page.mouse.move(box.x + c + 24, box.y + 22);
  await page.waitForTimeout(220);
  return { root, box, x: box.x + c + 24 };
}

test("reversing one pixel preserves the currently painted collar", async ({ page }) => {
  const { root, box, x } = await setup(page);
  const sample = await root.evaluate(
    (el, args) => {
      const collar = el.querySelector<SVGPathElement>(".nk-parameter-collar")!;
      const read = () => {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"),
          path = document.createElementNS(svg.namespaceURI, "path") as SVGPathElement;
        svg.style.cssText = "position:fixed;visibility:hidden";
        path.style.d = getComputedStyle(collar).d;
        svg.append(path);
        document.body.append(svg);
        const b = path.getBBox();
        svg.remove();
        return { left: b.x, right: b.x + b.width };
      };
      const before = read();
      window.dispatchEvent(
        new PointerEvent("pointermove", {
          pointerId: 1,
          isPrimary: true,
          clientX: args.x - 1,
          clientY: args.y,
        }),
      );
      const after = read();
      return { before, after, owners: el.getAnimations({ subtree: true }).length };
    },
    { x, y: box.y + 22 },
  );
  expect(Math.abs(sample.after.left - sample.before.left)).toBeLessThanOrEqual(1);
  expect(Math.abs(sample.after.right - sample.before.right)).toBeLessThanOrEqual(1);
  expect(sample.owners).toBeLessThanOrEqual(1);
  await page.mouse.up();
});

test("a new grab continues the visible release pose without a rest snap", async ({ page }) => {
  const { root, box } = await setup(page);
  await page.mouse.up();
  const before = await root.evaluate((el) => {
    const a = el.getAnimations({ subtree: true });
    if (a.length !== 1) throw new Error("One actual release is required");
    a[0].pause();
    a[0].currentTime = 30;
    const c = el.querySelector<SVGPathElement>(".nk-parameter-collar")!;
    return getComputedStyle(c).d;
  });
  const c = await root
    .locator(".nk-parameter-fill")
    .evaluate((el: SVGPathElement) => el.getPointAtLength(el.getTotalLength()).x);
  await page.mouse.move(box.x + c, box.y + 22);
  await page.mouse.down();
  const after = await root.locator(".nk-parameter-collar").evaluate((el) => getComputedStyle(el).d);
  const points = (s: string) => (s.match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number);
  const a = points(before),
    b = points(after);
  expect(b).toHaveLength(a.length);
  expect(Math.max(...a.map((v, i) => Math.abs(v - b[i])))).toBeLessThanOrEqual(1);
  await page.mouse.up();
});

test("small refinement drags move smoothly inside a whole-piece stage", async ({ page }) => {
  await page.goto("/notes/framework-demo#flatten", { waitUntil: "networkidle" });
  const root = page.locator("#flatten-experiment"),
    slider = root.getByRole("slider", { name: "Subdivision playback", exact: true });
  await slider.scrollIntoViewIfNeeded();
  await root.getByRole("button", { name: "17–24 pieces", exact: false }).click();
  const grab = await railPoint(slider, 0.5);
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  const values: number[] = [],
    counts: number[] = [];
  for (const fraction of [0.502, 0.504, 0.506, 0.508, 0.506, 0.504, 0.502]) {
    const point = await railPoint(slider, fraction);
    await page.mouse.move(point.x, point.y);
    values.push(Number(await slider.getAttribute("aria-valuenow")));
    counts.push(Number(await root.locator(".bz-piece-count").textContent()));
  }
  expect(new Set(values).size).toBeGreaterThanOrEqual(4);
  expect(new Set(counts).size).toBe(1);
  expect(counts[0]).toBe(17);
  await page.mouse.up();
  const n = Number(await root.locator(".bz-piece-count").textContent());
  expect(await root.locator(".bz-chord-dot[visibility=visible]").count()).toBe(n + 1);
});

test("rapid input keeps the contour root attached and one motion owner", async ({ page }) => {
  const { root, box } = await setup(page);
  const samples = await root.evaluate((el, args) => {
    const input = el.querySelector<HTMLInputElement>("input")!,
      collar = el.querySelector<SVGPathElement>(".nk-parameter-collar")!,
      fill = el.querySelector<SVGPathElement>(".nk-parameter-fill")!;
    return [3, 29, 7, 25, 11, 21, 15, 17, 4, 28].map((value) => {
      input.value = String(value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      const expected =
        8 +
        ((input.valueAsNumber - Number(input.min)) / (Number(input.max) - Number(input.min))) *
          (args.width - 16);
      window.dispatchEvent(
        new PointerEvent("pointermove", {
          pointerId: 1,
          isPrimary: true,
          clientX: args.x + expected,
          clientY: args.y + 22,
        }),
      );
      const d = getComputedStyle(collar).d,
        n = (d.match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number);
      return {
        root: n[0],
        expected,
        fill: fill.getPointAtLength(fill.getTotalLength()).x,
        owners: el.getAnimations({ subtree: true }).length,
      };
    });
  }, box);
  for (const s of samples) {
    expect(Math.abs(s.root - s.expected)).toBeLessThanOrEqual(0.5);
    expect(s.fill).toBeCloseTo(s.expected, 2);
    expect(s.owners).toBeLessThanOrEqual(1);
  }
  await page.mouse.up();
  await expect
    .poll(() => root.evaluate((el) => el.getAnimations({ subtree: true }).length))
    .toBe(0);
});
