import { expect, test, type Locator, type Page } from "./browser-test";

declare global {
  interface Window {
    parameterFixture: {
      setValue(value: number): void;
      setDisabled(value: boolean): void;
      setMax(value: number): void;
      setStep(value: number): void;
      dispose(): void;
    };
  }
}

const main = (page: Page) => page.locator('[data-parameter="main"] .nk-parameter');
const measure = (root: Locator) =>
  root.evaluate((el) => {
    const input = el.querySelector("input")!;
    const box = input.getBoundingClientRect();
    const collar = el.querySelector<SVGPathElement>(".nk-parameter-collar")!;
    const track = el.querySelector<SVGPathElement>(".nk-parameter-track")!;
    const fill = el.querySelector<SVGPathElement>(".nk-parameter-fill")!;
    const c =
      8 +
      (input.max === input.min
        ? 0
        : (input.valueAsNumber - +input.min) / (+input.max - +input.min)) *
        (box.width - 16);
    // A display:none SVG reports an empty getBBox. Measure its actual path data
    // separately so fallback tests still verify reset geometry rather than skip it.
    const probe = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    probe.style.cssText = "position:fixed;visibility:hidden";
    const path = document.createElementNS(probe.namespaceURI, "path") as SVGPathElement;
    path.style.d = getComputedStyle(collar).d;
    probe.append(path);
    document.body.append(probe);
    const b = path.getBBox();
    probe.remove();
    return {
      value: input.valueAsNumber,
      c,
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      left: c - b.x,
      right: b.x + b.width - c,
      thickness: b.height,
      d: collar.getAttribute("d"),
      paintedD: getComputedStyle(collar).d,
      rail: track.getAttribute("d"),
      fillX: fill.getPointAtLength(fill.getTotalLength()).x,
      fillY: fill.getPointAtLength(fill.getTotalLength()).y,
      animations: el.getAnimations({ subtree: true }).length,
      display: getComputedStyle(collar).display,
    };
  });
async function drag(page: Page, dx = 150) {
  const s = await measure(main(page));
  await page.mouse.move(s.x + s.c, s.y + 22);
  await page.mouse.down();
  await page.mouse.move(s.x + s.c + dx, s.y + 22, { steps: 5 });
  await expect.poll(async () => (await measure(main(page))).animations).toBe(0);
  return { x: s.x + s.c + dx, y: s.y + 22 };
}
async function pauseRelease(root: Locator) {
  await root.evaluate((el) => {
    const animations = el.getAnimations({ subtree: true });
    if (animations.length !== 1)
      throw new Error(`Expected one release owner, found ${animations.length}`);
    animations[0].pause();
    animations[0].currentTime = 0;
  });
}
async function assertRest(root: Locator) {
  const s = await measure(root);
  expect(s.animations).toBe(0);
  expect(s.left).toBeLessThanOrEqual(8.01);
  expect(s.right).toBeLessThanOrEqual(8.01);
  expect(s.fillX).toBeCloseTo(s.c, 2);
  expect(s.fillY).toBe(22);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/visual/fixture.html");
  await page.addScriptTag({
    type: "module",
    content:
      'import { mountParameterFixture } from "/visual/parameter.fixture.tsx"; mountParameterFixture();',
  });
  await expect(main(page).locator("input")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  // Let the real ResizeObserver deliver its initial measurement before dragging.
  await expect.poll(async () => (await measure(main(page))).width).toBeGreaterThan(100);
  await page.evaluate(() => new Promise(requestAnimationFrame));
});

test("native drag stays attached and reversal settles in the opposite direction", async ({
  page,
}, info) => {
  const root = main(page);
  const rest = await measure(root);
  await page.mouse.move(rest.x + rest.c, rest.y + 22);
  await page.mouse.down();
  await page.mouse.move(rest.x + rest.c, rest.y + 80);
  expect((await measure(root)).d).toBe(rest.d);
  await page.mouse.move(rest.x + rest.c + 150, rest.y + 22, { steps: 8 });
  await expect.poll(async () => (await measure(root)).animations).toBe(0);
  const forward = await measure(root);
  expect(forward.value).toBeGreaterThan(rest.value);
  expect(forward.left).toBeCloseTo(14, 2);
  expect(forward.right).toBeCloseTo(8, 2);
  expect(forward.thickness).toBeLessThanOrEqual(8);
  expect(forward.rail).toBe(rest.rail);
  expect(forward.fillX).toBeCloseTo(forward.c, 2);
  await expect(page.locator("[data-value]")).toHaveText(String(forward.value));
  await expect(root.locator("input")).toHaveAttribute(
    "aria-valuetext",
    await root.locator("output").innerText(),
  );
  await info.attach("forward", { body: await root.screenshot(), contentType: "image/png" });
  await page.mouse.move(rest.x + rest.c + 149, rest.y + 22);
  const reversal = await measure(root);
  // Native mouse delivery and this measurement span real animation frames.
  // The same-event continuity contract is checked in rapid-input.visual.ts;
  // here the in-flight pose must stay bounded before its opposite-side target.
  expect(reversal.left).toBeGreaterThanOrEqual(7.99);
  expect(reversal.left).toBeLessThanOrEqual(14.01);
  expect(reversal.right).toBeGreaterThanOrEqual(7.99);
  expect(reversal.right).toBeLessThanOrEqual(14.01);
  expect(reversal.fillX).toBeCloseTo(reversal.c, 2);
  expect(reversal.animations).toBeLessThanOrEqual(1);
  await page.mouse.move(rest.x + rest.c + 100, rest.y + 22);
  await expect.poll(async () => (await measure(root)).animations).toBe(0);
  const reverse = await measure(root);
  expect(reverse.left).toBeCloseTo(8, 2);
  expect(reverse.right).toBeCloseTo(14, 2);
  expect(reverse.rail).toBe(rest.rail);
  expect(reverse.fillX).toBeCloseTo(reverse.c, 2);
  await info.attach("reverse", { body: await root.screenshot(), contentType: "image/png" });
  await page.mouse.up();
});

test("one 180ms release morphs monotonically without changing value, rail or center", async ({
  page,
}, info) => {
  const root = main(page);
  await drag(page);
  const held = await measure(root);
  await page.mouse.up();
  await pauseRelease(root);
  let previous = 14.01;
  for (const time of [0, 45, 90, 180, 220]) {
    await root.evaluate((el, time) => {
      const animation = el.getAnimations({ subtree: true })[0];
      if (animation) animation.currentTime = time;
    }, time);
    const s = await measure(root);
    expect(s.value).toBe(held.value);
    expect(s.c).toBe(held.c);
    expect(s.rail).toBe(held.rail);
    expect(s.fillX).toBeCloseTo(held.c, 2);
    expect(s.left).toBeLessThanOrEqual(previous);
    expect(s.left).toBeGreaterThanOrEqual(7.99);
    previous = s.left;
    await info.attach(`release-${time}ms`, {
      body: await root.screenshot(),
      contentType: "image/png",
    });
  }
  await assertRest(root);
  await drag(page, -80);
  await page.mouse.up();
  await expect.poll(async () => (await measure(root)).animations).toBe(0);
  await assertRest(root);
});

for (const interruption of [
  "cancel",
  "blur",
  "resize",
  "keyboard",
  "disable",
  "external",
  "reduced",
  "forced",
] as const) {
  test(`release resets on ${interruption}`, async ({ page }) => {
    const root = main(page);
    await drag(page);
    await page.mouse.up();
    await pauseRelease(root);
    if (interruption === "cancel") {
      // Cancel the next real drag; pointercancel must reset rather than settle.
      const point = await drag(page, -50);
      await page.evaluate(
        ({ x, y }) =>
          window.dispatchEvent(
            new PointerEvent("pointercancel", { pointerId: 1, clientX: x, clientY: y }),
          ),
        point,
      );
      await page.mouse.up();
    } else if (interruption === "blur") await root.locator("input").blur();
    else if (interruption === "resize") await page.setViewportSize({ width: 390, height: 900 });
    else if (interruption === "keyboard") await root.locator("input").press("ArrowRight");
    else if (interruption === "disable")
      await page.evaluate(() => window.parameterFixture.setDisabled(true));
    else if (interruption === "external") {
      await page.evaluate(() => window.parameterFixture.setValue(0.25));
      await expect(root.locator("input")).toHaveValue("0.25");
    } else if (interruption === "reduced") await page.emulateMedia({ reducedMotion: "reduce" });
    else if (interruption === "forced") await page.emulateMedia({ forcedColors: "active" });
    await expect.poll(async () => (await measure(root)).animations).toBe(0);
    await assertRest(root);
    await page.mouse.up();
    if (interruption === "disable") {
      const value = (await measure(root)).value;
      await root.locator("input").press("ArrowRight");
      expect((await measure(root)).value).toBe(value);
    }
    if (interruption === "forced") {
      await expect(root.locator("svg")).toHaveCSS("display", "none");
      await expect(root.locator("input")).toHaveCSS("appearance", "auto");
    }
  });
}

test("native keyboard semantics match an undecorated range for signed fractional values", async ({
  page,
}) => {
  const root = page.locator('[data-parameter="signed"] .nk-parameter');
  await root.locator("input").evaluate((input) => {
    const native = document.createElement("input");
    native.id = "native-reference";
    native.type = "range";
    for (const name of ["min", "max", "step"]) native.setAttribute(name, input.getAttribute(name)!);
    native.value = (input as HTMLInputElement).value;
    document.body.append(native);
  });
  const reference = page.locator("#native-reference");
  for (const key of ["ArrowRight", "ArrowLeft", "PageUp", "PageDown", "Home", "End"]) {
    await reference.press(key);
    const expected = await reference.inputValue();
    await root.locator("input").press(key);
    await expect(root.locator("input")).toHaveValue(expected);
    await expect(root.locator("input")).toHaveAttribute(
      "aria-valuetext",
      await root.locator("output").innerText(),
    );
    await assertRest(root);
  }
});

for (const width of [1280, 390, 320]) {
  test(`parameter rows, bounds and native endpoints at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const root = main(page);
    for (const value of [0, 0.25, 0.5, 0.75, 1]) {
      await page.evaluate((value) => window.parameterFixture.setValue(value), value);
      const s = await measure(root);
      expect(s.height).toBe(44);
      expect(s.fillX).toBeCloseTo(s.c, 2);
      await info.attach(`native-thumb-${value}`, {
        body: await root.screenshot(),
        contentType: "image/png",
      });
    }
    const geometry = await root.evaluate((el) => {
      const rect = (selector: string) => el.querySelector(selector)!.getBoundingClientRect();
      const label = rect("label"),
        output = rect("output"),
        input = rect("input");
      const bounds = rect(".nk-parameter-bounds"),
        left = rect(".nk-parameter-bounds span:first-child"),
        right = rect(".nk-parameter-bounds span:last-child");
      return {
        start: label.x - input.x,
        end: output.right - input.right,
        gap: output.x - label.right,
        left: left.x - input.x,
        right: input.right - right.right,
        below: bounds.y - input.bottom,
        labelSize: getComputedStyle(el.querySelector("label")!).fontSize,
        boundSize: getComputedStyle(el.querySelector(".nk-parameter-bounds")!).fontSize,
      };
    });
    expect(geometry).toEqual({
      start: 0,
      end: 0,
      gap: 12,
      left: 8,
      right: 8,
      below: 2,
      labelSize: "17px",
      boundSize: "14px",
    });
    const degenerate = page.locator('[data-parameter="degenerate"] .nk-parameter');
    await degenerate.locator("input").press("End");
    await expect(degenerate.locator("input")).toHaveValue("5");
    await assertRest(degenerate);
  });
}

test("reduced motion changing mid-drag clears decoration and preserves native input", async ({
  page,
}) => {
  const root = main(page);
  const point = await drag(page, 80);
  expect((await measure(root)).left).toBeCloseTo(14, 2);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(root.locator(".nk-parameter-collar")).toHaveCSS("display", "none");
  // CSS can hide the collar before the queued MediaQueryList change resets it.
  // Wait for the real contour reset, including geometry hidden by display:none.
  await expect(() => assertRest(root)).toPass({ timeout: 5_000 });
  const before = (await measure(root)).value;
  await page.mouse.move(point.x + 50, point.y);
  expect((await measure(root)).value).toBeGreaterThan(before);
  await page.mouse.up();
  await assertRest(root);
});

test("endpoint overdrag keeps the contour inside the rail and the native value clamped", async ({
  page,
}) => {
  const root = main(page);
  for (const [value, dx] of [
    [0, -100],
    [1, 100],
  ]) {
    await page.evaluate((value) => window.parameterFixture.setValue(value), value);
    await drag(page, dx);
    const s = await measure(root);
    expect(s.value).toBe(value);
    expect(s.c - s.left).toBeGreaterThanOrEqual(7.99);
    expect(s.c + s.right).toBeLessThanOrEqual(s.width - 7.99);
    expect(s.fillX).toBeCloseTo(s.c, 2);
    await page.mouse.up();
    await expect.poll(async () => (await measure(root)).animations).toBe(0);
  }
});

test("two Parameters keep independent gradients, contour state and release ownership", async ({
  page,
}) => {
  const root = main(page);
  const other = page.locator('[data-parameter="signed"] .nk-parameter');
  const before = await measure(other);
  const ids = await page
    .locator("#parameter-fixture linearGradient")
    .evaluateAll((elements) => elements.map((el) => el.id));
  expect(new Set(ids).size).toBe(ids.length);
  await drag(page);
  await page.mouse.up();
  await pauseRelease(root);
  expect(await measure(other)).toEqual(before);
  const s = await measure(other);
  await page.mouse.move(s.x + s.c, s.y + 22);
  await page.mouse.down();
  await page.mouse.move(s.x + s.c - 30, s.y + 22);
  await expect.poll(async () => (await measure(other)).animations).toBe(0);
  expect((await measure(other)).right).toBeCloseTo(14, 2);
  // Native focus transfer blurs the first range, so its release must reset.
  await assertRest(root);
  await page.mouse.up();
  await pauseRelease(other);
  await page.evaluate(() => window.parameterFixture.setValue(0.2));
  await assertRest(root);
  expect((await measure(other)).animations).toBe(1);
});

test("constraint changes and off-step props display the native sanitized value", async ({
  page,
}) => {
  const root = main(page),
    input = root.locator("input");
  await page.evaluate(() => {
    window.parameterFixture.setValue(0.75);
    window.parameterFixture.setMax(0.5);
  });
  await expect(input).toHaveValue("0.5");
  await expect(root.locator("output")).toHaveText("0.5");
  await expect(input).toHaveAttribute("aria-valuetext", "0.5");
  await page.evaluate(() => {
    window.parameterFixture.setMax(1);
    window.parameterFixture.setStep(0.2);
    window.parameterFixture.setValue(0.3);
  });
  await expect(input).toHaveValue("0.4");
  await expect(root.locator("output")).toHaveText("0.4");
  await expect(input).toHaveAttribute("aria-valuetext", "0.4");
  await assertRest(root);
});

test("sanitized percentage echoes preserve drag and the current release owner", async ({
  page,
}) => {
  const root = main(page);
  await page.evaluate(() => {
    window.parameterFixture.setMax(100);
    window.parameterFixture.setStep(0.1);
    window.parameterFixture.setValue(50);
  });
  const point = await drag(page, 24);
  // An affine percentage round trip can differ in raw floating point while
  // describing the same browser-accepted value. It is an acknowledgment.
  const held = await measure(root);
  await page.evaluate((value) => window.parameterFixture.setValue(value - 1e-12), held.value);
  expect((await measure(root)).paintedD).toBe(held.paintedD);
  await page.mouse.move(point.x + 4, point.y);
  await expect.poll(async () => (await measure(root)).animations).toBe(0);
  expect((await measure(root)).left).toBeCloseTo(14, 2);
  await page.mouse.up();
  await pauseRelease(root);
  const accepted = (await measure(root)).value;
  const preserved = await root.evaluate((el, value) => {
    const animation = el.getAnimations({ subtree: true })[0];
    animation.currentTime = 30;
    const before = getComputedStyle(el.querySelector(".nk-parameter-collar")!).d;
    window.parameterFixture.setValue(value + 1e-12);
    return {
      same: el.getAnimations({ subtree: true })[0] === animation,
      before,
      after: getComputedStyle(el.querySelector(".nk-parameter-collar")!).d,
    };
  }, accepted);
  expect(preserved.same).toBe(true);
  expect(preserved.after).toBe(preserved.before);
});
