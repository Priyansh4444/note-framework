import { expect, test, type Page } from "./browser-test";
async function open(page: Page, width = 1280) {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto("/notes/spring-workshop", { waitUntil: "networkidle" });
  await expect(page.locator("#spring-instrument")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}
const pose = (page: Page) =>
  page.locator("#spring-instrument").evaluate((el) => ({
    x: Number(el.getAttribute("data-x")),
    v: Number(el.getAttribute("data-v")),
    t: Number(el.getAttribute("data-time")),
  }));
for (const width of [320, 390, 768, 1440])
  test(`spring instrument is readable, aligned and operable at ${width}`, async ({
    page,
  }, info) => {
    await open(page, width);
    const root = page.locator("#spring-instrument"),
      grip = page.getByRole("slider", { name: "Carriage displacement" });
    await expect(root.locator("[role=slider]")).toHaveCount(1);
    await grip.press("End");
    expect((await pose(page)).x).toBe(30);
    await grip.press("ArrowLeft");
    expect((await pose(page)).x).toBe(28);
    const state = await root.evaluate((el) => {
      const card = el.querySelector(".spring-card")!.getBoundingClientRect(),
        r = el.getBoundingClientRect();
      const svg = el.querySelector("svg") as SVGSVGElement;
      const bounds = svg.getBBox(),
        vb = svg.viewBox.baseVal;
      return {
        root: [r.x, r.right],
        card: [card.x, card.right],
        overflow: document.documentElement.scrollWidth > innerWidth,
        svgFits:
          bounds.x >= vb.x &&
          bounds.y >= vb.y &&
          bounds.x + bounds.width <= vb.width &&
          bounds.y + bounds.height <= vb.height,
        targets: [...el.querySelectorAll("button,[role=slider]")].map((n) => {
          const r = n.getBoundingClientRect();
          return [r.width, r.height];
        }),
        solids: el.querySelectorAll("[data-solid]").length,
      };
    });
    expect(state.overflow).toBe(false);
    expect(state.svgFits).toBe(true);
    expect(state.solids).toBeGreaterThan(40);
    expect(state.root).toEqual(state.card);
    const edges = await page.evaluate(() => {
      const n = document.querySelector(".spring-nav")!.getBoundingClientRect(),
        h = document.querySelector("h1")!.getBoundingClientRect();
      return [n.x, n.right, h.x, h.right];
    });
    expect(edges[0]).toBeCloseTo(edges[2], 0);
    expect(edges[1]).toBeCloseTo(edges[3], 0);
    for (const [w, h] of state.targets) {
      expect(w).toBeGreaterThanOrEqual(44);
      expect(h).toBeGreaterThanOrEqual(44);
    }
    await root.screenshot({ path: info.outputPath("dark.png") });
    await page.getByRole("button", { name: "Paper off", exact: true }).click();
    await root.screenshot({ path: info.outputPath("paper.png") });
    await grip.press(" ");
    await expect(root).toHaveAttribute("data-active", "true");
    await expect.poll(async () => Math.abs((await pose(page)).x)).toBeLessThan(0.05);
  });
test("grabbing and switching damping preserve the visible pose; rapid nudges do not reset position", async ({
  page,
}) => {
  await open(page);
  const root = page.locator("#spring-instrument"),
    grip = page.getByRole("slider", { name: "Carriage displacement" });
  await grip.press("End");
  await grip.press(" ");
  await expect(root).toHaveAttribute("data-active", "true");
  await page.waitForTimeout(100);
  const continuity = await page.evaluate(() => {
    const root = document.querySelector("#spring-instrument")!;
    const read = () => ({
      x: Number(root.getAttribute("data-x")),
      v: Number(root.getAttribute("data-v")),
    });
    const before = read();
    (document.querySelectorAll(".spring-feels button")[2] as HTMLButtonElement).click();
    const changed = read();
    (document.querySelector(".spring-footer button") as HTMLButtonElement).click();
    const nudged = read();
    return { before, changed, nudged };
  });
  expect(continuity.changed.x).toBeCloseTo(continuity.before.x, 8);
  expect(continuity.changed.v).toBeCloseTo(continuity.before.v, 8);
  expect(continuity.nudged.x).toBeCloseTo(continuity.changed.x, 8);
  const box = await grip.boundingBox();
  if (!box) throw Error("Missing grip");
  await page.mouse.move(box.x + 24, box.y + 24);
  await page.evaluate(() => {
    const root = document.querySelector("#spring-instrument")!;
    document.addEventListener(
      "pointerdown",
      () => {
        (window as any).grabBefore = Number(root.getAttribute("data-x"));
      },
      { capture: true, once: true },
    );
    document.addEventListener(
      "pointerdown",
      () => {
        (window as any).grabAfter = Number(root.getAttribute("data-x"));
      },
      { once: true },
    );
  });
  await page.mouse.down();
  const noJump = await page.evaluate(() => ({
    before: (window as any).grabBefore,
    after: (window as any).grabAfter,
  }));
  expect(noJump.after).toBeCloseTo(noJump.before, 8);
  expect((await pose(page)).v).toBe(0);
  await grip.press("Escape");
  await page.mouse.up();
  await expect(root).toHaveAttribute("data-active", "false");
});
test("physical pointer drag moves the carriage along the rail and release settles without replacing parts", async ({
  page,
}) => {
  await open(page, 390);
  const root = page.locator("#spring-instrument"),
    grip = page.getByRole("slider", { name: "Carriage displacement" });
  await grip.scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    (window as any).parts = [...document.querySelectorAll("#spring-instrument svg [data-solid]")];
  });
  const box = await grip.boundingBox();
  if (!box) throw Error("Missing grip");
  await page.mouse.move(box.x + 24, box.y + 24);
  await page.mouse.down();
  await page.mouse.move(box.x + 49, box.y + 36, { steps: 12 });
  expect((await pose(page)).x).toBeGreaterThan(5);
  await expect(root).toHaveAttribute("data-held", "true");
  await page.mouse.up();
  await expect(root).toHaveAttribute("data-active", "true");
  await page.getByRole("button", { name: "Just enough", exact: true }).click();
  await expect.poll(async () => Math.abs((await pose(page)).x)).toBeLessThan(0.05);
  expect(
    await page.evaluate(() => (window as any).parts.every((n: Element) => n.isConnected)),
  ).toBe(true);
});
test("reduced motion and offscreen pauses remain usable; example return navigation aligns with the reading column", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page, 320);
  const root = page.locator("#spring-instrument"),
    grip = page.getByRole("slider", { name: "Carriage displacement" });
  await grip.press("End");
  expect((await pose(page)).x).toBe(30);
  await grip.press(" ");
  expect((await pose(page)).x).toBe(0);
  await expect(root).toHaveAttribute("data-active", "false");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.getByRole("button", { name: "Give it a nudge" }).click();
  await expect(root).toHaveAttribute("data-active", "true");
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
  await expect(root).toHaveAttribute("data-active", "false");
  const paused = await pose(page);
  await page.waitForTimeout(100);
  expect((await pose(page)).t).toBe(paused.t);
  for (const route of ["/notes/spring-workshop", "/notes/inside-svg"]) {
    await page.goto(route, { waitUntil: "networkidle" });
    const align = await page.evaluate(() => {
      const n = document.querySelector("nav[aria-label=Framework]")!.getBoundingClientRect(),
        h = document.querySelector("h1")!.getBoundingClientRect();
      return { n: n.x, h: h.x, right: n.right, hright: h.right };
    });
    expect(align.n).toBeCloseTo(align.h, 0);
    expect(align.right).toBeCloseTo(align.hright, 0);
  }
});
