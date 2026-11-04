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
      const n = document.querySelector(".nk-note-nav")!.getBoundingClientRect(),
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
    await expect(page.getByRole("button", { name: "Paper", exact: true })).toHaveCount(0);
    await page.emulateMedia({ colorScheme: "light" });
    await expect(root.locator(".spring-card")).toHaveAttribute("data-theme", "dark");
    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(
      background
        .match(/\d+/g)!
        .slice(0, 3)
        .map(Number)
        .every((channel) => channel < 50),
    ).toBe(true);
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
    (root.querySelectorAll("[role=radio]")[2] as HTMLButtonElement).click();
    const changed = read();
    (root.querySelector(".nk-toolbar .nk-action") as HTMLButtonElement).click();
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
  await page.getByRole("radio", { name: "Just enough", exact: true }).click();
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
      const n = document.querySelector(".nk-note-nav")!.getBoundingClientRect(),
        h = document.querySelector("h1")!.getBoundingClientRect();
      return { n: n.x, h: h.x, right: n.right, hright: h.right };
    });
    expect(align.n).toBeCloseTo(align.h, 0);
    expect(align.right).toBeCloseTo(align.hright, 0);
  }
});

test("a batched leave/return delivery cannot freeze the released carriage", async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    const Native = window.IntersectionObserver;
    const visibility = {
      hold: false,
      latest: undefined as boolean | undefined,
      entries: [] as boolean[],
      flush: undefined as (() => void) | undefined,
    };
    Reflect.set(window, "springVisibility", visibility);
    window.IntersectionObserver = class extends Native {
      constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        const pending: IntersectionObserverEntry[] = [];
        super((entries, observer) => {
          const spring = entries.filter((entry) => entry.target.id === "spring-instrument");
          if (spring.length) {
            visibility.latest = spring.at(-1)!.isIntersecting;
            visibility.entries.push(...spring.map((entry) => entry.isIntersecting));
            if (visibility.hold) {
              pending.push(...entries);
              visibility.flush = () => callback(pending.splice(0), observer);
              return;
            }
          }
          callback(entries, observer);
        }, options);
      }
    };
  });
  await open(page, 320);
  const root = page.locator("#spring-instrument"),
    grip = page.getByRole("slider", { name: "Carriage displacement" });
  await root.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));
  await page.waitForFunction(() => Reflect.get(window, "springVisibility").latest === true);
  await grip.press("End");
  await grip.press("ArrowLeft");
  expect((await pose(page)).x).toBe(28);
  await page.evaluate(() => {
    const visibility = Reflect.get(window, "springVisibility");
    visibility.entries = [];
    visibility.hold = true;
    // Make a genuine offscreen position available even when references are collapsed.
    const pad = document.createElement("div");
    pad.style.height = "2000px";
    document.body.append(pad);
    scrollTo({ top: document.body.scrollHeight, behavior: "instant" });
  });
  await page.waitForFunction(() => Reflect.get(window, "springVisibility").entries.includes(false));
  await root.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));
  await page.waitForFunction(() => Reflect.get(window, "springVisibility").latest === true);
  const delivery = await page.evaluate(() => {
    const visibility = Reflect.get(window, "springVisibility");
    visibility.hold = false;
    visibility.flush();
    return visibility.entries;
  });
  expect(delivery[0]).toBe(false);
  expect(delivery.at(-1)).toBe(true);
  await info.attach("native-intersection-delivery", {
    body: JSON.stringify(delivery),
    contentType: "application/json",
  });
  await grip.press(" ");
  await expect(root).toHaveAttribute("data-active", "true");
  await expect.poll(async () => (await pose(page)).t).toBeGreaterThan(0);
  await expect.poll(async () => Math.abs((await pose(page)).x)).toBeLessThan(0.05);
});

test("phone footer keeps every status clear of both buttons", async ({ page }) => {
  await open(page, 320);
  const root = page.locator("#spring-instrument"),
    grip = page.getByRole("slider", { name: "Carriage displacement" });
  let initialHeight: number | undefined;
  const checkStatus = async (text: string) => {
    await expect(root.locator(".spring-status")).toHaveText(text);
    const measure = await root.locator(".nk-toolbar").evaluate((footer) => {
      const range = document.createRange();
      range.selectNodeContents(footer.querySelector(".spring-status")!);
      const words = [...range.getClientRects()];
      const buttons = [...footer.querySelectorAll("button")].map((el) =>
        el.getBoundingClientRect(),
      );
      return {
        height: footer.closest("figure")!.getBoundingClientRect().height,
        lines: words.length,
        inside: words.every((r) => r.left >= 0 && r.right <= innerWidth),
        clearances: words.flatMap((word) =>
          buttons.map((button) =>
            Math.hypot(
              Math.max(0, word.left - button.right, button.left - word.right),
              Math.max(0, word.top - button.bottom, button.top - word.bottom),
            ),
          ),
        ),
      };
    });
    initialHeight ??= measure.height;
    expect(Math.abs(measure.height - initialHeight)).toBeLessThan(1);
    expect(measure.lines).toBe(1);
    expect(measure.inside).toBe(true);
    expect(Math.min(...measure.clearances)).toBeGreaterThanOrEqual(8);
  };
  await checkStatus("At center");
  await grip.press("End");
  await checkStatus("Held");
  await grip.press(" ");
  await checkStatus("Returning");
  await expect.poll(async () => Math.abs((await pose(page)).x)).toBeLessThan(0.005);
  await checkStatus("At center");
});

test("the response curve follows the carriage and its numbers follow the damping", async ({
  page,
}) => {
  await open(page, 1280);
  const root = page.locator("#spring-instrument"),
    grip = page.getByRole("slider", { name: "Carriage displacement" }),
    readout = root.locator("[data-instrument-live]"),
    curve = root.locator("[data-response-curve]");
  await expect(readout).toContainText("overshoot 49%");
  await expect(readout).toContainText("settles in 1.41s");
  await root.getByRole("radio", { name: "Just enough" }).click();
  await expect(readout).toContainText("overshoot 0%");
  await expect(readout).toContainText("settles in 0.49s");
  await root.getByRole("radio", { name: "Too much" }).click();
  await expect(readout).toContainText("settles in 1.10s");
  await root.getByRole("radio", { name: "Bouncy" }).click();
  // A shorter pull redraws the curve from where it really started, and the dot rides it.
  const fullPull = await curve.getAttribute("d");
  await grip.press("Home");
  await grip.press("ArrowRight");
  await grip.press(" ");
  await expect(root.locator("[data-response-now]")).toBeVisible();
  expect(await curve.getAttribute("d")).not.toBe(fullPull);
  const drawn = await root.locator("[data-response-now]").evaluate((dot) => {
    const box = dot.getBoundingClientRect();
    const hit = (dot as unknown as SVGElement).ownerSVGElement!.getBoundingClientRect();
    return box.left >= hit.left && box.right <= hit.right;
  });
  expect(drawn).toBe(true);
  await expect.poll(async () => Math.abs((await pose(page)).x)).toBeLessThan(0.05);
  // Once settled, the chart keeps the last real release for inspection.
  await expect(root.locator("[data-response-now]")).toHaveCount(0);
  expect(await curve.getAttribute("d")).not.toBe(fullPull);
});

test("the response chart refits its plot when the width crosses the phone breakpoint", async ({
  page,
}) => {
  await open(page, 1280);
  const root = page.locator("#spring-instrument");
  const fits = () =>
    root.evaluate((el) => {
      const chart = [...el.querySelectorAll("svg")].at(-1)!;
      const labels = [...chart.querySelectorAll("text")].map((t) => t.getBoundingClientRect());
      const readout = el.querySelector(".nk-instrument-foot")!.getBoundingClientRect();
      const box = chart.getBoundingClientRect();
      return {
        below: Math.max(...labels.map((l) => l.bottom)) <= readout.top,
        inside: Math.min(...labels.map((l) => l.left)) >= box.left - 1,
        viewBox: chart.getAttribute("viewBox"),
      };
    });
  const desktop = await fits();
  expect(desktop.below && desktop.inside).toBe(true);
  await page.setViewportSize({ width: 320, height: 844 });
  await expect.poll(async () => (await fits()).viewBox).not.toBe(desktop.viewBox);
  const phone = await fits();
  expect(phone.below && phone.inside).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect.poll(async () => (await fits()).viewBox).toBe(desktop.viewBox);
});
