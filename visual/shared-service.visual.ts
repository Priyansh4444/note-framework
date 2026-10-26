import { expect, test, type Page } from "./browser-test";

async function fixture(page: Page) {
  await page.goto("/visual/fixture.html", { waitUntil: "networkidle" });
  await page.addScriptTag({
    type: "module",
    content:
      'import {mountServiceFixture} from "/visual/shared-service.fixture.tsx"; mountServiceFixture();',
  });
  await expect(page.locator("[data-service-diagram]")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}
const seek = (page: Page, ms: number) => page.evaluate((ms) => window.serviceFixture.seek(ms), ms);

for (const width of [320, 390, 768, 1440]) {
  test(`service route has aligned wires, readable labels, compact rows and local scrolling at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1100 });
    await page.goto("/notes/shared-service", { waitUntil: "networkidle" });
    await expect(
      page
        .getByRole("navigation", { name: "Framework", exact: true })
        .getByRole("link", { name: "← Note Framework", exact: true }),
    ).toHaveAttribute("href", "/");
    await expect(
      page.getByRole("link", { name: "Build a note like this →", exact: true }),
    ).toHaveAttribute("href", "/docs");
    const experiment = page.locator("#service-experiment");
    await expect(experiment).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await experiment.getByRole("slider", { name: "Service position", exact: true }).press("End");
    const geometry = await experiment.evaluate((el) => {
      const box = (el: Element) => el.getBoundingClientRect();
      const clients = [...el.querySelectorAll<HTMLElement>(".ss-client")];
      const wires = [...el.querySelectorAll<SVGPathElement>(".ss-wire")];
      const ports = [...el.querySelectorAll<HTMLElement>(".ss-port-client")];
      const centerErrors = clients.map((card, i) => {
        const b = box(card),
          p = wires[i].getPointAtLength(0).matrixTransform(wires[i].getScreenCTM()!);
        const port = box(ports[i]);
        return Math.max(
          Math.abs(b.x + b.width / 2 - p.x),
          Math.abs(b.x + b.width / 2 - port.x - port.width / 2),
        );
      });
      const scroll = el.querySelector<HTMLElement>(".ss-scroll")!;
      const stage = el.querySelector(".nk-experiment-stage")!,
        timeline = el.querySelector("[data-nk-timeline]")!;
      const labels = [
        ...el.querySelectorAll<HTMLElement>(
          ".ss-client-heading,.ss-client-task,.ss-client-status,.ss-session-title,.ss-subscribers,.ss-session-status,.ss-pid,.ss-process-state",
        ),
      ];
      return {
        centerErrors,
        pageWidth: document.documentElement.scrollWidth,
        viewport: innerWidth,
        diagramWidth: box(el.querySelector(".ss-diagram")!).width,
        scrollWidth: scroll.scrollWidth,
        clientWidth: scroll.clientWidth,
        scrollTabIndex: scroll.tabIndex,
        cardHeights: clients.map((c) => box(c).height),
        rowHeights: [...el.querySelectorAll(".ss-session")].map((r) => box(r).height),
        wireHeight: box(el.querySelector(".ss-port-columns")!).height,
        minFont: Math.min(...labels.map((l) => parseFloat(getComputedStyle(l).fontSize))),
        font: getComputedStyle(clients[0]).fontFamily,
        stageGap: box(timeline).top - box(stage).bottom,
        checkpointCount: el.querySelectorAll(".nk-timeline-labels button").length,
        diagramBottom: box(el.querySelector(".ss-diagram")!).bottom,
        labelsInsideCards: clients.every((c) =>
          [...c.querySelectorAll(".ss-client-heading,.ss-client-task,.ss-client-status")].every(
            (label) => box(label).bottom <= box(c).bottom - 3,
          ),
        ),
      };
    });
    expect(Math.max(...geometry.centerErrors)).toBeLessThanOrEqual(1);
    expect(geometry.pageWidth).toBeLessThanOrEqual(width);
    expect(geometry.diagramWidth).toBeGreaterThanOrEqual(560);
    expect(geometry.minFont).toBeGreaterThanOrEqual(15);
    expect(geometry.cardHeights).toEqual([120, 120, 120, 120]);
    for (const height of geometry.rowHeights) {
      expect(height).toBeGreaterThanOrEqual(56);
      expect(height).toBeLessThanOrEqual(57);
    }
    expect(geometry.wireHeight).toBe(64);
    expect(geometry.labelsInsideCards).toBe(true);
    expect(geometry.stageGap).toBeGreaterThanOrEqual(24);
    expect(geometry.scrollTabIndex).toBe(0);
    expect(geometry.checkpointCount).toBe(5); // Four phases plus the explicit endpoint.
    const region = experiment.getByRole("region", {
      name: "Four clients connected to one service",
    });
    if (width < 560) {
      expect(geometry.scrollWidth).toBeGreaterThan(geometry.clientWidth);
      await expect(
        experiment.getByText("Swipe sideways, or focus here and use the arrow keys."),
      ).toBeVisible();
      await region.focus();
      await region.press("ArrowRight");
      expect(await region.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
      await region.press("ArrowLeft");
      expect(await region.evaluate((el) => el.scrollLeft)).toBe(0);
    }
    await experiment.screenshot({ path: `/tmp/service-curves/note-final-${width}.png` });
    console.log(JSON.stringify({ width, ...geometry }));
  });
}

test("arrival, subscriber membership, backward seeking and return geometry preserve real nodes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await fixture(page);
  await page.evaluate(() => {
    (window as unknown as { serviceNodes: Element[] }).serviceNodes = [
      ...document.querySelectorAll(".ss-client,.ss-wire,.ss-packet,.ss-port-dot,.ss-session"),
    ];
  });
  const phases = [
    { ms: 3299, rows: 0 },
    { ms: 3300, rows: 1 },
    { ms: 5749, rows: 1 },
    { ms: 5750, rows: 1 },
    { ms: 8400, rows: 2 },
    { ms: 10500, rows: 3 },
    { ms: 12449, rows: 3 },
    { ms: 12450, rows: 3 },
    { ms: 14150, rows: 3 },
    { ms: 15849, rows: 3 },
    { ms: 15850, rows: 3 },
    { ms: 0, rows: 0 },
    { ms: 5750, rows: 1 },
  ];
  for (const phase of phases) {
    await seek(page, phase.ms);
    await expect(page.locator('.ss-session:not([data-state="absent"])')).toHaveCount(phase.rows);
    const projection = await page.evaluate(() => ({
      identity: (window as unknown as { serviceNodes: Element[] }).serviceNodes.every(
        (node, i) =>
          node.isConnected &&
          node ===
            document.querySelectorAll(".ss-client,.ss-wire,.ss-packet,.ss-port-dot,.ss-session")[i],
      ),
      shared: document.querySelector('[data-session="flaky"] .ss-subscribers')!.textContent,
      completed: [...document.querySelectorAll('.ss-client[data-state="Complete"]')].map((el) =>
        el.getAttribute("data-client"),
      ),
    }));
    expect(projection.identity).toBe(true);
    if (phase.ms >= 5750) expect(projection.shared).toContain("Terminal + Web");
    const expected =
      phase.ms >= 15850
        ? ["terminal", "web", "desktop", "script"]
        : phase.ms >= 14150
          ? ["desktop", "script"]
          : phase.ms >= 12450
            ? ["desktop"]
            : [];
    expect(projection.completed).toEqual(expected);
  }
  for (const ms of [2875, 5325, 7975, 10075, 12025, 13725, 15425]) {
    await seek(page, ms);
    const packets = await page.locator('.ss-packet[data-active="true"]').evaluateAll((nodes) =>
      nodes.map((node) => {
        const packet = node as SVGPathElement,
          wire = packet.closest("svg")!.querySelector<SVGPathElement>(".ss-wire")!;
        const a = wire.getPointAtLength(0).matrixTransform(wire.getScreenCTM()!);
        const b = wire
          .getPointAtLength(wire.getTotalLength())
          .matrixTransform(wire.getScreenCTM()!);
        const center = packet
          .getPointAtLength(packet.getTotalLength() / 2)
          .matrixTransform(packet.getScreenCTM()!);
        return {
          error: Math.hypot(center.x - a.x, center.y - (a.y + b.y) / 2),
          kind: packet.getAttribute("data-kind"),
        };
      }),
    );
    expect(packets).toHaveLength(ms === 15425 ? 2 : 1);
    for (const packet of packets) expect(packet.error).toBeLessThanOrEqual(1);
  }
  await seek(page, 15425);
  await page
    .locator("#service-experiment")
    .screenshot({ path: "/tmp/service-curves/note-shared-return.png" });
  for (const [ms, stage] of [
    [1500, "boot"],
    [2875, "first-request"],
    [5750, "web-joined"],
    [12025, "desktop-return"],
  ] as const) {
    await seek(page, ms);
    await page
      .locator("#service-experiment")
      .screenshot({ path: `/tmp/service-curves/note-${stage}.png` });
  }
});

test("sound stays opt-in and seeking the real experiment remains silent", async ({ page }) => {
  await page.addInitScript(() => {
    const Native = window.AudioContext;
    const counts = { contexts: 0, starts: 0 };
    (window as unknown as { serviceAudioCounts: typeof counts }).serviceAudioCounts = counts;
    if (!Native) return;
    window.AudioContext = class extends Native {
      constructor(options?: AudioContextOptions) {
        super(options);
        counts.contexts++;
        for (const method of ["createOscillator", "createBufferSource"] as const) {
          const original = this[method].bind(this);
          Object.defineProperty(this, method, {
            value: () => {
              const source = original(),
                start = source.start.bind(source);
              source.start = (...args: number[]) => {
                counts.starts++;
                start(...args);
              };
              return source;
            },
          });
        }
      }
    };
  });
  await fixture(page);
  for (const ms of [0, 250, 2050, 3300, 5750, 15850, 0]) await seek(page, ms);
  const counts = () =>
    page.evaluate(
      () =>
        (window as unknown as { serviceAudioCounts: { contexts: number; starts: number } })
          .serviceAudioCounts,
    );
  expect(await counts()).toEqual({ contexts: 0, starts: 0 });
  const sound = page.locator(".nk-experiment-sound");
  await expect(sound).toHaveText("Sound off");
  await sound.click();
  await expect(sound).toHaveText("Sound on");
  expect((await counts()).contexts).toBe(1);
  for (const ms of [250, 900, 2050, 3300, 3300.1, 5750, 15425, 15850, 0]) await seek(page, ms);
  expect((await counts()).starts).toBe(0);
  await sound.click();
  await expect(sound).toHaveText("Sound off");
});

test("reduced motion steps the same trace and enlarged phone text stays locally contained", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 320, height: 1100 });
  await fixture(page);
  await page.getByRole("button", { name: "Next step", exact: true }).click();
  expect(
    Number(await page.locator("[data-service-diagram]").getAttribute("data-service-time")),
  ).toBe(3700);
  await expect(page.locator('[data-session="flaky"]')).toHaveAttribute("data-state", "working");
  await seek(page, 15850);
  await page.addStyleTag({
    content:
      ".ss-figure { font-size: 18px !important; } .ss-client-heading,.ss-client-task,.ss-client-status,.ss-service-name,.ss-pid { font-size:18px !important; }",
  });
  // This is an explicit stress sample, not a claim about physical device text-size settings.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  const clearance = await page.locator(".ss-client").evaluateAll((cards) =>
    cards.map((card) => {
      const box = card.getBoundingClientRect();
      const heading = card.querySelector(".ss-client-heading")!.getBoundingClientRect();
      const task = card.querySelector(".ss-client-task")!.getBoundingClientRect();
      const status = card.querySelector(".ss-client-status")!.getBoundingClientRect();
      return {
        headingToTask: task.top - heading.bottom,
        taskToStatus: status.top - task.bottom,
        bottom: box.bottom - status.bottom,
      };
    }),
  );
  for (const card of clearance) {
    expect(card.headingToTask).toBeGreaterThanOrEqual(9);
    expect(card.taskToStatus).toBeGreaterThanOrEqual(3);
    expect(card.bottom).toBeGreaterThanOrEqual(9);
  }
  await page
    .getByRole("region", { name: "Four clients connected to one service" })
    .press("ArrowRight");
  await page
    .locator("#service-experiment")
    .screenshot({ path: "/tmp/service-curves/note-enlarged-320.png" });
});
