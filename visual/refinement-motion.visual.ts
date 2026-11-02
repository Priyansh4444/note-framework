import { expect, test, type Locator, type Page } from "./browser-test";

async function seek(slider: Locator, fraction: number) {
  const length = Number(await slider.getAttribute("aria-valuemax"));
  await slider.press("Home");
  if (fraction === 1) return slider.press("End");
  for (let i = 0; i < fraction * 100; i++) await slider.press("ArrowRight");
  expect(Number(await slider.getAttribute("aria-valuenow"))).toBeCloseTo(fraction * length, 8);
}
async function exactStop(page: Page, root: Locator, index: number) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const slider = root.getByRole("slider", { name: "Subdivision playback", exact: true });
  await slider.press("Home");
  await expect(root.getByRole("button", { name: "Next step", exact: true })).toBeVisible();
  for (let i = 0; i < index; i++)
    await root.getByRole("button", { name: "Next step", exact: true }).click();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(
    root.getByRole("button", { name: index === 4 ? "Replay" : "Play", exact: true }),
  ).toBeVisible();
}

async function vertices(root: Locator) {
  return root.locator("[data-refinement-path]").evaluate((el) => {
    const coordinates = (el.getAttribute("d")!.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi) ?? []).map(
      Number,
    );
    return Array.from({ length: coordinates.length / 2 }, (_, i) => [
      coordinates[i * 2],
      coordinates[i * 2 + 1],
    ]);
  });
}

const displacement = (a: number[][], b: number[][]) =>
  Math.max(...a.map((p, i) => Math.hypot(p[0] - b[i][0], p[1] - b[i][1])));

for (const width of [390, 1440])
  test(`subdivision unfolds one continuous retained polygon at ${width}px`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/notes/framework-demo#flatten", { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    const root = page.locator("#flatten-experiment");
    const slider = root.getByRole("slider", { name: "Subdivision playback", exact: true });
    await expect(root.locator(".bz-count")).toHaveText("4");
    const retained = await root.evaluateHandle((el) => [
      el.querySelector("[data-refinement-path]"),
      ...el.querySelectorAll("[data-refinement-dot]"),
    ]);
    await seek(slider, 0);
    const first = await vertices(root);
    expect(first).toHaveLength(17);
    await expect(root.locator("[data-refinement-dot]")).toHaveCount(17);
    await seek(slider, 0.1);
    const middle = await vertices(root);
    expect(
      displacement(first, middle),
      "geometry must move within the former static bin",
    ).toBeGreaterThan(1);
    await expect(root.locator("figcaption")).toContainText(/splitting/i);
    await seek(slider, 0.3);
    const left = await vertices(root);
    await seek(slider, 0.31);
    expect(
      displacement(left, await vertices(root)),
      "no 1-second polygon replacement",
    ).toBeLessThan(20);
    await exactStop(page, root, 1);
    const atStop = await vertices(root);
    await slider.press("ArrowLeft");
    const beforeStop = await vertices(root);
    await slider.press("ArrowRight");
    expect(displacement(beforeStop, atStop)).toBeLessThan(3);
    await expect(root.locator(".bz-count")).toHaveText("2");
    await slider.press("ArrowRight");
    expect(displacement(atStop, await vertices(root))).toBeLessThan(3);
    await seek(slider, 0.1);
    expect(await vertices(root), "backward seek must reproduce the identical frame").toEqual(
      middle,
    );
    await seek(slider, 0.99);
    const lastMiddle = await vertices(root);
    await seek(slider, 1);
    expect(
      displacement(lastMiddle, await vertices(root)),
      "last stage must keep refining",
    ).toBeGreaterThan(0.01);
    await expect(root.locator(".bz-count")).toHaveText("16");
    expect(
      await root.evaluate((el, original) => {
        const current = [
          el.querySelector("[data-refinement-path]"),
          ...el.querySelectorAll("[data-refinement-dot]"),
        ];
        return current.every((node, i) => node === original[i]);
      }, retained),
    ).toBe(true);
    await retained.dispose();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    await root.screenshot({ path: test.info().outputPath(`refinement-${width}.png`) });
  });

test("the visible in-between polygon owns the measured gap and pause freezes it", async ({
  page,
}) => {
  await page.goto("/notes/framework-demo#flatten", { waitUntil: "networkidle" });
  const root = page.locator("#flatten-experiment");
  const slider = root.getByRole("slider", { name: "Subdivision playback", exact: true });
  await seek(slider, 0.15);
  const measured = await root.evaluate((el) => {
    const numbers = el
      .querySelector("[data-refinement-path]")!
      .getAttribute("d")!
      .match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)!
      .map(Number);
    const vs = Array.from({ length: 17 }, (_, i) => [numbers[2 * i], numbers[2 * i + 1]]);
    const controls = [...el.querySelectorAll<SVGCircleElement>(".nk-handle-hit")].map((n) => [
      n.cx.baseVal.value,
      n.cy.baseVal.value,
    ]);
    const mix = (a: number[], b: number[], t: number) => a.map((x, i) => (1 - t) * x + t * b[i]);
    const curve = (t: number) => {
      let row = controls;
      while (row.length > 1) row = row.slice(1).map((b, i) => mix(row[i], b, t));
      return row[0];
    };
    let largest = 0;
    for (let i = 0; i <= 1024; i++) {
      const u = i / 64;
      const k = Math.min(15, Math.floor(u));
      const q = curve(i / 1024);
      const p = mix(vs[k], vs[k + 1], u - k);
      largest = Math.max(largest, Math.hypot(q[0] - p[0], q[1] - p[1]));
    }
    const line = el.querySelector<SVGLineElement>("[data-gap-marker] line")!;
    return {
      largest,
      witness: Math.hypot(
        line.x2.baseVal.value - line.x1.baseVal.value,
        line.y2.baseVal.value - line.y1.baseVal.value,
      ),
    };
  });
  expect(measured.witness).toBeCloseTo(measured.largest, 1);
  await root.locator('[data-nk-scene-action="play"]').click();
  await expect(root.locator('[data-nk-scene-action="pause"]')).toBeVisible();
  await page.waitForTimeout(170);
  await root.locator('[data-nk-scene-action="pause"]').click();
  const held = await vertices(root);
  await page.waitForTimeout(180);
  expect(await vertices(root)).toEqual(held);
});

test("reduced motion keeps all five exact subdivision lessons", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/notes/framework-demo#flatten", { waitUntil: "networkidle" });
  const root = page.locator("#flatten-experiment");
  const slider = root.getByRole("slider", { name: "Subdivision playback", exact: true });
  await seek(slider, 0);
  for (const n of [1, 2, 4, 8, 16]) {
    await expect(root.locator(".bz-count")).toHaveText(String(n));
    if (n !== 16) await root.getByRole("button", { name: "Next step", exact: true }).click();
  }
  await root.getByRole("button", { name: "Replay", exact: true }).click();
  await expect(root.locator(".bz-count")).toHaveText("1");
});

test("S bend skips a perceptually stationary opening while retaining every manual lesson", async ({
  page,
}) => {
  await page.goto("/notes/framework-demo", { waitUntil: "networkidle" });
  await page.getByRole("radio", { name: "S bend", exact: true }).click();
  const root = page.locator("#flatten-experiment");
  await root.scrollIntoViewIfNeeded();
  // The preset itself glides. Measure a stationary S only after its exact target arrives.
  const control = root.getByRole("slider", { name: "Control point P₁", exact: true });
  await expect(control.locator(".nk-handle-dot")).toHaveAttribute("cx", "200");
  await expect(control.locator(".nk-handle-dot")).toHaveAttribute("cy", "40");
  await root.getByRole("slider", { name: "Subdivision playback", exact: true }).press("Home");
  const before = await vertices(root);
  await root.locator('[data-nk-scene-action="play"]').click();
  const stage = root.locator("[data-refinement-stops]");
  const stops = JSON.parse((await stage.getAttribute("data-refinement-stops"))!) as number[];
  expect(stops[1]).toBeLessThanOrEqual(150);
  expect(stops[4] - stops[3]).toBeLessThan(600);
  await expect
    .poll(async () => displacement(before, await vertices(root)), { timeout: 900 })
    .toBeGreaterThan(1);
  await root.locator('[data-nk-scene-action="pause"]').click();
  await expect(root.locator("figcaption")).not.toContainText("Red marks");
  await exactStop(page, root, 0);
  await expect(root.locator(".bz-count")).toHaveText("1");
  await exactStop(page, root, 1);
  await expect(root.locator(".bz-count")).toHaveText("2");
});

test("pacing is frozen through a control edit and refreshed on replay", async ({ page }) => {
  await page.goto("/notes/framework-demo#flatten", { waitUntil: "networkidle" });
  const root = page.locator("#flatten-experiment");
  const slider = root.getByRole("slider", { name: "Subdivision playback", exact: true });
  await seek(slider, 0.2);
  const stage = root.locator("[data-refinement-phase]");
  const phase = Number(await stage.getAttribute("data-refinement-phase"));
  const stops = await stage.getAttribute("data-refinement-stops");
  await root
    .getByRole("slider", { name: "Control point P₁", exact: true })
    .press("Shift+ArrowDown");
  expect(Number(await stage.getAttribute("data-refinement-phase"))).toBe(phase);
  expect(await stage.getAttribute("data-refinement-stops")).toBe(stops);
  await slider.press("End");
  await root.getByRole("button", { name: "Replay", exact: true }).click();
  await expect(stage).not.toHaveAttribute("data-refinement-stops", stops!);
  await root.getByRole("button", { name: "Pause", exact: true }).click();
});

test("gap ink fades to zero before its size cutoff instead of flashing", async ({ page }) => {
  await page.goto("/notes/framework-demo#flatten", { waitUntil: "networkidle" });
  const root = page.locator("#flatten-experiment");
  const slider = root.getByRole("slider", { name: "Subdivision playback", exact: true });
  await slider.press("Home");
  let nearCutoff = 0;
  for (let i = 0; i <= 100; i++) {
    if (i) await slider.press("ArrowRight");
    const ink = await root.locator("[data-gap-marker]").evaluate((group) => {
      const line = group.querySelector<SVGLineElement>("line")!;
      const p = new DOMPoint(line.x1.baseVal.value, line.y1.baseVal.value).matrixTransform(
        line.getScreenCTM()!,
      );
      const q = new DOMPoint(line.x2.baseVal.value, line.y2.baseVal.value).matrixTransform(
        line.getScreenCTM()!,
      );
      return {
        pixels: Math.hypot(q.x - p.x, q.y - p.y),
        opacity: Number(group.getAttribute("opacity")),
      };
    });
    const x = Math.max(0, Math.min(1, (ink.pixels - 3) / 3));
    expect(ink.opacity).toBeLessThanOrEqual(x * x * (3 - 2 * x) + 1e-9);
    if (ink.pixels >= 3 && ink.pixels <= 6) nearCutoff++;
  }
  expect(nearCutoff).toBeGreaterThan(0);
});

for (const width of [320, 390, 768, 1440])
  test(`refinement caption stays compact and aligned at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/notes/framework-demo#flatten", { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    const root = page.locator("#flatten-experiment");
    const measure = () =>
      root.evaluate((el) => {
        const caption = el.querySelector("figcaption")!.getBoundingClientRect();
        const status = el.querySelector(".bz-refinement-status")!.getBoundingClientRect();
        const gap = el.querySelector(".bz-refinement-gap")!.getBoundingClientRect();
        return {
          height: caption.height,
          rowGap: gap.top - status.bottom,
          sideGap: gap.left - status.right,
          left: caption.left,
          right: caption.right,
        };
      });
    const original = await measure();
    expect(original.height).toBeLessThanOrEqual(width > 900 ? 23 : 45);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.getByRole("radio", { name: "S bend", exact: true }).click();
    const slider = root.getByRole("slider", { name: "Subdivision playback", exact: true });
    await slider.press("Home");
    await slider.press("ArrowRight");
    await expect(root.locator(".bz-refinement-status")).toContainText("midpoint is on the chord");
    const stationary = await measure();
    expect(stationary.height).toBeCloseTo(original.height, 2);
    if (width > 900) expect(stationary.sideGap).toBeGreaterThanOrEqual(15);
    else expect(Math.abs(stationary.rowGap)).toBeLessThanOrEqual(1);
    expect(stationary.left).toBeGreaterThanOrEqual(0);
    expect(stationary.right).toBeLessThanOrEqual(width);
    await page.getByRole("radio", { name: "Straight", exact: true }).click();
    await slider.press("End");
    await expect(root.locator(".bz-refinement-status")).toHaveText(
      "Zero error: one straight piece.",
    );
    await expect(root.getByRole("img", { name: /^Zero error: one straight piece;/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
  });

for (const [shape, controls] of [
  [
    "folded",
    [
      [45, 300],
      [515, 35],
      [50, 40],
      [515, 285],
    ],
  ],
  [
    "swept-interior",
    [
      [217, 298],
      [60, 146],
      [407, 48],
      [460, 231],
    ],
  ],
] as const)
  for (const width of [320, 390, 1440])
    test(`${shape} endpoint labels clear the whole refinement at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/notes/framework-demo#flatten", { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(async (controls) => {
        const source = "/src/notes/framework-demo/bezier/store.ts";
        const { movePoint } = await import(source);
        controls.forEach((p, i) => movePoint(i, p));
      }, controls);
      const root = page.locator("#flatten-experiment");
      const slider = root.getByRole("slider", { name: "Subdivision playback", exact: true });
      await root.scrollIntoViewIfNeeded();
      const labelPose = () =>
        root
          .locator(".nk-handle .nk-label")
          .evaluateAll((nodes) => nodes.map((n) => [n.getAttribute("x"), n.getAttribute("y")]));
      const pose = await labelPose();
      for (const fraction of [0.2, 0, 0.1, 0.3, 0.4, 0.8, 1]) {
        await seek(slider, fraction);
        expect(await labelPose()).toEqual(pose);
        const collisions = await root.evaluate((el) => {
          const path = el.querySelector<SVGPathElement>("[data-refinement-path]")!;
          const labels = Array.from(el.querySelectorAll<SVGTextElement>(".nk-handle .nk-label"));
          return labels.map((label) => {
            const b = label.getBoundingClientRect();
            const m = path.getScreenCTM()!;
            let hits = 0;
            const length = path.getTotalLength();
            for (let i = 0; i <= 1024; i++) {
              const p = path.getPointAtLength((length * i) / 1024).matrixTransform(m);
              if (p.x > b.left - 2 && p.x < b.right + 2 && p.y > b.top - 2 && p.y < b.bottom + 2)
                hits++;
            }
            return hits;
          });
        });
        if (collisions.some((n) => n > 0))
          await root.screenshot({
            path: `artifacts/refinement-motion/${shape}-${width}-${fraction}-collision.png`,
          });
        expect(collisions).toEqual([0, 0, 0, 0]);
      }
    });
