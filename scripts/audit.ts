import { chromium, type Browser, type Frame, type Locator } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { resolve, isAbsolute } from "node:path";
import { CONTENT_CSP } from "./publication-policy";
import { measureDocument, type Finding, type Measurement } from "./audit-measure";

export type AuditOptions = {
  url?: string;
  html?: string;
  out?: string;
  /** CLI defaults to 1280/390/320; tests can exercise a single viewport. */
  widths?: number[];
};
export type AuditSample = Measurement & {
  viewport: { width: number; height: number };
  state: string;
  screenshot?: string;
};
export type AuditReport = {
  version: 1;
  source: string;
  status: "pass" | "findings" | "incomplete";
  exitCode: 0 | 1 | 2;
  samples: AuditSample[];
  findings: Finding[];
  coverage: {
    samples: number;
    evaluated: number;
    unsupported: number;
    gated: number;
    svgTexts: number;
    shadowRoots: number;
    codeContainers: number;
    deferred: number;
  };
  limitations: string[];
};

const MAX_SCENES = 16,
  MAX_BEATS = 32,
  MAX_DURATION_MS = 60_000,
  MAX_SAMPLES = 240;
const MAX_DISCLOSURE_SETTLE_MS = 2_000;
const limitation = [
  "Finite gate/beat/paused/expanded-Fit samples do not prove continuous visibility, all states, or mathematical correctness.",
  "Axis-aligned transformed text bounds are conservative, not glyph-ink intersections. Masks, filters and nonrectangular clipping are unverified.",
  "Five-point hit tests detect fully obstructed targets; partial overlays, pointer-events:none paint, transparent hits and arbitrary pixel occlusion are not proved.",
  "Expanded modal samples cover the active dialog; background obligations are deferred and checked in ordinary samples.",
  "Only real open shadow roots are traversed; closed roots/canvas internals are not inspectable. Opaque HTML screenshots show the iframe viewport.",
];

/** Self-contained for evaluation inside an opaque publication frame. */
function disclosureTransitionMs(element: Element): number {
  if (!element.matches("details[open]:not(.nk-check)")) return 0;
  // Native ::details-content transitions are not exposed by getAnimations() in
  // Chromium. Flush the newly open style before reading their wall-clock budget.
  element.getBoundingClientRect();
  const style = getComputedStyle(element, "::details-content");
  void style.blockSize;
  const milliseconds = (list: string) =>
    list.split(",").map((value) => {
      const time = value.trim();
      return parseFloat(time) * (time.endsWith("ms") ? 1 : 1_000);
    });
  const durations = milliseconds(style.transitionDuration),
    delays = milliseconds(style.transitionDelay);
  return style.transitionProperty.split(",").reduce((longest, property, index) => {
    if (!["block-size", "content-visibility", "all"].includes(property.trim())) return longest;
    const duration = durations[index % durations.length]!;
    if (duration <= 0) return longest;
    return Math.max(longest, duration + delays[index % delays.length]!);
  }, 0);
}

/** Use the actual publication policy, not a permissive facsimile. */
async function localFixture(
  file: string,
): Promise<{ url: string; origin: string; close: () => Promise<void> }> {
  if (!isAbsolute(file)) throw new Error("--html requires an absolute single-file HTML path");
  const html = await readFile(file, "utf8");
  const server: Server = createServer((req, res) => {
    if (req.url === "/content") {
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": CONTENT_CSP,
        "Cache-Control": "no-store",
      });
      res.end(html);
    } else if (req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        '<!doctype html><style>html,body{margin:0;width:100%;height:100%}iframe{display:block;border:0;width:100%;height:100%}</style><iframe title="Opaque audit fixture" sandbox="allow-scripts" src="/content"></iframe>',
      );
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise<void>((done, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", done);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Local fixture server has no port");
  const origin = `http://127.0.0.1:${address.port}`;
  return {
    url: `${origin}/`,
    origin,
    close: () => new Promise((done, reject) => server.close((e) => (e ? reject(e) : done()))),
  };
}

export async function runAudit(options: AuditOptions): Promise<AuditReport> {
  const report: AuditReport = {
    version: 1,
    source: options.html ?? options.url ?? "",
    status: "incomplete",
    exitCode: 2,
    samples: [],
    findings: [],
    coverage: {
      samples: 0,
      evaluated: 0,
      unsupported: 0,
      gated: 0,
      svgTexts: 0,
      shadowRoots: 0,
      codeContainers: 0,
      deferred: 0,
    },
    limitations: limitation,
  };
  const unverified = (rule: string, hint: string, ids: string[] = []) =>
    report.findings.push({ kind: "unverified", rule, ids, hint });
  let browser: Browser | undefined, fixture: Awaited<ReturnType<typeof localFixture>> | undefined;
  const out = resolve(options.out ?? "artifacts/audit");
  try {
    if (!!options.url === !!options.html)
      throw new Error("Provide exactly one URL or --html /abs/singlefile.html");
    const widths = options.widths ?? [1280, 390, 320];
    if (!widths.length || widths.some((w) => !Number.isSafeInteger(w) || w < 1))
      throw new Error("Viewport widths must be positive integers");
    await mkdir(out, { recursive: true });
    if (options.html) fixture = await localFixture(options.html);
    const url = fixture?.url ?? new URL(options.url!).href;
    browser = await chromium.launch({ headless: true });
    for (const width of widths) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        reducedMotion: "no-preference",
        serviceWorkers: fixture ? "allow" : "block",
      });
      if (fixture) {
        const origin = fixture.origin;
        await context.route("**/*", (route) => {
          const request = new URL(route.request().url());
          if (request.origin === origin || ["data:", "blob:"].includes(request.protocol))
            return route.continue();
          unverified(
            "external-request",
            `Blocked external request: ${request.origin}. Inline required resources for --html.`,
          );
          return route.abort("blockedbyclient");
        });
      }
      const page = await context.newPage();
      page.setDefaultTimeout(8000);
      page.on("pageerror", (e) => unverified("page-error", `Viewport ${width}: ${e.message}`));
      page.on("console", (message) => {
        if (
          message.type() === "error" &&
          /content security policy|violates.*directive|refused to (load|connect)/i.test(
            message.text(),
          )
        ) {
          unverified("blocked-resource", `Viewport ${width}: ${message.text()}`);
        }
      });
      page.on("requestfailed", (req) =>
        unverified("resource-failed", `${req.url()}: ${req.failure()?.errorText}`),
      );
      await page.clock.install();
      await page.clock.pauseAt(new Date(Date.now() + 100));
      let frame: Frame;
      const load = async () => {
        await page.goto(url, { waitUntil: "load", timeout: 20_000 });
        if (fixture) {
          const handle = await page.locator("iframe").elementHandle();
          const child = await handle?.contentFrame();
          if (!child) throw new Error("Opaque fixture frame not available");
          frame = child;
        } else frame = page.mainFrame();
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            frame.evaluate(async () => {
              await document.fonts.ready;
            }),
            new Promise((_, reject) => {
              timer = setTimeout(
                () => reject(new Error("Local fonts did not become ready within 8s")),
                8000,
              );
            }),
          ]);
        } finally {
          clearTimeout(timer);
        }
        await page.clock.runFor(32);
      };
      const sample = async (state: string) => {
        if (report.samples.length >= MAX_SAMPLES)
          throw new Error(`Sampling bound ${MAX_SAMPLES} reached; remaining states unverified`);
        const measured = await frame.evaluate(measureDocument);
        const index = report.samples.length;
        const screenshot = `${String(index).padStart(3, "0")}-${width}-${state.replace(/[^a-z0-9-]/gi, "-").slice(0, 100)}.png`;
        await page.screenshot({
          path: resolve(out, screenshot),
          fullPage: !fixture,
          timeout: 10_000,
        });
        report.samples.push({ ...measured, viewport: { width, height: 900 }, state, screenshot });
      };
      const click = async (target: Locator) => {
        // Clock-paused CSS animations cannot satisfy Playwright's stability wait.
        // Obstruction is measured independently, before forced control activation.
        await target.click({ force: true });
      };
      const openDisclosures = async (details: Locator) => {
        // Outer disclosures precede inner ones, so each real summary is reachable.
        for (const disclosure of await details.all()) {
          if ((await disclosure.getAttribute("open")) !== null) continue;
          const summary = disclosure.locator(":scope > summary");
          if (!(await summary.count())) {
            unverified(
              "disclosure-control",
              "Closed disclosure has no summary control; its interior cannot be driven.",
            );
            return false;
          }
          await click(summary.first());
          if ((await disclosure.getAttribute("open")) === null) {
            unverified(
              "disclosure-control",
              "Summary activation did not open its native disclosure.",
            );
            return false;
          }
          const duration = await disclosure.evaluate(disclosureTransitionMs);
          if (!Number.isFinite(duration) || duration > MAX_DISCLOSURE_SETTLE_MS) {
            unverified(
              "disclosure-transition",
              `Native disclosure transition ${duration}ms exceeds the ${MAX_DISCLOSURE_SETTLE_MS}ms settling bound.`,
            );
            return false;
          }
          // Advancing the paused page clock does not finish this native UI reveal.
          // Wait only its finite pseudo-element transition; never finish scene animations.
          if (duration > 0) await page.waitForTimeout(Math.ceil(duration) + 32);
        }
        return true;
      };
      const sceneSelector = ".scene, [data-nk-scene]";
      const isExperiment = async (scene: Locator) =>
        (await scene.getAttribute("data-nk-scene")) !== null;
      const pause = async (scene: Locator) => {
        const button = scene.locator(
          '[data-nk-scene-action="pause"], .scene-controls button[aria-label="Pause"]',
        );
        if (await button.count()) await click(button.first());
      };
      const start = async (scene: Locator) => {
        if (!(await openDisclosures(scene.locator("xpath=ancestor::details")))) return false;
        await scene.scrollIntoViewIfNeeded();
        if (await isExperiment(scene)) {
          const replay = scene.locator("button.nk-experiment-replay");
          const play = (await replay.count())
            ? replay
            : scene.locator('[data-nk-scene-action="play"]');
          if (!(await play.count())) {
            unverified(
              "scene-start",
              "No experiment Replay or Play action; running samples cannot be verified.",
            );
            return false;
          }
          await click(play.first());
          const time = Number(await scene.getAttribute("data-nk-scene-time"));
          if (
            !Number.isFinite(time) ||
            time !== 0 ||
            !(await scene.locator('[data-nk-scene-action="pause"]').count())
          ) {
            unverified(
              "scene-start",
              "Experiment Replay/Play must start its real clock at zero; the action/time markers did not confirm this.",
            );
            return false;
          }
          return true;
        }
        const gate = scene.locator(".scene-gate");
        if (await gate.count()) await click(gate.first());
        else {
          const play = scene.locator('.scene-controls button[aria-label="Play"]');
          if (!(await play.count())) {
            unverified(
              "scene-start",
              "No existing gate or Play control; cannot verify running samples.",
            );
            return false;
          }
          await click(play.first());
        }
        return true;
      };
      const beats = (scene: Locator) =>
        scene.locator('.beats button, [role="group"][aria-label="Timeline"] button');
      const sceneDurations = async (scene: Locator): Promise<number[] | undefined> => {
        if (await isExperiment(scene)) {
          try {
            const declared: unknown = JSON.parse(
              (await scene.getAttribute("data-nk-scene-beats")) ?? "null",
            );
            if (
              !Array.isArray(declared) ||
              !declared.every(
                (beat) =>
                  beat &&
                  typeof beat.label === "string" &&
                  typeof beat.ms === "number" &&
                  Number.isFinite(beat.ms) &&
                  beat.ms > 0,
              )
            )
              return;
            const durations = declared.map((beat) => beat.ms as number);
            const length = Number(await scene.getAttribute("data-nk-scene-length"));
            if (!Number.isFinite(length) || length !== durations.reduce((sum, ms) => sum + ms, 0))
              return;
            return durations;
          } catch {
            return;
          }
        }
        const declared = await beats(scene).evaluateAll((buttons) =>
          buttons.map((button) => button.getAttribute("data-beat-ms")),
        );
        if (
          declared.some(
            (ms) => ms === null || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(ms) || Number(ms) <= 0,
          )
        )
          return;
        return declared.map(Number);
      };
      const confirmTime = async (
        scene: Locator,
        expected: number,
        paused = false,
        final = false,
      ) => {
        if (!(await isExperiment(scene))) return;
        const actual = Number(await scene.getAttribute("data-nk-scene-time"));
        // RAF cadence can fall just before a requested sampling instant. A frozen clock
        // or a fabricated final state must still be reported as incomplete.
        if (
          !Number.isFinite(actual) ||
          Math.abs(actual - expected) > (expected === 0 || final ? 0 : 34)
        ) {
          unverified(
            "scene-clock",
            `Experiment clock ${actual}ms disagrees with requested ${expected}ms.`,
          );
        }
        if (paused && (await scene.locator('[data-nk-scene-action="pause"]').count())) {
          unverified("scene-pause", "Experiment pause action did not pause its real clock.");
        }
      };
      await load();
      await sample("gate-initial");
      const sceneCount = await frame!.locator(sceneSelector).count();
      if (sceneCount > MAX_SCENES)
        unverified(
          "scene-bound",
          `${sceneCount} scenes exceeds bound ${MAX_SCENES}; excess scenes not driven.`,
        );
      for (let sceneIndex = 0; sceneIndex < Math.min(sceneCount, MAX_SCENES); sceneIndex++) {
        const scene = () => frame.locator(sceneSelector).nth(sceneIndex);
        const durations = await sceneDurations(scene());
        const total = durations?.reduce((sum, ms) => sum + ms, 0) ?? 0;
        if (durations?.length && durations.length <= MAX_BEATS && total <= MAX_DURATION_MS) {
          const points = new Set<number>([0, total]);
          let elapsed = 0;
          for (const duration of durations) {
            points.add(elapsed);
            points.add(elapsed + Number(duration) / 2);
            elapsed += Number(duration);
            points.add(elapsed);
          }
          for (const time of [...points].sort((a, b) => a - b)) {
            // A fresh gate/replay is required: seeking backwards from a later state is not evidence.
            await load();
            if (!(await start(scene()))) break;
            await page.clock.runFor(time + (time === total ? 32 : 0));
            await confirmTime(scene(), time, false, time === total);
            await sample(`scene-${sceneIndex}-ms-${time}-${time === total ? "final" : "running"}`);
            await pause(scene());
            const held = await scene().getAttribute("data-nk-scene-time");
            await page.clock.runFor(32);
            await confirmTime(scene(), time, true, time === total);
            if (held !== (await scene().getAttribute("data-nk-scene-time")))
              unverified("scene-pause", "Experiment clock advanced after pause.");
            await sample(`scene-${sceneIndex}-ms-${time}-paused`);
          }
        } else {
          unverified(
            "scene-intervals",
            `Scene ${sceneIndex}: durations absent/invalid or above bounds (${MAX_BEATS} beats/${MAX_DURATION_MS}ms). Gate and clicked points checked; intervals unverified.`,
            [`scene-${sceneIndex}`],
          );
          await load();
          await start(scene());
          await pause(scene());
          await sample(`scene-${sceneIndex}-started-paused`);
          const count = await beats(scene()).count();
          for (let beat = 0; beat < Math.min(count, MAX_BEATS); beat++) {
            await click(beats(scene()).nth(beat));
            await pause(scene());
            await sample(
              `scene-${sceneIndex}-beat-${beat}-${beat === count - 1 ? "final" : "clicked"}-paused`,
            );
          }
          if (count > MAX_BEATS) {
            unverified(
              "beat-bound",
              `Scene ${sceneIndex}: only first ${MAX_BEATS} and final of ${count} clicked points sampled.`,
            );
            await click(beats(scene()).last());
            await pause(scene());
            await sample(`scene-${sceneIndex}-beat-${count - 1}-final-paused`);
          }
          if (!count)
            unverified(
              "scene-final",
              `Scene ${sceneIndex}: no timeline buttons, final state cannot be verified.`,
            );
        }
      }
      await load();
      const disclosureCount = await frame!.locator("details").count();
      if (disclosureCount && (await openDisclosures(frame!.locator("details")))) {
        await page.clock.runFor(32);
        await sample("disclosures-open");
      }
      const outlineTrigger = frame!.locator(".nk-outline-trigger:visible");
      if (await outlineTrigger.count()) {
        await click(outlineTrigger.first());
        await page.clock.runFor(32);
        await sample("outline-open");
      }
      await load();
      const expandable = ".nk-viewer:has([data-nk-viewer-action=expand])";
      const viewerCount = await frame!.locator(expandable).count();
      if (viewerCount > MAX_SCENES)
        unverified("viewer-bound", `Only first ${MAX_SCENES} of ${viewerCount} viewers expanded.`);
      for (let index = 0; index < Math.min(viewerCount, MAX_SCENES); index++) {
        await load();
        const viewer = frame!.locator(expandable).nth(index);
        // Final scene state before reparenting into its native dialog.
        const enclosing = viewer.locator(
          "xpath=ancestor::*[@data-nk-scene or contains(concat(' ',normalize-space(@class),' '),' scene ')][1]",
        );
        if (await enclosing.count()) {
          await start(enclosing);
          const timeline = beats(enclosing);
          if (await timeline.count()) await click(timeline.last());
          else if (await isExperiment(enclosing)) {
            const durations = await sceneDurations(enclosing);
            const total = durations?.reduce((sum, ms) => sum + ms, 0) ?? 0;
            if (total > 0 && total <= MAX_DURATION_MS) await page.clock.runFor(total + 32);
            else unverified("scene-final", "Expanded experiment has no valid bounded duration.");
          }
          await pause(enclosing);
        }
        const expand = viewer.locator('[data-nk-viewer-action="expand"]');
        const fit = viewer.locator('[data-nk-viewer-action="fit"]');
        if (!(await expand.count()) || !(await fit.count())) {
          unverified(
            "viewer-controls",
            "Expanded Fit sample requires existing expand and fit controls.",
            [`viewer-${index}`],
          );
          continue;
        }
        await click(expand.first());
        await page.clock.runFor(32);
        if (!(await viewer.locator("dialog[open]").count()))
          unverified("viewer-dialog", "Expand did not open a native dialog.", [`viewer-${index}`]);
        await click(fit.first());
        await page.clock.runFor(32);
        await sample(`viewer-${index}-expanded-fit`);
      }
      // Other embedded browsing contexts are not silently treated as audited documents.
      if (!fixture && page.frames().length > 1)
        unverified(
          "nested-frame",
          "Only the main URL document was scanned; embedded frames require separate auditing.",
        );
      await context.close();
    }
  } catch (error) {
    unverified(
      "audit-runtime",
      `${error instanceof Error ? error.message : String(error)}. Install the matching local browser with bunx playwright install chromium if missing.`,
    );
  } finally {
    await browser?.close();
    await fixture?.close();
  }
  report.coverage.samples = report.samples.length;
  for (const sample of report.samples) {
    for (const key of [
      "evaluated",
      "unsupported",
      "gated",
      "svgTexts",
      "shadowRoots",
      "codeContainers",
      "deferred",
    ] as const)
      report.coverage[key] += sample[key];
  }
  report.coverage.unsupported += report.findings.filter((f) => f.kind === "unverified").length;
  const findings = [...report.findings, ...report.samples.flatMap((s) => s.findings)];
  report.exitCode =
    findings.some((f) => f.kind === "unverified") || !report.samples.length
      ? 2
      : findings.some((f) => f.kind === "failure")
        ? 1
        : 0;
  report.status =
    report.exitCode === 2 ? "incomplete" : report.exitCode === 1 ? "findings" : "pass";
  await mkdir(out, { recursive: true });
  await writeFile(resolve(out, "report.json"), JSON.stringify(report, null, 2) + "\n");
  return report;
}

export function parseAuditArgs(args: string[]): AuditOptions {
  const options: AuditOptions = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (["--out", "--html", "--desktop"].includes(arg)) {
      const value = args[++i];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}`);
      if (arg === "--out") options.out = value;
      if (arg === "--html") options.html = value;
      if (arg === "--desktop") {
        if (!["1280", "1440"].includes(value)) throw new Error("--desktop must be 1280 or 1440");
        options.widths = [Number(value), 390, 320];
      }
    } else if (arg.startsWith("--") || options.url) throw new Error(`Unknown argument: ${arg}`);
    else options.url = arg;
  }
  if (!!options.url === !!options.html)
    throw new Error(
      "Usage: bun scripts/audit.ts <URL> [--out directory] [--desktop 1440] OR --html /abs/singlefile.html",
    );
  return options;
}

if (import.meta.main) {
  try {
    const options = parseAuditArgs(process.argv.slice(2));
    const report = await runAudit(options);
    console.log(
      `Audit ${report.status}: ${report.coverage.samples} samples, ${report.coverage.evaluated} checks, ${report.coverage.unsupported} unverified. ${resolve(options.out ?? "artifacts/audit", "report.json")}`,
    );
    for (const entry of [
      ...report.findings.map((f) => ({ state: "runtime", finding: f })),
      ...report.samples.flatMap((s) =>
        s.findings.map((f) => ({ state: `${s.viewport.width}/${s.state}`, finding: f })),
      ),
    ].slice(0, 30)) {
      console.error(
        `${entry.finding.kind}: ${entry.state} ${entry.finding.rule} ${entry.finding.ids.join(", ")}: ${entry.finding.hint}`,
      );
    }
    process.exitCode = report.exitCode;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 2;
  }
}
