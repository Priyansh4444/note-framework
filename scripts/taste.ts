/**
 * Reader-taste guard. Static rules scan source; `--url` runs the browser rules in
 * scripts/taste-measure.ts against any page (course sites included).
 * Silence one line with `taste-allow <rule>: <reason>` on that line or the line above.
 */
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { Glob } from "bun";

export type StaticRule = {
  id: string;
  files: RegExp;
  hint: string;
  hit: (line: string) => boolean;
};
export type Violation = { rule: string; file: string; line: number; text: string; hint: string };

const FILLER =
  /\b(it(?:'|’)?s (?:important|worth) (?:to note|noting)|it is (?:important|worth) (?:to note|noting)|let(?:'|’)s dive|dive into|delve|in this section,? we|as we can see|needless to say|it goes without saying|in conclusion|at the end of the day|simply put|basically)\b/i;
const RAW_COLOR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch)\(/i;

/** `linear` timing with a non-zero duration in a transition/animation shorthand. */
function linearMotion(line: string): boolean {
  const declaration = /\b(transition|animation)(?:-timing-function)?\s*:([^;]*)/i.exec(line);
  if (!declaration) return false;
  return declaration[2].split(/,(?![^(]*\))/).some((part) => {
    if (!/\blinear\b(?!\()/.test(part) || /\binfinite\b/.test(part)) return false;
    const duration = /(\d*\.?\d+)m?s\b/.exec(part);
    return !duration || Number(duration[1]) > 0;
  });
}

/** Raw color outside a custom-property definition and outside var() fallbacks. */
function rawColor(line: string): boolean {
  if (/^\s*--[\w-]+\s*:/.test(line)) return false;
  return RAW_COLOR.test(line.replace(/var\([^()]*(?:\([^()]*\)[^()]*)*\)/g, ""));
}

export const STATIC_RULES: StaticRule[] = [
  {
    id: "dark-only",
    files: /\.(css|tsx?)$/,
    hint: "Notes are dark only; delete the light theme.",
    hit: (l) =>
      /prefers-color-scheme:\s*light|color-scheme:\s*light\b|colorScheme:\s*["']light/.test(l),
  },
  {
    id: "no-mermaid",
    files: /\.(tsx?|json)$/,
    hint: "Draw diagrams by hand in SVG with the kit; Mermaid layouts are banned.",
    hit: (l) => /from\s+["']mermaid|import\(["']mermaid|"mermaid"\s*:/.test(l),
  },
  {
    id: "linear-motion",
    files: /\.css$/,
    hint: "Use a spring variable or ease-out; linear motion reads bland.",
    hit: linearMotion,
  },
  {
    id: "linear-motion",
    files: /\.tsx?$/,
    hint: "Use a spring or ease-out; linear motion reads bland.",
    hit: (l) => /\b(ease|easing)\s*:\s*["'`]linear["'`]/.test(l),
  },
  {
    id: "hover-zoom",
    files: /\.css$/,
    hint: "Do not zoom on hover; change ink or elevation instead.",
    hit: (l) => /:hover[^{]*\{[^}]*scale\((?:1\.(?:0[5-9]|[1-9])|[2-9])/.test(l),
  },
  {
    id: "palette-tokens",
    files: /\.css$/,
    hint: "Take colors from theme.css tokens (terminal palette); define new ones as --tokens.",
    hit: rawColor,
  },
  {
    id: "filler-prose",
    files: /\.(tsx|md)$/,
    hint: "Dead sentence: state the idea directly or cut it.",
    hit: (l) => FILLER.test(l),
  },
];

const DEFAULT_SKIP =
  /(^|\/)(node_modules|dist[^/]*|vendor|artifacts|releases|studies)\/|theme\.css$|taste(\.test)?\.ts$/;

export function scanSource(file: string, source: string, rules = STATIC_RULES): Violation[] {
  const lines = source.split("\n");
  const found: Violation[] = [];
  lines.forEach((text, index) => {
    for (const rule of rules) {
      if (!rule.files.test(file) || !rule.hit(text)) continue;
      const allow = new RegExp(`taste-allow ${rule.id}: \\w{3}`);
      if (allow.test(text) || allow.test(lines[index - 1] ?? "")) continue;
      found.push({ rule: rule.id, file, line: index + 1, text: text.trim(), hint: rule.hint });
    }
  });
  return found;
}

export function scanTree(root = ".", dirs = ["src", "templates/starter"]) {
  const violations: Violation[] = [];
  const paths = dirs.flatMap((dir) => [
    ...new Glob(`${dir}/**/*.{css,ts,tsx,md}`).scanSync({ cwd: root }),
  ]);
  for (const path of paths) {
    if (DEFAULT_SKIP.test(path)) continue;
    violations.push(...scanSource(path, readFileSync(`${root}/${path}`, "utf8")));
  }
  return violations;
}

async function measureUrls(urls: string[], widths = [390, 1440]) {
  const { chromium } = await import("playwright");
  const { measureTaste } = await import("./taste-measure.ts");
  const browser = await chromium.launch();
  const results: {
    url: string;
    width: number;
    findings: Awaited<ReturnType<typeof measureTaste>>;
  }[] = [];
  try {
    for (const url of urls)
      for (const width of widths) {
        const page = await browser.newPage({
          viewport: { width, height: 900 },
          colorScheme: "dark",
        });
        await page.goto(url, { waitUntil: "networkidle" });
        await page.evaluate(() => document.fonts.ready);
        results.push({ url, width, findings: await page.evaluate(measureTaste) });
        await page.close();
      }
  } finally {
    await browser.close();
  }
  return results;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const urls = args.flatMap((a, i) => (args[i - 1] === "--url" ? [a] : []));
  let failures = 0;
  if (urls.length) {
    for (const { url, width, findings } of await measureUrls(urls)) {
      failures += findings.length;
      for (const f of findings)
        console.log(
          `${url} @${width}px ${f.rule}: ${f.hint}\n  ${f.ids.join(" | ")} ${f.measured ? JSON.stringify(f.measured) : ""}`,
        );
    }
  } else {
    const root = args.find((a) => !a.startsWith("--")) ?? ".";
    for (const v of scanTree(root)) {
      failures++;
      console.log(
        `${relative(".", `${root}/${v.file}`)}:${v.line} ${v.rule}: ${v.hint}\n  ${v.text.slice(0, 120)}`,
      );
    }
  }
  console.log(failures ? `\n${failures} taste violation(s).` : "Taste: clean.");
  process.exit(failures ? 1 : 0);
}
