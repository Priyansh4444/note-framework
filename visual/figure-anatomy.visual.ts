import { expect, test, type Page } from "./browser-test";

test("sound transport wraps without overflowing a 320px note", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/notes/shared-service", { waitUntil: "networkidle" });
  const figure = page.locator("#service-experiment");
  await figure.scrollIntoViewIfNeeded();
  const layout = await figure.evaluate((el) => ({
    width: document.documentElement.scrollWidth,
    controls: [...el.querySelectorAll(".nk-experiment-actions button")].map((node) => {
      const box = node.getBoundingClientRect();
      return { left: box.left, right: box.right, height: box.height };
    }),
  }));
  expect(layout.width).toBe(320);
  expect(layout.controls).toHaveLength(2);
  for (const control of layout.controls) {
    expect(control.left).toBeGreaterThanOrEqual(0);
    expect(control.right).toBeLessThanOrEqual(320);
    expect(control.height).toBeGreaterThanOrEqual(44);
  }
});

async function construction(page: Page, width = 390) {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto("/notes/framework-demo", { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  return page.locator("#construction");
}

for (const width of [390, 1440]) {
  test(`construction has stable controls and truthful DOM order at ${width}px`, async ({
    page,
  }) => {
    const figure = await construction(page, width);
    const guides = figure.getByRole("button", { name: "Guide lines", exact: true });
    const boxes = () =>
      figure.evaluate((el) =>
        Object.fromEntries(
          [
            ".nk-experiment-stage",
            "[data-nk-timeline]",
            ".nk-toolbar",
            ".nk-experiment-action",
          ].map((selector) => {
            const r = el.querySelector(selector)!.getBoundingClientRect();
            return [selector, [r.x, r.y + scrollY, r.width, r.height]];
          }),
        ),
      );
    const before = await boxes();
    await guides.click();
    expect(await boxes()).toEqual(before);
    const focus = await figure.evaluate((el) =>
      [...el.querySelectorAll<HTMLElement>("button:not(:disabled), [role=slider], summary")]
        .filter((node) => !node.closest(".nk-experiment-stage") && node.getClientRects().length)
        .map((node) => ({
          label: node.textContent?.trim() || node.getAttribute("aria-label"),
          y: node.getBoundingClientRect().top + node.getBoundingClientRect().height / 2,
        })),
    );
    for (let i = 1; i < focus.length; i++)
      expect(focus[i].y, JSON.stringify(focus)).toBeGreaterThanOrEqual(focus[i - 1].y);
    const action = figure.locator("[data-nk-scene-action]");
    await action.scrollIntoViewIfNeeded();
    const actionBox = await action.boundingBox();
    await action.click();
    await expect(action).toHaveText("Pause");
    expect(await action.boundingBox()).toEqual(actionBox);
    await action.click();
    const slider = figure.getByRole("slider", { name: "Curve playback", exact: true });
    await slider.press("End");
    await expect(action).toHaveText("Replay");
    expect(await action.boundingBox()).toEqual(actionBox);
    await figure.screenshot({ path: `/tmp/service-curves/figure-anatomy-${width}.png` });
  });
}

test("guide emphasis follows one clock, with exact persistent geometry through seek and reentry", async ({
  page,
}) => {
  const figure = await construction(page, 1440);
  await page.setViewportSize({ width: 1440, height: 1400 });
  // Guide lines are on by default.
  await expect(figure.getByRole("button", { name: "Guide lines", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await figure.evaluate((el) =>
    el
      .querySelectorAll("[data-scene] path, [data-scene] circle")
      .forEach((node, i) => node.setAttribute("data-anatomy-node", String(i))),
  );
  const count = await figure.locator("[data-anatomy-node]").count();
  const completeCurve = await figure.locator(".nk-curve").getAttribute("d");
  const slider = figure.getByRole("slider", { name: "Curve playback", exact: true });
  const action = figure.locator("[data-nk-scene-action]");
  // Beats name positions on the curve; every row exists at every t (no depth staging).
  for (const [i, label] of ["Sweep t"].entries()) {
    await figure.getByRole("button", { name: label, exact: true }).click();
    await action.click();
    await expect(figure).toHaveAttribute("data-nk-scene-active", "true");
    const samples = await figure.evaluate(async (el) => {
      const results = [];
      for (let k = 0; k < 12; k++) {
        const slider = el.querySelector(".nk-timeline-slider")!;
        const current = el.querySelector("[aria-current=step] span:last-child")!.textContent!;
        // Kit playback eases its ends: t = (1 − cos πu) / 2 of the scene fraction u.
        const u =
          Number(el.getAttribute("data-nk-scene-time")) /
          Number(el.getAttribute("data-nk-scene-length"));
        // Kit playback eases its ends: t = (1 − cos πu) / 2.
        const t = (1 - Math.cos(Math.PI * u)) / 2;
        let row = [...el.querySelectorAll(".nk-handle-dot")].map((n) => [
          Number(n.getAttribute("cx")),
          Number(n.getAttribute("cy")),
        ]);
        let error = 0;
        for (const selector of [
          "[data-level='1'] circle",
          "[data-level='2'] circle",
          "[data-level='3'] .nk-point",
        ]) {
          row = row.slice(1).map((q, i) => q.map((v, axis) => (1 - t) * row[i][axis] + t * v));
          [...el.querySelectorAll(selector)].forEach((n, i) => {
            error = Math.max(
              error,
              Math.abs(Number(n.getAttribute("cx")) - row[i][0]),
              Math.abs(Number(n.getAttribute("cy")) - row[i][1]),
            );
          });
        }
        results.push({
          error,
          agrees: slider.getAttribute("aria-valuetext")!.startsWith(`${current},`),
          opacities: [1, 2, 3].map((level) =>
            Number(el.querySelector(`[data-level='${level}']`)!.getAttribute("opacity")),
          ),
        });
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      return results;
    });
    for (const sample of samples) {
      expect(sample.error).toBeLessThan(1e-6);
      expect(sample.agrees).toBe(true);
      expect(sample.opacities).toEqual([1, 1, 1]);
    }
    await expect(figure.locator(".nk-curve")).toHaveAttribute("d", completeCurve!);
    await figure.screenshot({ path: `/tmp/service-curves/construction-stage-${i}.png` });
    await action.click();
    await expect(action).toHaveText("Play");
  }
  await slider.press("Home");
  await action.click();
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
  await expect(figure).toHaveAttribute("data-nk-scene-active", "false");
  const held = await figure.getAttribute("data-nk-scene-time");
  await page.waitForTimeout(100);
  await expect(figure).toHaveAttribute("data-nk-scene-time", held!);
  await figure.scrollIntoViewIfNeeded();
  await expect(figure).toHaveAttribute("data-nk-scene-active", "true");
  await slider.press("End");
  await expect(action).toHaveText("Replay");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await action.click();
  await expect(action).toHaveText("Next step");
  const initial = await slider.getAttribute("aria-valuenow");
  expect(initial).toBe("0");
  await action.click();
  await expect(slider).toHaveAttribute("aria-valuenow", "6000");
  await expect(figure).toHaveAttribute("data-nk-scene-active", "false");
  expect(await figure.locator("[data-anatomy-node]").count()).toBe(count);
  await expect(figure.locator(".nk-curve")).toHaveAttribute("d", completeCurve!);
});

test("presets glide without overshoot, retarget from the current shape and land exactly", async ({
  page,
}) => {
  const figure = await construction(page, 1440);
  const p1 = figure.locator(".nk-handle-dot").nth(1);
  // Sample P1 every frame for `ms`, optionally clicking another preset partway.
  const sample = (ms: number, retarget?: string) =>
    figure.evaluate(
      (el, { ms, retarget }) =>
        new Promise<[number, number][]>((resolve) => {
          const dot = el.querySelectorAll(".nk-handle-dot")[1];
          const out: [number, number][] = [];
          const start = performance.now();
          let clicked = false;
          const frame = (now: number) => {
            out.push([Number(dot.getAttribute("cx")), Number(dot.getAttribute("cy"))]);
            if (retarget && !clicked && now - start > ms / 3) {
              clicked = true;
              [...el.querySelectorAll<HTMLElement>("[role=radio]")]
                .find((b) => b.textContent === retarget)!
                .click();
              out.push([NaN, NaN]);
            }
            if (now - start < ms) requestAnimationFrame(frame);
            else resolve(out);
          };
          requestAnimationFrame(frame);
        }),
      { ms, retarget },
    );
  await figure.getByRole("radio", { name: "S bend", exact: true }).click();
  const run = await sample(1200);
  // Arch P1 (150, 60) → S bend P1 (200, 40): every frame lies between, moving one way.
  for (let i = 1; i < run.length; i++) {
    expect(run[i][0]).toBeGreaterThanOrEqual(run[i - 1][0] - 1e-9);
    expect(run[i][0]).toBeLessThanOrEqual(200 + 1e-9);
    expect(run[i][1]).toBeLessThanOrEqual(run[i - 1][1] + 1e-9);
  }
  await expect(p1).toHaveAttribute("cx", "200");
  await expect(p1).toHaveAttribute("cy", "40");
  await expect(figure.getByRole("radio", { name: "S bend", exact: true })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  // Interrupt: Straight, then Arch partway. The frame after each click continues from where it was.
  await figure.getByRole("radio", { name: "Straight", exact: true }).click();
  const interrupted = await sample(1200, "Arch");
  const cut = interrupted.findIndex((p) => Number.isNaN(p[0]));
  const [before, after] = [interrupted[cut - 1], interrupted[cut + 1]];
  expect(Math.hypot(after[0] - before[0], after[1] - before[1])).toBeLessThan(8);
  await expect(p1).toHaveAttribute("cx", "150");
  await expect(p1).toHaveAttribute("cy", "60");
  // A drag key during a glide stops it where it is and moves from there.
  await figure.getByRole("radio", { name: "Straight", exact: true }).click();
  await page.waitForTimeout(120);
  await figure.locator(".nk-handle").nth(1).press("ArrowDown");
  const held = await p1.getAttribute("cy");
  await page.waitForTimeout(600);
  await expect(p1).toHaveAttribute("cy", held!);
  await expect(figure.locator("[role=radio][aria-checked=true]")).toHaveCount(0);
});

test("the first Play performs from the start; Play after the reader moves continues", async ({
  page,
}) => {
  const figure = await construction(page, 1440);
  const action = figure.locator("[data-nk-scene-action]");
  const time = async () => Number(await figure.getAttribute("data-nk-scene-time"));
  expect(await time()).toBeGreaterThan(0);
  await action.click();
  await expect(action).toHaveText("Pause");
  expect(await time()).toBeLessThan(500);
  await action.click();
  const slider = figure.getByRole("slider", { name: "Curve playback", exact: true });
  for (let i = 0; i < 20; i++) await slider.press("ArrowRight");
  const moved = await time();
  await action.click();
  await expect(action).toHaveText("Pause");
  expect(await time()).toBeGreaterThanOrEqual(moved);
});
