import { expect, test } from "./browser-test";
import { measureTaste } from "../scripts/taste-measure";

const routes = [
  "/",
  "/docs",
  "/studies",
  "/notes/framework-demo",
  "/notes/shared-service",
  "/notes/inside-svg",
  "/notes/spring-workshop",
];

for (const route of routes)
  for (const width of [390, 1440])
    test(`${route} meets the reader-taste rules at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(route, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(measureTaste)).toEqual([]);
      // Readers open disclosures; what they reveal meets the same rules.
      await page.evaluate(() =>
        document.querySelectorAll("details").forEach((d) => (d.open = true)),
      );
      await page.waitForTimeout(600);
      const opened = (await page.evaluate(measureTaste)).filter((f) => f.rule !== "tall-figure");
      expect(opened, "with every disclosure open (a figure may grow)").toEqual([]);
    });

// "Play→Pause shifts Replay": a control must never move away from the pointer that used it.
for (const route of routes.filter((r) => r.startsWith("/notes/")))
  test(`${route} keeps every figure control in place after each press`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(route, { waitUntil: "networkidle" });
    const moved = await page.evaluate(async () => {
      const failures: { button: string; before: number[][]; after: number[][] }[] = [];
      const settle = () => new Promise((done) => setTimeout(done, 450));
      for (const figure of document.querySelectorAll("figure, .nk-experiment")) {
        const controls = () =>
          [...figure.querySelectorAll("button, [role=slider]")].filter((c) => {
            const r = c.getBoundingClientRect();
            const track = c.localName === "button" || r.width > 3 * r.height;
            return r.width > 0 && track && !c.closest("svg");
          });
        const boxes = () =>
          controls().map((c) => {
            const r = c.getBoundingClientRect();
            const f = figure.getBoundingClientRect();
            return [Math.round(r.left - f.left), Math.round(r.top - f.top), Math.round(r.width)];
          });
        const buttons = controls().filter(
          (b): b is HTMLButtonElement =>
            b instanceof HTMLButtonElement &&
            !b.closest("summary") &&
            !b.hasAttribute("aria-expanded"),
        );
        for (const button of buttons) {
          const before = boxes();
          button.click();
          await settle();
          const after = boxes();
          if (
            after.length !== before.length ||
            after.some((box, i) => box.some((v, j) => Math.abs(v - before[i][j]) > 1))
          )
            failures.push({
              button: button.getAttribute("aria-label") ?? button.innerText,
              before,
              after,
            });
          button.click();
          await settle();
        }
      }
      return failures;
    });
    expect(moved).toEqual([]);
  });

// "First Play skips the start": the first press of Play tells the whole story.
for (const route of routes.filter((r) => r.startsWith("/notes/")))
  test(`${route} plays every figure from its beginning on the first press`, async ({ page }) => {
    await page.goto(route, { waitUntil: "networkidle" });
    const late = await page.evaluate(async () => {
      const found: { figure: string; startedAt: number; length: number }[] = [];
      for (const play of document.querySelectorAll<HTMLElement>('[data-nk-scene-action="play"]')) {
        const clock = play.closest<HTMLElement>("[data-nk-scene-time]");
        const length = Number(clock?.dataset.nkSceneLength);
        if (!clock || !length) continue;
        play.click();
        await new Promise((done) => setTimeout(done, 120));
        const startedAt = Number(clock.dataset.nkSceneTime);
        if (startedAt > length * 0.15) found.push({ figure: clock.id, startedAt, length });
        if (clock.querySelector('[data-nk-scene-action="pause"]'))
          clock.querySelector<HTMLElement>('[data-nk-scene-action="pause"]')!.click();
      }
      return found;
    });
    expect(late).toEqual([]);
  });

// "Dragging P₃ after End does nothing": no decorative mark may sit on top of a handle.
for (const route of routes.filter((r) => r.startsWith("/notes/")))
  test(`${route} keeps every draggable handle reachable at rest and at the end`, async ({
    page,
  }) => {
    await page.goto(route, { waitUntil: "networkidle" });
    const covered = await page.evaluate(async () => {
      const found: { figure: string; handle: string; state: string; top: string }[] = [];
      const settle = () => new Promise((done) => setTimeout(done, 400));
      for (const figure of document.querySelectorAll<HTMLElement>("figure, .nk-experiment")) {
        const handles = [...figure.querySelectorAll<SVGGElement>("svg [role=slider]")];
        if (!handles.length) continue;
        figure.scrollIntoView({ block: "center", behavior: "instant" });
        const end = [...figure.querySelectorAll<HTMLElement>(".nk-timeline-label")].at(-1);
        for (const state of end ? ["rest", "end"] : ["rest"]) {
          if (state === "end") end!.click();
          await settle();
          for (const handle of handles) {
            const r = handle.getBoundingClientRect();
            if (r.width === 0) continue;
            const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            if (top && !handle.contains(top))
              found.push({
                figure: figure.id,
                handle: handle.getAttribute("aria-label") ?? "",
                state,
                top: `${top.localName}.${[...top.classList].join(".")}`,
              });
            // Clickable is not enough: a mark painted later must not hide the handle's centre.
            const [x, y] = [r.left + r.width / 2, r.top + r.height / 2];
            const painted = [
              ...handle.ownerSVGElement!.querySelectorAll("circle, rect, path"),
            ].find((mark) => {
              if (handle.contains(mark)) return false;
              if (!(handle.compareDocumentPosition(mark) & Node.DOCUMENT_POSITION_FOLLOWING))
                return false;
              const s = getComputedStyle(mark);
              const box = mark.getBoundingClientRect();
              return (
                s.fill !== "none" &&
                Number(s.opacity) > 0.3 &&
                s.visibility !== "hidden" &&
                box.width > 4 &&
                box.left <= x &&
                x <= box.right &&
                box.top <= y &&
                y <= box.bottom
              );
            });
            if (painted)
              found.push({
                figure: figure.id,
                handle: handle.getAttribute("aria-label") ?? "",
                state,
                top: `painted over by ${painted.localName}.${[...painted.classList].join(".")}`,
              });
          }
        }
      }
      return found;
    });
    expect(covered).toEqual([]);
  });

// "Dragging P₁ to the edge sends its label offscreen": labels stay inside the figure at any handle position.
for (const route of routes.filter((r) => r.startsWith("/notes/")))
  test(`${route} keeps SVG labels inside their figure while handles are dragged to the edges`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.goto(route, { waitUntil: "networkidle" });
    const svgs = page.locator("svg:has([role=slider])");
    const pairs: [number, number][] = [];
    for (let s = 0; s < (await svgs.count()); s++)
      for (let h = 0; h < (await svgs.nth(s).locator("[role=slider]").count()); h++)
        pairs.push([s, h]);
    const escaped: string[] = [];
    for (const [s, h] of pairs)
      for (const corner of ["top-left", "bottom-right"] as const) {
        // Figures may share one point store, so start every drag from a fresh page.
        await page.goto(route, { waitUntil: "networkidle" });
        const svg = svgs.nth(s);
        const handle = svg.locator("[role=slider]").nth(h);
        await svg.scrollIntoViewIfNeeded();
        const area = (await svg.boundingBox())!;
        const from = (await handle.boundingBox())!;
        await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
        await page.mouse.down();
        const [x, y] =
          corner === "top-left"
            ? [area.x + 2, area.y + 2]
            : [area.x + area.width - 2, area.y + area.height - 2];
        await page.mouse.move(x, y, { steps: 6 });
        await page.mouse.up();
        const out = await svg.evaluate((el) => {
          const box = el.getBoundingClientRect();
          return [...el.querySelectorAll("text")]
            .filter((t) => {
              const r = t.getBoundingClientRect();
              return (
                r.width > 0 &&
                (r.left < box.left - 1 ||
                  r.right > box.right + 1 ||
                  r.top < box.top - 1 ||
                  r.bottom > box.bottom + 1)
              );
            })
            .map((t) => t.textContent ?? "");
        });
        const name = (await handle.getAttribute("aria-label")) ?? `handle ${h}`;
        for (const label of out)
          escaped.push(`svg ${s}, ${name} → ${corner}: "${label}" leaves the figure`);
      }
    expect(escaped).toEqual([]);
  });
