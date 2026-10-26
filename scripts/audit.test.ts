import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium, type Browser } from "playwright";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { CONTENT_CSP } from "./publication-policy";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditLayout } from "../src/kit/layout";
import { measureDocument, type Measurement } from "./audit-measure";
import { parseAuditArgs, runAudit } from "./audit";

let browser: Browser;
let temporary: string;
beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
  temporary = await mkdtemp(join(tmpdir(), "nk-audit-test-"));
});
afterAll(async () => {
  await browser?.close();
  if (temporary) await rm(temporary, { recursive: true, force: true });
});

const shell = (body: string) =>
  `<!doctype html><meta charset="utf-8"><style>body{margin:0}svg{display:block}text{font-family:Arial;font-size:18px}button{min-width:30px;min-height:24px}</style>${body}`;
async function measure(body: string, width = 390): Promise<Measurement> {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  try {
    await page.setContent(shell(body));
    await page.evaluate(() => document.fonts.ready);
    return await page.evaluate(measureDocument);
  } finally {
    await page.close();
  }
}
const failures = (r: Measurement, rule: string) => r.findings.filter((f) => f.rule === rule);
const svg = (body: string) => `<svg width="300" height="120" viewBox="0 0 300 120">${body}</svg>`;

test("attribute helper is typed, small and strict at runtime", () => {
  expect(
    auditLayout({
      align: "y-center",
      gaps: "x",
      count: 3,
      visible: true,
      separate: 5,
      tolerancePx: 0.5,
    }),
  ).toEqual({
    "data-nk-audit-align": "y-center",
    "data-nk-audit-gaps": "x",
    "data-nk-audit-count": "3",
    "data-nk-audit-visible": "true",
    "data-nk-audit-separate": "5",
    "data-nk-audit-tolerance-px": "0.5",
  });
  for (const options of [
    { count: -1 },
    { count: 1.5 },
    { gaps: "z" },
    { align: "left" },
    { visible: "true" },
    { separate: Infinity },
    { tolerancePx: NaN },
    { unknown: 1 },
  ]) {
    expect(() => auditLayout(options as never)).toThrow();
  }
});

describe("real rendered geometry counterexamples", () => {
  test("transformed direct-child alignment fails then corrected alignment passes", async () => {
    const fixture = (y: number) =>
      svg(
        `<g data-nk-audit-align="y-start" data-nk-audit-count="2"><rect x="10" y="10" width="20" height="20"/><rect x="50" y="10" width="20" height="20" transform="translate(0 ${y})"/></g>`,
      );
    expect(failures(await measure(fixture(8)), "align")).toHaveLength(1);
    expect((await measure(fixture(0))).findings).toEqual([]);
  });
  test("equal centers with unequal edge gaps fail; equal outer gaps pass", async () => {
    const group = (last: number) =>
      svg(
        `<g data-nk-audit-gaps="x"><rect x="10" y="10" width="20" height="20"/><rect x="40" y="10" width="40" height="20"/><rect x="${last}" y="10" width="20" height="20"/></g>`,
      );
    // Centers at 20,60,100 hide unequal spaces when end widths differ.
    const equalCenters = svg(
      '<g data-nk-audit-gaps="x"><rect x="10" y="10" width="20" height="20"/><rect x="50" y="10" width="20" height="20"/><rect x="80" y="10" width="40" height="20"/></g>',
    );
    expect(failures(await measure(equalCenters), "gaps")).toHaveLength(1);
    expect((await measure(group(90))).findings).toEqual([]);
  });
  test("automatic ordinary SVG label collision fails then separated text passes", async () => {
    const fixture = (x: number) =>
      svg(
        `<text id="first" x="10" y="30">Alpha</text><text id="second" x="${x}" y="30">Beta</text>`,
      );
    const failed = await measure(fixture(20));
    expect(failures(failed, "text-collision")[0]?.ids).toEqual(["#first", "#second"]);
    expect((await measure(fixture(120))).findings).toEqual([]);
  });
  test("SVG clipping without document overflow is detected and corrected", async () => {
    const fixture = (x: number) => svg(`<text id="clip" x="${x}" y="30">Clipped label</text>`);
    const failed = await measure(fixture(280));
    expect(failures(failed, "clipped").length).toBeGreaterThan(0);
    expect(failures(failed, "viewport-overflow")).toHaveLength(0);
    expect((await measure(fixture(20))).findings).toEqual([]);
  });
  test("rectangular HTML overflow ancestors clip SVG text independently of root overflow", async () => {
    const fixture = (width: number) =>
      `<div style="width:${width}px;overflow:hidden">${svg('<text x="80" y="30">A label</text>')}</div>`;
    expect(failures(await measure(fixture(100)), "clipped").length).toBeGreaterThan(0);
    expect((await measure(fixture(300))).findings).toEqual([]);
  });
  test("20 SVG units scaled to 10 CSS pixels fails; 30 units at 0.5 scale passes", async () => {
    const fixture = (size: number) =>
      `<svg width="200" height="80" viewBox="0 0 400 160"><text x="20" y="40" style="font-size:${size}px">Scale</text></svg>`;
    expect(failures(await measure(fixture(20)), "font-size")[0]?.measured).toBe(10);
    expect((await measure(fixture(30))).findings).toEqual([]);
  });
  test("hidden and zero-opacity essential targets fail and visible target passes", async () => {
    for (const style of [
      "display:none",
      "opacity:0",
      "visibility:hidden",
      "width:0;height:0;overflow:hidden",
    ]) {
      expect(
        failures(
          await measure(`<div data-nk-essential id="required" style="${style}">Required</div>`),
          "essential-visible",
        ),
      ).toHaveLength(1);
    }
    expect(
      (await measure('<button data-nk-essential id="required">Required</button>')).findings,
    ).toEqual([]);
  });
  test("covering overlay obstructs button; removing overlay passes", async () => {
    const button =
      '<button id="covered" data-nk-essential style="position:absolute;left:20px;top:20px;width:120px;height:40px">Continue</button>';
    expect(
      failures(
        await measure(
          button +
            '<div id="overlay" style="position:absolute;inset:0;background:white;z-index:10"></div>',
        ),
        "obstructed",
      )[0]?.ids,
    ).toContain("#overlay");
    expect((await measure(button)).findings).toEqual([]);
  });
  test("wrapped inline links use their actual fragments and still fail when every fragment is covered", async () => {
    const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
    try {
      await page.setContent(
        shell(
          `<p id="paragraph" style="width:85ch;margin:0;font:16px/24px monospace">${"prefix ".repeat(10)}<a id="wrapped" href="#">OpenCode 2.0: The Service</a></p>`,
        ),
      );
      const geometry = await page.locator("#wrapped").evaluate((link) => {
        const bounds = link.getBoundingClientRect(),
          fragments = [...link.getClientRects()];
        const points = [
          [0.5, 0.5],
          [0.2, 0.2],
          [0.8, 0.2],
          [0.2, 0.8],
          [0.8, 0.8],
        ];
        const hits = (r: DOMRect) =>
          points.map(
            ([x, y]) => document.elementFromPoint(r.x + r.width * x!, r.y + r.height * y!)?.id,
          );
        return {
          fragments: fragments.length,
          unionHits: hits(bounds),
          fragmentHits: fragments.flatMap(hits),
        };
      });
      expect(geometry.fragments).toBe(2);
      expect(geometry.unionHits).toEqual(Array(5).fill("paragraph"));
      expect(geometry.fragmentHits).toEqual(Array(10).fill("wrapped"));
      expect((await page.evaluate(measureDocument)).findings).toEqual([]);

      // Cover only actual fragments, leaving the empty union area hitting the ancestor.
      await page.locator("#wrapped").evaluate((link) => {
        for (const [index, r] of [...link.getClientRects()].entries()) {
          const overlay = document.createElement("div");
          overlay.id = `fragment-cover-${index}`;
          overlay.style.cssText = `position:fixed;left:${r.x}px;top:${r.y}px;width:${r.width}px;height:${r.height}px;background:white;z-index:10`;
          document.body.append(overlay);
        }
      });
      const covered = await page.evaluate(measureDocument);
      expect(failures(covered, "obstructed")).toHaveLength(1);
      expect(failures(covered, "obstructed")[0]?.ids).toEqual([
        "#wrapped",
        "#fragment-cover-0",
        "#fragment-cover-1",
      ]);
      await page
        .locator('[id^="fragment-cover-"]')
        .evaluateAll((overlays) => overlays.forEach((overlay) => overlay.remove()));
      expect((await page.evaluate(measureDocument)).findings).toEqual([]);
    } finally {
      await page.close();
    }
  });
  test("count catches missing child while alignment cardinality alone passes", async () => {
    const fixture = (third: boolean) =>
      svg(
        `<g data-nk-audit-count="3" data-nk-audit-align="y-start"><rect x="10" y="10" width="20" height="20"/><rect x="50" y="10" width="20" height="20"/>${third ? '<rect x="90" y="10" width="20" height="20"/>' : ""}</g>`,
      );
    expect(failures(await measure(fixture(false)), "count")).toHaveLength(1);
    expect((await measure(fixture(true))).findings).toEqual([]);
  });
  test("unsupported mask is unverified rather than green", async () => {
    const result = await measure(
      svg(
        '<defs><mask id="m"><rect width="300" height="120" fill="white"/></mask></defs><g mask="url(#m)"><text x="20" y="30">Masked</text></g>',
      ),
    );
    expect(failures(result, "unsupported-geometry")[0]?.kind).toBe("unverified");
    expect(result.unsupported).toBeGreaterThan(0);
  });
  test("strict serialized attributes reject unknown options/values and minimum cardinalities", async () => {
    for (const attr of [
      'data-nk-audit-typo="x"',
      'data-nk-audit-align="left"',
      'data-nk-audit-gaps="z"',
      'data-nk-audit-count="NaN"',
      'data-nk-audit-visible="yes"',
      'data-nk-audit-tolerance-px="-1"',
    ]) {
      expect(failures(await measure(`<div ${attr}></div>`), "invalid-declaration")).toHaveLength(1);
    }
    for (const attr of ['align="x-start"', 'gaps="x"', 'separate="1"']) {
      expect(
        failures(
          await measure(
            `<div data-nk-audit-${attr}><div style="width:10px;height:10px"></div></div>`,
          ),
          "cardinality",
        ),
      ).toHaveLength(1);
    }
  });
  test("declared separation fails overlap and insufficient clearance, corrected group passes", async () => {
    const fixture = (x: number) =>
      svg(
        `<g data-nk-audit-separate="10"><rect x="10" y="10" width="20" height="20"/><rect x="${x}" y="10" width="20" height="20"/></g>`,
      );
    expect(failures(await measure(fixture(20)), "separate")).toHaveLength(1);
    expect(failures(await measure(fixture(35)), "separate")).toHaveLength(1);
    expect((await measure(fixture(40))).findings).toEqual([]);
  });
  test("visible direct SVG children can be hit-tested", async () => {
    expect(
      (
        await measure(
          svg(
            '<g data-nk-audit-visible="true"><rect x="10" y="10" width="30" height="30"/><rect x="70" y="10" width="30" height="30"/></g>',
          ),
        )
      ).findings,
    ).toEqual([]);
  });
  test("real open shadow roots and code containers are scanned", async () => {
    const result = await measure(
      '<div id="host"></div><script>document.querySelector("#host").attachShadow({mode:"open"}).innerHTML=\'<style>text{font:10px Arial}</style><pre style="width:20px;overflow:hidden">xxxxxxxxxx</pre><svg width="200" height="80"><text x="20" y="30">Small</text></svg>\'</script>',
    );
    expect(result.shadowRoots).toBe(1);
    expect(result.codeContainers).toBe(1);
    expect(failures(result, "font-size")).toHaveLength(1);
    expect(failures(result, "code-overflow")).toHaveLength(1);
  });
});

const sceneFixture = (durations = true) =>
  shell(`<style>.scene:not([data-started]) .scene-content,.scene:not([data-started]) .scene-controls{display:none}.scene[data-started] .scene-gate{display:none}</style>
<figure class="scene" id="scene"><div class="scene-content">${svg('<text id="label" data-nk-essential x="20" y="40">Ready</text>')}</div>
<button class="scene-gate">Start</button><div class="scene-controls"><button id="play" aria-label="Play">Play</button><div class="beats" role="group" aria-label="Timeline"><button ${durations ? 'data-beat-ms="80"' : ""}>One</button><button ${durations ? 'data-beat-ms="80"' : ""}>Two</button></div></div></figure>
<script>
const scene=document.querySelector('.scene'), gate=document.querySelector('.scene-gate'), play=document.querySelector('#play'), label=document.querySelector('#label');
let elapsed=0,last=0,playing=false;
function draw(){label.textContent=elapsed>=160?'Done':'Ready';play.setAttribute('aria-label',playing?'Pause':'Play')}
function tick(now){if(playing){elapsed=Math.min(160,elapsed+now-last);if(elapsed>=160)playing=false;draw()}last=now;requestAnimationFrame(tick)}requestAnimationFrame(tick);
gate.onclick=()=>{scene.setAttribute('data-started','');playing=true;last=performance.now();draw()};play.onclick=()=>{playing=!playing;last=performance.now();draw()};
document.querySelectorAll('.beats button').forEach((button,i)=>button.onclick=()=>{elapsed=(i+1)*80;playing=false;draw()});
</script>`);

test("opaque offline HTML uses current CSP, clock, real gate, beat midpoint/end and paused states", async () => {
  const file = join(temporary, "scene.html");
  await writeFile(file, sceneFixture());
  const out = join(temporary, "scene-out");
  const report = await runAudit({ html: file, out, widths: [390] });
  expect(
    report.samples.some(
      (s) =>
        s.state === "gate-initial" &&
        s.gated > 0 &&
        !s.findings.some((f) => f.rule === "essential-visible"),
    ),
  ).toBe(true);
  expect(report.samples.some((s) => s.state.includes("ms-40-running"))).toBe(true);
  expect(report.samples.some((s) => s.state.includes("ms-160-final"))).toBe(true);
  expect(report.samples.some((s) => s.state.includes("ms-80-paused"))).toBe(true);
  if (report.exitCode !== 0)
    console.error(
      JSON.stringify(
        {
          global: report.findings,
          samples: report.samples
            .filter((s) => s.findings.length)
            .map((s) => ({ state: s.state, findings: s.findings })),
        },
        null,
        2,
      ),
    );
  expect(report.exitCode).toBe(0);
  expect(JSON.parse(await readFile(join(out, "report.json"), "utf8")).coverage.samples).toBe(
    report.samples.length,
  );
}, 30_000);

test("missing durations still checks gate and final clicked state, reports interval coverage incomplete", async () => {
  const file = join(temporary, "generic-scene.html");
  await writeFile(file, sceneFixture(false));
  const report = await runAudit({ html: file, out: join(temporary, "generic-out"), widths: [320] });
  expect(report.samples.some((s) => s.state === "gate-initial")).toBe(true);
  expect(report.samples.some((s) => s.state.includes("beat-1-final"))).toBe(true);
  expect(report.findings.some((f) => f.rule === "scene-intervals")).toBe(true);
  expect(report.exitCode).toBe(2);
}, 30_000);

test("HTML executes with opaque origin and external network blocked; masked required geometry exits 2", async () => {
  const file = join(temporary, "opaque.html");
  await writeFile(
    file,
    shell(
      `<button id="opaque">Opaque</button><script>document.querySelector('#opaque').dataset.nkEssential = self.origin === 'null' ? 'true' : 'invalid'; fetch('https://example.invalid/no-network').catch(()=>{});</script>${svg('<g style="filter:blur(1px)"><text x="20" y="40">Unsupported</text></g>')}`,
    ),
  );
  const report = await runAudit({ html: file, out: join(temporary, "opaque-out"), widths: [320] });
  expect(
    report.samples.flatMap((s) => s.findings).some((f) => f.rule === "invalid-essential"),
  ).toBe(false);
  expect(
    report.samples
      .flatMap((s) => s.findings)
      .some((f) => f.kind === "unverified" && f.rule === "unsupported-geometry"),
  ).toBe(true);
  expect(report.exitCode).toBe(2);
}, 20_000);

test("CLI supports URL, opaque HTML and optional 1440 desktop and rejects ambiguous inputs", () => {
  expect(parseAuditArgs(["http://localhost:3000/", "--out", "out", "--desktop", "1440"])).toEqual({
    url: "http://localhost:3000/",
    out: "out",
    widths: [1440, 390, 320],
  });
  expect(parseAuditArgs(["--html", "/tmp/note.html"])).toEqual({ html: "/tmp/note.html" });
  for (const args of [
    [],
    ["--out"],
    ["--wat"],
    ["--desktop", "999"],
    ["http://localhost/", "--html", "/tmp/a.html"],
  ])
    expect(() => parseAuditArgs(args)).toThrow();
});

const workerFile = new URL("../sharing/worker.ts", import.meta.url);
test.skipIf(!existsSync(workerFile))(
  "portable publication policy exactly matches the root Worker",
  async () => {
    const source = await readFile(workerFile, "utf8");
    const actual = source.match(/^const CONTENT_CSP\s*=\s*"([^"]+)";/m)?.[1];
    expect(actual).toBeDefined();
    expect(CONTENT_CSP).toBe(actual!);
  },
);

test("expanded Fit uses a real native dialog, same SVG, and defers modal background", async () => {
  const file = join(temporary, "viewer.html");
  await writeFile(
    file,
    shell(`<button id="background">Background</button><div class="nk-viewer"><div class="home"><div class="live">${svg('<text x="20" y="30">Viewer</text>')}<button data-nk-viewer-action="expand">Expand</button><button data-nk-viewer-action="fit">Fit</button></div></div><dialog></dialog></div><script>
const root=document.querySelector('.nk-viewer'), live=root.querySelector('.live'), dialog=root.querySelector('dialog'), original=root.querySelector('svg');
root.querySelector('[data-nk-viewer-action=expand]').onclick=()=>{dialog.append(live);dialog.showModal()};
root.querySelector('[data-nk-viewer-action=fit]').onclick=()=>{if(root.querySelector('svg')!==original)throw Error('SVG was cloned')};
</script>`),
  );
  const report = await runAudit({ html: file, out: join(temporary, "viewer-out"), widths: [390] });
  expect(report.samples.some((s) => s.state === "viewer-0-expanded-fit")).toBe(true);
  expect(report.samples.find((s) => s.state === "viewer-0-expanded-fit")?.deferred).toBeGreaterThan(
    0,
  );
  expect(report.exitCode).toBe(0);
}, 20_000);

test("complete failing geometry exits 1 and corrected fixture exits 0 at all default viewports", async () => {
  const file = join(temporary, "exit-code.html");
  await writeFile(file, shell(svg('<text x="20" y="30" style="font-size:10px">Too small</text>')));
  const failed = await runAudit({ html: file, out: join(temporary, "exit-failed") });
  expect(failed.exitCode).toBe(1);
  expect(failed.samples.map((s) => s.viewport.width)).toEqual([1280, 390, 320]);
  await writeFile(file, shell(svg('<text x="20" y="30">Readable</text>')));
  const corrected = await runAudit({ html: file, out: join(temporary, "exit-corrected") });
  expect(corrected.exitCode).toBe(0);
}, 20_000);

test("actual CLI exits 1 for findings and 2 when its browser is missing", async () => {
  const file = join(temporary, "cli-failure.html");
  await writeFile(file, shell(svg('<text x="20" y="30" style="font-size:10px">Failure</text>')));
  const command = [
    process.execPath,
    new URL("./audit.ts", import.meta.url).pathname,
    "--html",
    file,
  ];
  const failed = Bun.spawn([...command, "--out", join(temporary, "cli-failed")], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const failedOutput = new Response(failed.stdout).text();
  const failedErrors = new Response(failed.stderr).text();
  expect(await failed.exited).toBe(1);
  expect(await failedOutput).toContain("Audit findings");
  expect(await failedErrors).toContain("font-size");
  const missing = Bun.spawn([...command, "--out", join(temporary, "cli-missing")], {
    env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: join(temporary, "absent-browsers") },
    stdout: "pipe",
    stderr: "pipe",
  });
  const missingOutput = new Response(missing.stdout).text();
  const missingErrors = new Response(missing.stderr).text();
  expect(await missing.exited).toBe(2);
  expect(await missingOutput).toContain("Audit incomplete");
  expect(await missingErrors).toContain("audit-runtime");
}, 20_000);

test("URL mode audits the main browser document", async () => {
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: () =>
      new Response(shell(svg('<text x="20" y="30">URL fixture</text>')), {
        headers: { "Content-Type": "text/html" },
      }),
  });
  try {
    const report = await runAudit({
      url: server.url.href,
      out: join(temporary, "url-out"),
      widths: [390],
    });
    expect(report.exitCode).toBe(0);
    expect(report.samples[0]?.svgTexts).toBe(1);
  } finally {
    await server.stop(true);
  }
}, 15_000);

test("closed details layout boxes are excluded until disclosure opens", async () => {
  const content =
    '<details><summary>Reasoning</summary><svg width="300" height="80"><text x="20" y="30" style="font-size:10px">Hidden until requested</text></svg></details>';
  const closed = await measure(content);
  expect(failures(closed, "font-size")).toHaveLength(0);
  const opened = await measure(content.replace("<details>", "<details open>"));
  expect(failures(opened, "font-size")).toHaveLength(1);
});

const disclosureGeometry = (offset = 0) =>
  svg(
    `<g data-nk-audit-align="y-start" data-nk-audit-gaps="x" data-nk-audit-separate="10" data-nk-audit-count="3" data-nk-audit-visible="true"><rect x="10" y="10" width="20" height="20"/><rect x="50" y="${10 + offset}" width="20" height="20"/><rect x="90" y="10" width="20" height="20"/></g>`,
  );

test("closed disclosure geometry and essential interiors are deferred, opened geometry still fails then passes", async () => {
  const fixture = (open: boolean, offset: number) =>
    `<details ${open ? "open" : ""}><summary>Experiment details</summary>${disclosureGeometry(offset)}<button data-nk-essential>Interior action</button></details>`;
  const closed = await measure(fixture(false, 8));
  expect(closed.findings).toEqual([]);
  expect(closed.deferred).toBe(6); // SVG, group, three rectangles, and the essential button.
  const opened = await measure(fixture(true, 8));
  expect(opened.deferred).toBe(0);
  expect(failures(opened, "align")).toHaveLength(1);
  expect(failures(opened, "hidden-measurement")).toHaveLength(0);
  expect((await measure(fixture(true, 0))).findings).toEqual([]);
});

test("closed disclosure summaries and their descendants retain visibility obligations", async () => {
  const result = await measure(
    `<details><summary id="summary" data-nk-essential style="opacity:0"><span id="summary-label" data-nk-essential>Experiment details</span></summary>${disclosureGeometry()}</details>`,
  );
  expect(result.deferred).toBe(5);
  expect(
    failures(result, "essential-visible")
      .map((f) => f.ids[0])
      .sort(),
  ).toEqual(["#summary", "#summary-label"]);
  const automatic = await measure(
    `<details><summary id="automatic-summary" style="pointer-events:none">Experiment details</summary>${disclosureGeometry()}</details>`,
  );
  expect(failures(automatic, "hit-test-unavailable").map((f) => f.ids[0])).toEqual([
    "#automatic-summary",
  ]);
});

test("genuinely hidden required geometry outside a closed disclosure is not deferred", async () => {
  const result = await measure(
    `<div style="opacity:0">${disclosureGeometry()}<button data-nk-essential>Required action</button></div>`,
  );
  expect(result.deferred).toBe(0);
  expect(failures(result, "hidden-measurement")).toHaveLength(3);
  expect(failures(result, "hidden-measurement").every((f) => f.kind === "unverified")).toBe(true);
  expect(failures(result, "essential-visible")).toHaveLength(4);
});

test("closed details declarations defer interior geometry but still check their summary and count", async () => {
  for (const hidden of [false, true]) {
    const result = await measure(
      `<details data-nk-audit-align="x-start" data-nk-audit-visible="true" data-nk-audit-count="3"><summary id="boundary-summary" style="opacity:${hidden ? 0 : 1}">Details</summary><div style="width:20px;height:20px"></div></details>`,
    );
    expect(result.deferred).toBe(1);
    expect(failures(result, "hidden-measurement")).toHaveLength(hidden ? 1 : 0);
    expect(failures(result, "align")).toHaveLength(0);
    expect(failures(result, "count")).toHaveLength(1);
    expect(failures(result, "essential-visible").map((f) => f.ids[0])).toEqual(
      hidden ? ["#boundary-summary"] : [],
    );
  }
});

test("closed disclosure declarations are still validated", async () => {
  const result = await measure(
    '<details><summary>Details</summary><div data-nk-audit-align="left" data-nk-essential="invalid"></div></details>',
  );
  expect(result.deferred).toBe(1);
  expect(failures(result, "invalid-declaration")).toHaveLength(1);
  expect(failures(result, "invalid-essential")).toHaveLength(1);
  expect(failures(result, "essential-visible")).toHaveLength(0);
});

test("each enclosing disclosure must expose nested geometry, including open shadow roots", async () => {
  for (const shadow of [false, true]) {
    for (const outerOpen of [false, true])
      for (const innerOpen of [false, true]) {
        const inside = `<details ${innerOpen ? "open" : ""}><summary>Inner</summary>${disclosureGeometry(8)}</details>`;
        const content = shadow
          ? `<div id="disclosure-host"></div><script>document.querySelector('#disclosure-host').attachShadow({mode:'open'}).innerHTML=${JSON.stringify(inside)}</script>`
          : inside;
        const result = await measure(
          `<details ${outerOpen ? "open" : ""}><summary>Outer</summary>${content}</details>`,
        );
        expect(result.shadowRoots).toBe(shadow ? 1 : 0);
        expect(failures(result, "hidden-measurement")).toHaveLength(0);
        expect(failures(result, "align")).toHaveLength(outerOpen && innerOpen ? 1 : 0);
        expect(result.deferred > 0).toBe(!outerOpen || !innerOpen);
      }
  }
});

test("shadow descendants of a closed disclosure's summary remain measurable", async () => {
  const result = await measure(
    `<details><summary><span id="summary-host"></span></summary><div>Deferred interior</div></details><script>document.querySelector('#summary-host').attachShadow({mode:'open'}).innerHTML=${JSON.stringify(disclosureGeometry(8))}</script>`,
  );
  expect(result.shadowRoots).toBe(1);
  expect(result.deferred).toBe(1);
  expect(failures(result, "hidden-measurement")).toHaveLength(0);
  expect(failures(result, "align")).toHaveLength(1);
});

test("CLI samples opened disclosures instead of treating their closed boxes as visible", async () => {
  const file = join(temporary, "disclosure.html");
  const fixture = (corrected: boolean) =>
    shell(
      `<details><summary>Reasoning</summary><svg width="300" height="80"><text x="20" y="30" style="font-size:${corrected ? 18 : 10}px">Readable when corrected</text></svg>${disclosureGeometry(corrected ? 0 : 8)}<button data-nk-essential>Interior action</button></details>`,
    );
  await writeFile(file, fixture(false));
  const report = await runAudit({
    html: file,
    out: join(temporary, "disclosure-out"),
    widths: [390],
  });
  expect(report.samples.find((s) => s.state === "gate-initial")?.findings).toEqual([]);
  expect(report.samples.find((s) => s.state === "gate-initial")?.deferred).toBeGreaterThan(0);
  expect(report.samples.find((s) => s.state === "disclosures-open")?.deferred).toBe(0);
  expect(
    report.samples
      .find((s) => s.state === "disclosures-open")
      ?.findings.some((f) => f.rule === "font-size"),
  ).toBe(true);
  expect(
    report.samples
      .find((s) => s.state === "disclosures-open")
      ?.findings.some((f) => f.rule === "align"),
  ).toBe(true);
  expect(report.exitCode).toBe(1);
  await writeFile(file, fixture(true));
  const corrected = await runAudit({
    html: file,
    out: join(temporary, "disclosure-corrected-out"),
    widths: [390],
  });
  expect(corrected.exitCode).toBe(0);
  expect(corrected.samples.every((s) => !s.findings.length)).toBe(true);
}, 20_000);

test("inline SVG viewers do not require rejected camera controls", async () => {
  const file = join(temporary, "inline-viewer.html");
  await writeFile(
    file,
    shell(`<div class="nk-viewer">${svg('<text x="20" y="30">Inline figure</text>')}</div>`),
  );
  const report = await runAudit({
    html: file,
    out: join(temporary, "inline-viewer-out"),
    widths: [390],
  });
  expect(report.samples[0]?.svgTexts).toBe(1);
  expect(report.findings.some((f) => f.rule === "viewer-controls")).toBe(false);
  expect(report.exitCode).toBe(0);
}, 20_000);

const experimentFixture = ({
  brokenMidpoint = false,
  frozen = false,
  invalidDuration = false,
  resumable = false,
  replay = false,
  brokenReplay = false,
} = {}) =>
  shell(`
<figure data-nk-scene data-nk-scene-length="160" data-nk-scene-time="${resumable ? 64 : 160}"
  data-nk-scene-beats='${invalidDuration ? '[{"label":"One","ms":"80"}]' : '[{"label":"One","ms":80},{"label":"Two","ms":80}]'}'>
  ${svg('<text id="experiment-label" data-nk-essential x="20" y="40">Ready</text>')}
  <button data-nk-scene-action="play">Watch</button>
  ${replay ? '<button class="nk-experiment-replay">Replay</button>' : ""}
</figure>
<script>
const scene = document.querySelector('[data-nk-scene]'), action = scene.querySelector('button'), label = scene.querySelector('text');
let elapsed = ${resumable ? 64 : 160}, playing = false, last = 0;
function draw() {
  scene.dataset.nkSceneTime = String(${frozen ? "0" : "elapsed"});
  action.dataset.nkSceneAction = playing ? 'pause' : 'play';
  action.textContent = playing ? 'Pause' : elapsed === 160 ? 'Watch again' : 'Continue';
  label.textContent = elapsed === 160 ? 'Done' : 'Moving';
  label.style.fontSize = ${brokenMidpoint ? "elapsed > 0 && elapsed < 160 ? '10px' : '18px'" : "'18px'"};
}
function tick(now) {
  if (!playing) return;
  elapsed = Math.min(160, elapsed + now - last); last = now;
  if (elapsed === 160) playing = false;
  draw(); if (playing) requestAnimationFrame(tick);
}
action.onclick = () => {
  if (playing) { playing = false; draw(); return; }
  ${resumable ? "" : "if (elapsed === 160) elapsed = 0;"}
  playing = true; last = performance.now(); draw(); requestAnimationFrame(tick);
};
const replay = scene.querySelector('.nk-experiment-replay');
if (replay) replay.onclick = () => {
  ${brokenReplay ? "" : "elapsed = 0;"} playing = true; last = performance.now(); draw(); requestAnimationFrame(tick);
};
</script>`);

test("resumable Experiment uses its Replay button and still catches midpoint geometry and frozen clocks", async () => {
  const file = join(temporary, "resumable-experiment.html");
  for (const [name, options, exitCode] of [
    ["valid", {}, 0],
    ["midpoint", { brokenMidpoint: true }, 1],
    ["frozen", { frozen: true }, 2],
    ["broken-replay", { brokenReplay: true }, 2],
  ] as const) {
    await writeFile(file, experimentFixture({ resumable: true, replay: true, ...options }));
    const report = await runAudit({
      html: file,
      out: join(temporary, `resumable-${name}`),
      widths: [390],
    });
    expect(report.exitCode).toBe(exitCode);
    if (name === "broken-replay") {
      expect(report.findings.some((f) => f.rule === "scene-start")).toBe(true);
      continue;
    }
    expect(report.findings.some((f) => f.rule === "scene-start")).toBe(false);
    expect(report.samples.some((s) => s.state === "scene-0-ms-80-paused")).toBe(true);
    expect(report.samples.some((s) => s.state === "scene-0-ms-160-final")).toBe(true);
    if (name === "midpoint")
      expect(
        report.samples
          .find((s) => s.state === "scene-0-ms-40-running")
          ?.findings.some((f) => f.rule === "font-size"),
      ).toBe(true);
    if (name === "frozen")
      expect(
        report.findings.some((f) => f.rule === "scene-clock" && f.hint.includes("160ms")),
      ).toBe(true);
  }
}, 60_000);

test("Experiment without legacy selectors is sampled at real beat boundaries, midpoints, final and paused states", async () => {
  const file = join(temporary, "experiment.html");
  await writeFile(file, experimentFixture({ brokenMidpoint: true }));
  const report = await runAudit({
    html: file,
    out: join(temporary, "experiment-out"),
    widths: [390],
  });
  expect(report.findings).toEqual([]);
  expect(report.samples.find((s) => s.state === "gate-initial")?.findings).toEqual([]);
  expect(
    report.samples.some(
      (s) => s.state === "scene-0-ms-40-running" && s.findings.some((f) => f.rule === "font-size"),
    ),
  ).toBe(true);
  expect(report.samples.some((s) => s.state === "scene-0-ms-80-paused")).toBe(true);
  expect(report.samples.find((s) => s.state === "scene-0-ms-160-final")?.findings).toEqual([]);
  expect(report.exitCode).toBe(1);
}, 30_000);

test("Experiment invalid duration or frozen time metadata cannot silently pass", async () => {
  const file = join(temporary, "invalid-experiment.html");
  for (const [name, options, rule] of [
    ["duration", { invalidDuration: true }, "scene-intervals"],
    ["clock", { frozen: true }, "scene-clock"],
  ] as const) {
    await writeFile(file, experimentFixture(options));
    const report = await runAudit({
      html: file,
      out: join(temporary, `invalid-experiment-${name}`),
      widths: [320],
    });
    expect(report.findings.some((f) => f.rule === rule)).toBe(true);
    expect(report.exitCode).toBe(2);
  }
}, 30_000);

test("Experiment owns its figure geometry under the real post stylesheet, including phones", async () => {
  const postCSS = await readFile(new URL("../src/post/post.css", import.meta.url), "utf8");
  const experimentCSS = await readFile(
    new URL("../src/kit/experiment.css", import.meta.url),
    "utf8",
  );
  const page = await browser.newPage();
  try {
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.setContent(
        shell(
          `<style>${postCSS}\n${experimentCSS}</style><main style="width:calc(100% - 48px);max-width:680px;margin:auto"><figure class="nk-experiment"><p class="nk-experiment-question">A static experiment</p><output>0.25</output></figure></main>`,
        ),
      );
      const geometry = await page.locator("figure").evaluate((element) => {
        const box = element.getBoundingClientRect(),
          parent = element.parentElement!.getBoundingClientRect();
        return {
          left: box.left,
          right: box.right,
          width: box.width,
          parentLeft: parent.left,
          parentRight: parent.right,
          parentWidth: parent.width,
          transform: getComputedStyle(element).transform,
        };
      });
      expect(geometry.transform).toBe("none");
      expect(geometry.left).toBeCloseTo(geometry.parentLeft, 4);
      expect(geometry.right).toBeCloseTo(geometry.parentRight, 4);
      expect(geometry.width).toBeCloseTo(geometry.parentWidth, 4);
    }
  } finally {
    await page.close();
  }
});

const nativeSummary = (label: string) =>
  `<summary class="nk-disclosure-summary"><span class="nk-disclosure-mark" aria-hidden="true">›</span><span class="nk-disclosure-label">${label}</span></summary>`;
const nativeSummaryCSS = `.nk-disclosure-summary { display:grid; grid-template-columns:1em minmax(0,1fr); column-gap:10px; min-height:44px; padding:10px 8px; box-sizing:border-box; line-height:24px; list-style:none; } .nk-disclosure-mark { height:1lh; }`;

// Use the shipped progressive native-disclosure CSS, not an immediate-open facsimile.
test("native disclosure transitions settle before hidden scenes and bottom targets, without finishing mathematical animation", async () => {
  const motionCSS = await readFile(new URL("../src/kit/motion.css", import.meta.url), "utf8");
  const file = join(temporary, "animated-disclosure.html");
  for (const [name, offset] of [
    ["valid", 0],
    ["invalid", 8],
  ] as const) {
    const geometry = disclosureGeometry(offset).replace(
      '<rect x="90"',
      '<rect class="mathematical-animation" x="90"',
    );
    const content = experimentFixture({ resumable: true, replay: true })
      .replace(
        "<figure",
        `<style>${motionCSS}\n${nativeSummaryCSS}
        @keyframes mathematical-motion { to { transform:translateY(20px) } }
        .mathematical-animation { animation:mathematical-motion 2s 1s both paused; }
      </style><details>${nativeSummary("Outer")}<details>${nativeSummary("Inner")}<figure`,
      )
      .replace(
        "</figure>",
        `</figure><div style="height:700px"></div>${geometry}<button id="bottom-target" data-nk-essential>Bottom action</button></details></details>`,
      );
    await writeFile(file, content);
    const report = await runAudit({
      html: file,
      out: join(temporary, `animated-disclosure-${name}`),
      widths: [390],
    });
    expect(report.findings).toEqual([]);
    expect(report.samples.some((s) => s.state === "scene-0-ms-40-running")).toBe(true);
    const opened = report.samples.find((s) => s.state === "disclosures-open");
    expect(opened?.deferred).toBe(0);
    expect(
      opened?.findings.some((f) => f.rule === "essential-in-viewport" || f.rule === "obstructed"),
    ).toBe(false);
    expect(opened?.findings.some((f) => f.rule === "align")).toBe(name === "invalid");
    expect(report.exitCode).toBe(name === "invalid" ? 1 : 0);
  }
}, 60_000);

test("native disclosure open-state sampling flushes and settles the pseudo-element before bottom hit tests", async () => {
  const motionCSS = await readFile(new URL("../src/kit/motion.css", import.meta.url), "utf8");
  const file = join(temporary, "native-disclosure.html");
  const content = shell(
    `<style>${motionCSS}\n${nativeSummaryCSS} details[open]:not(.nk-check):has(> .nk-disclosure-summary)::details-content { transition-delay: .08s, 80ms; }</style><details>${nativeSummary("Reasoning")}<div style="height:1200px"></div><button id="bottom-target" data-nk-essential>Bottom action</button></details>`,
  );
  await writeFile(file, content);
  const report = await runAudit({
    html: file,
    out: join(temporary, "native-disclosure-out"),
    widths: [390],
  });
  expect(report.samples.find((s) => s.state === "gate-initial")?.deferred).toBeGreaterThan(0);
  expect(report.samples.find((s) => s.state === "disclosures-open")?.findings).toEqual([]);
  expect(report.exitCode).toBe(0);
}, 20_000);

test("native disclosure settling bound reports incomplete instead of claiming open-state coverage", async () => {
  const motionCSS = await readFile(new URL("../src/kit/motion.css", import.meta.url), "utf8");
  const file = join(temporary, "slow-disclosure.html");
  await writeFile(
    file,
    shell(
      `<style>${motionCSS}\n${nativeSummaryCSS} details[open]:not(.nk-check):has(> .nk-disclosure-summary)::details-content { transition-duration:3s; }</style><details>${nativeSummary("Slow reveal")}<button data-nk-essential>Interior</button></details>`,
    ),
  );
  const report = await runAudit({
    html: file,
    out: join(temporary, "slow-disclosure-out"),
    widths: [390],
  });
  expect(report.findings.some((f) => f.rule === "disclosure-transition")).toBe(true);
  expect(report.samples.some((s) => s.state === "disclosures-open")).toBe(false);
  expect(report.exitCode).toBe(2);
}, 20_000);
