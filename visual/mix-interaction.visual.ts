import { expect, test, type Locator } from "./browser-test";

const rootSelector = "#mix figure[data-nk-scene]";

async function position(root: Locator, t: number, offset = 0) {
  return root.locator(".nk-handle-dot").evaluate(
    (point, { t, offset }) => {
      const matrix = (point as SVGCircleElement).ownerSVGElement!.getScreenCTM()!;
      const screen = new DOMPoint(80 + 400 * t, 120 - 60 * t).matrixTransform(matrix);
      return { x: screen.x + offset, y: screen.y };
    },
    { t, offset },
  );
}

async function state(root: Locator) {
  return root.evaluate((el) => {
    const point = el.querySelector(".nk-handle-dot")!;
    const time = Number(el.getAttribute("data-nk-scene-time"));
    const length = Number(el.getAttribute("data-nk-scene-length"));
    // Kit playback eases its ends: the value is (1 − cos πu) / 2 of the time fraction u.
    const u = time / length;
    return {
      t: (1 - Math.cos(Math.PI * u)) / 2,
      u,
      timeline:
        Number(el.querySelector(".nk-timeline-slider")!.getAttribute("aria-valuenow")) / length,
      point: (Number(point.getAttribute("cx")) - 80) / 400,
      y: Number(point.getAttribute("cy")),
    };
  });
}

async function expectPosition(root: Locator, t: number) {
  const actual = await state(root);
  expect(actual.t).toBeCloseTo(t, 6);
  expect(actual.timeline).toBeCloseTo(actual.u, 10);
  expect(actual.point).toBeCloseTo(actual.t, 10);
  expect(actual.y).toBeCloseTo(120 - 60 * actual.t, 10);
}

test("dragging the white mix point seeks its geometry and curved timeline together", async ({
  page,
}) => {
  await page.goto("/notes/framework-demo#mix", { waitUntil: "networkidle" });
  const root = page.locator(rootSelector);
  await root.scrollIntoViewIfNeeded();
  const start = await position(root, 0.3),
    target = await position(root, 0.72);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y);
  await expectPosition(root, 0.72);
  for (const t of [-0.05, 1.05, 0.72]) {
    const next = await position(root, t);
    await page.mouse.move(next.x, next.y);
    await expectPosition(root, Math.max(0, Math.min(1, t)));
  }
  await page.mouse.up();
  await expect(root.locator("[data-nk-timeline]")).toHaveCount(1);
  await page.screenshot({ path: test.info().outputPath("mix-direct-drag.png") });
});

test("off-center mix grabs preserve the value and use the SVG screen transform", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/notes/framework-demo#mix", { waitUntil: "networkidle" });
  const root = page.locator(rootSelector);
  await root.scrollIntoViewIfNeeded();
  const hit = root.locator(".nk-handle-hit");
  const size = await hit.boundingBox();
  expect(size!.width).toBeCloseTo(44, 1);
  await root.locator(".nk-diagram").evaluate((el) => {
    (el as SVGSVGElement).style.transform = "translate(3px, 4px) scale(.9)";
  });
  const start = await position(root, 0.3, 12),
    target = await position(root, 0.8, 12);
  const before = await state(root);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  expect(await state(root)).toEqual(before);
  await page.mouse.move(target.x, target.y);
  await expectPosition(root, 0.8);
  await page.mouse.up();
});

test("a mix grab pauses playback and keyboard operations use the same clock", async ({ page }) => {
  await page.goto("/notes/framework-demo#mix", { waitUntil: "networkidle" });
  const root = page.locator(rootSelector);
  const point = root.getByRole("slider", { name: "Mixed point p", exact: true });
  await point.scrollIntoViewIfNeeded();
  await expect(point).toHaveAttribute("aria-valuemin", "0");
  await expect(point).toHaveAttribute("aria-valuemax", "1");
  await root.locator("[data-nk-scene-action]").click();
  const grab = await position(root, (await state(root)).t);
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  await expect(root.locator("[data-nk-scene-action]")).toHaveAttribute(
    "data-nk-scene-action",
    "play",
  );
  const held = (await state(root)).t;
  await page.waitForTimeout(100);
  await expectPosition(root, held);
  await page.mouse.up();
  await point.press("Home");
  await expectPosition(root, 0);
  await point.press("ArrowRight");
  await expectPosition(root, 0.01);
  await point.press("Shift+ArrowUp");
  await expectPosition(root, 0.11);
  await point.press("End");
  await expectPosition(root, 1);
  await point.press("ArrowDown");
  await expectPosition(root, 0.99);
  await expect(point).toHaveAttribute("aria-valuenow", "0.99");
});

test("mix drag cancellation releases ownership and ignores competing pointers", async ({
  page,
}) => {
  await page.goto("/notes/framework-demo#mix", { waitUntil: "networkidle" });
  const root = page.locator(rootSelector);
  const point = root.getByRole("slider", { name: "Mixed point p", exact: true });
  await point.scrollIntoViewIfNeeded();
  for (const cancel of ["Escape", "pointercancel", "lostpointercapture"]) {
    const before = (await state(root)).t;
    const start = await position(root, before),
      target = await position(root, 0.7);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    const pointerId = await point.evaluate((el) => {
      for (let id = 0; id < 10; id++) if (el.hasPointerCapture(id)) return id;
      throw new Error("Mix point must capture the active pointer");
    });
    await point.dispatchEvent("pointerdown", {
      pointerId: 99,
      isPrimary: true,
      button: 0,
      clientX: target.x,
      clientY: target.y,
    });
    await page.mouse.move(target.x, target.y);
    await expectPosition(root, 0.7);
    if (cancel === "Escape") await page.keyboard.press("Escape");
    else await point.dispatchEvent(cancel, { pointerId });
    expect(await point.evaluate((el, id) => el.hasPointerCapture(id), pointerId)).toBe(false);
    await page.mouse.move(start.x, start.y);
    await expectPosition(root, 0.7);
    await page.mouse.up();
    await point.press("Home");
    await point.dispatchEvent("pointerdown", {
      pointerId: 98,
      isPrimary: false,
      button: 0,
      clientX: target.x,
      clientY: target.y,
    });
    await point.dispatchEvent("pointermove", {
      pointerId: 98,
      isPrimary: false,
      clientX: target.x,
      clientY: target.y,
    });
    await expectPosition(root, 0);
  }
});
