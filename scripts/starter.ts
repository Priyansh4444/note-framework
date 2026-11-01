#!/usr/bin/env bun
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

/** One portable export; no installation, repository creation, or deployment. */
export interface StarterOptions {
  directory: string;
  slug: string;
  title: string;
}

const ROOT = realpathSync(resolve(import.meta.dirname, ".."));
const USAGE = "bun run framework:new <directory> [--slug <slug>] [--title <title>]";

// Deliberately enumerate files: a new note, resource plugin, or secret in the
// framework checkout must never silently become part of somebody else's kit.
const FRAMEWORK_FILES = [
  ".oxlintrc.json",
  ".oxfmtrc.json",
  "tools/oxlint/index.ts",
  "tools/oxlint/LICENSE",
  "tools/oxlint/SOURCES.md",
  "tools/oxlint/rules/no-low-value-comments.ts",
  "tools/oxlint/rules/no-native-title-tooltip.ts",
  "tools/oxlint/rules/require-suppression-reason.ts",
  "src/App.tsx",
  "src/index.tsx",
  "src/single.tsx",
  "src/virtual-notes.d.ts",
  "src/notes/navigation.css",
  ".agents/skills/explorable-explanations/SKILL.md",
  ".agents/skills/explorable-explanations/references/case-studies.md",
  "src/kit/index.ts",
  "vitest.components.config.ts",
  "component-tests/mount.tsx",
  "component-tests/setup.ts",
  "component-tests/surface.css",
  "component-tests/behavior.browser.tsx",
  "component-tests/visual.browser.tsx",
  ".agents/skills/morph-figures/SKILL.md",
  ".agents/skills/layer-figures/SKILL.md",
  ".agents/skills/ink-figures/SKILL.md",
  "src/kit/patterns/MorphFigure.tsx",
  "src/kit/patterns/morph-model.ts",
  "src/kit/patterns/morph-model.test.ts",
  "src/kit/patterns/morph.css",
  "src/kit/patterns/LayerFigure.tsx",
  "src/kit/patterns/layer-model.ts",
  "src/kit/patterns/layer-model.test.ts",
  "src/kit/patterns/layer.css",
  "src/kit/patterns/InkFigure.tsx",
  "src/kit/patterns/ink-model.ts",
  "src/kit/patterns/ink-model.test.ts",
  "src/kit/patterns/ink.css",
  "src/kit/patterns/recipes.tsx",
  "src/kit/patterns/recipe-model.ts",
  "src/kit/patterns/recipe-model.test.ts",
  "src/kit/patterns/SOURCES.md",
  "src/kit/anim.ts",
  "src/kit/kit.css",
  "src/kit/motion.css",
  "src/kit/motion.ts",
  "src/kit/ui.tsx",
  "src/kit/ui.css",
  "src/kit/Handle.tsx",
  "src/kit/Axes.tsx",
  "src/kit/marks.css",
  "src/kit/note.tsx",
  "src/kit/parts.tsx",
  "src/kit/disclosure.tsx",
  "src/kit/Wayfinder.tsx",
  "src/kit/wayfinder-model.ts",
  "src/kit/wayfinder-model.test.ts",
  "src/kit/DiagramViewer.tsx",
  "src/kit/reader.css",
  "src/kit/Parameter.tsx",
  "src/kit/Parameter.SOURCES.md",
  "src/kit/parameter.css",
  "src/kit/controls.ts",
  "src/kit/Experiment.tsx",
  "src/kit/playback.ts",
  "src/kit/playback.test.ts",
  "src/kit/timeline-model.ts",
  "src/kit/timeline-model.test.ts",
  "src/kit/CurveTimeline.tsx",
  "src/kit/PathPlayhead.tsx",
  "src/kit/scene-audio.ts",
  "src/kit/scene-audio.test.ts",
  "src/kit/curve-timeline.css",
  "src/kit/experiment.css",
  "src/kit/CodeBlock.tsx",
  "src/kit/code-morph.ts",
  "src/kit/code-morph-plan.ts",
  "src/kit/code-block.css",
  "src/kit/layout.ts",
  "src/code-imports.d.ts",
  "src/components/ui/Tex.tsx",
  "src/components/ui/MathMorph.tsx",
  "src/components/ui/morph.ts",
  "src/components/ui/math.css",
  "src/post/post.css",
  "src/post/theme.css",
  "src/post/scene/Scene.tsx",
  "src/post/scene/clock.ts",
  "src/post/scene/clock.test.ts",
  "src/post/scene/springs.ts",
  "src/post/scene/tooltip.tsx",
  "scripts/notes.ts",
  "scripts/note.ts",
  "scripts/share.ts",
  "scripts/code-blocks.ts",
  "scripts/diff-morph.ts",
  "scripts/audit.ts",
  "scripts/audit-measure.ts",
  "scripts/publication-policy.ts",
  "tsconfig.json",
] as const;

const COMPONENT_SCREENSHOTS = [
  "controls-390",
  "controls-1280",
  "morph-390",
  "morph-1280",
  "layers-390",
  "layers-1280",
  "ink-390",
  "ink-1280",
].flatMap((name) =>
  ["", "-ubuntu-24"].map(
    (renderer) =>
      `component-tests/__screenshots__/visual.browser.tsx/${name}${renderer}-chromium-linux.png`,
  ),
);

const STARTER_FILES = {
  "README.md": "README.md",
  "AGENTS.md": "AGENTS.md",
  "SKILL.md": ".agents/skills/note-explainers/SKILL.md",
  "reader-contract.md": ".agents/skills/note-explainers/references/reader-contract.md",
  "authoring-tools.md": ".agents/skills/note-explainers/references/authoring-tools.md",
  "recipes.tsx": "src/recipes.tsx",
  "taste.md": ".agents/skills/note-explainers/references/taste.md",
  "vite.config.ts": "vite.config.ts",
  "index.html": "index.html",
} as const;

const DEPENDENCIES = [
  "@floating-ui/dom",
  "@fontsource-variable/newsreader",
  "@fontsource/commit-mono",
  "@solidjs/router",
  "katex",
  "motion",
  "solid-js",
  "svg-pathdata",
] as const;
const DEV_DEPENDENCIES = [
  "@vitest/browser-playwright",
  "vitest",
  "@oxlint/plugins",
  "oxlint",
  "oxfmt",
  "@pierre/diffs",
  "playwright",
  "@types/bun",
  "typescript",
  "vite",
  "vite-plugin-solid",
  "vite-plugin-singlefile",
  "wrangler",
] as const;

function inside(parent: string, path: string) {
  const part = relative(parent, path);
  return part === "" || (part !== ".." && !part.startsWith(`..${sep}`) && !isAbsolute(part));
}

/** Resolve existing ancestors too, so an alias cannot hide source overlap. */
function canonicalDestination(path: string): string {
  let ancestor = path;
  const tail: string[] = [];
  while (!existsSync(ancestor)) {
    // existsSync follows links; lstat also catches dangling links.
    const info = lstatSync(ancestor, { throwIfNoEntry: false });
    if (info?.isSymbolicLink()) throw new Error(`Destination uses a dangling symlink: ${ancestor}`);
    tail.unshift(basename(ancestor));
    ancestor = dirname(ancestor);
  }
  return resolve(realpathSync(ancestor), ...tail);
}

function validateDestination(directory: string): string {
  if (!directory.trim()) throw new Error("Choose a destination directory.");
  const target = resolve(directory);
  const info = lstatSync(target, { throwIfNoEntry: false });
  if (info?.isSymbolicLink()) throw new Error(`Destination must not be a symlink: ${target}`);
  const canonical = canonicalDestination(target);
  for (const path of [target, canonical]) {
    if (inside(ROOT, path) || inside(path, ROOT)) {
      throw new Error(
        "Destination must be outside the framework checkout and must not contain it.",
      );
    }
  }
  if (info && (!info.isDirectory() || readdirSync(target).length > 0)) {
    throw new Error(`Destination already exists and is not an empty directory: ${target}`);
  }
  return target;
}

function readSourceBytes(path: string): Buffer {
  const file = resolve(ROOT, path);
  if (!inside(ROOT, realpathSync(file)) || !lstatSync(file).isFile()) {
    throw new Error(`Starter source must be a regular file inside the framework: ${path}`);
  }
  return readFileSync(file);
}

function readSource(path: string): string {
  return readSourceBytes(path).toString("utf8");
}

function templateFiles(path = "templates/note"): string[] {
  return readdirSync(resolve(ROOT, path), { withFileTypes: true }).flatMap((entry) => {
    const file = `${path}/${entry.name}`;
    if (entry.isDirectory()) return templateFiles(file);
    if (!entry.isFile() || !/^[\w.-]+\.(?:tsx?|css|json|diff)$/.test(entry.name)) {
      throw new Error(`Unexpected file in the note template: ${file}`);
    }
    return [file];
  });
}

function starterPackage(slug: string): string {
  const source = JSON.parse(readSource("package.json"));
  const select = (group: "dependencies" | "devDependencies", names: readonly string[]) =>
    Object.fromEntries(
      names.toSorted().map((name) => {
        const version = source[group]?.[name];
        if (typeof version !== "string") throw new Error(`Missing starter dependency: ${name}`);
        return [name, version];
      }),
    );
  return (
    JSON.stringify(
      {
        name: `${slug}-note`,
        version: "0.1.0",
        private: true,
        type: "module",
        scripts: {
          dev: "vite",
          build: "vite build",
          check: "tsc --noEmit",
          lint: "oxlint --deny-warnings --report-unused-disable-directives",
          fmt: "oxfmt src scripts component-tests tools *.ts *.json",
          "fmt:check": "oxfmt --check src scripts component-tests tools *.ts *.json",
          test: "bun test --conditions=browser",
          "test:components:vitest": "vitest run --config vitest.components.config.ts",
          "test:visual":
            "vitest run --config vitest.components.config.ts component-tests/visual.browser.tsx",
          "test:visual:update": "bun run test:visual --update",
          "note:new": "bun scripts/note.ts new",
          "note:list": "bun scripts/note.ts list",
          "note:build": "bun scripts/note.ts build",
          "note:html": "bun scripts/note.ts html",
          "note:publish": "bun scripts/note.ts publish",
          share: "bun scripts/share.ts",
          "note:share": "bun scripts/share.ts note",
          "note:audit": "bun scripts/note.ts audit",
          "visual:check": "bun scripts/audit.ts",
          "visual:install": "bunx playwright install chromium",
        },
        dependencies: select("dependencies", DEPENDENCIES),
        devDependencies: select("devDependencies", DEV_DEPENDENCIES),
      },
      null,
      2,
    ) + "\n"
  );
}

function renderNote(file: string, contents: string, options: StarterOptions, date: string): string {
  const replace = (value: string) =>
    value
      .replaceAll("__SLUG__", () => options.slug)
      .replaceAll("__DATE__", () => date)
      .replaceAll("__TITLE__", () => options.title);
  if (file.endsWith(".json")) {
    // Substitute values after parsing, rather than inserting untrusted text
    // between JSON quotes. Titles can contain quotes, newlines, and backslashes.
    const substitute = (value: unknown): unknown => {
      if (typeof value === "string") return replace(value);
      if (Array.isArray(value)) return value.map(substitute);
      if (value && typeof value === "object") {
        return Object.fromEntries(
          Object.entries(value).map(([key, child]) => [key, substitute(child)]),
        );
      }
      return value;
    };
    const value = substitute(JSON.parse(contents));
    if (basename(file) === "note.json") {
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("note.json must be an object.");
      return JSON.stringify({ ...value, home: true }, null, 2) + "\n";
    }
    return JSON.stringify(value, null, 2) + "\n";
  }
  if (contents.includes("__TITLE__")) {
    throw new Error(`Use note.json for titles instead of a source placeholder: ${file}`);
  }
  return replace(contents);
}

/** Export the latest kit and note template, without changing the source checkout. */
export function createStarter(options: StarterOptions): string {
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(options.slug)) {
    throw new Error(
      "Slug must start with a lowercase letter and contain lowercase words or digits separated by dashes.",
    );
  }
  if (!options.title.trim()) throw new Error("Title must not be empty.");
  const target = validateDestination(options.directory);
  const files = new Map<string, string>();
  for (const file of FRAMEWORK_FILES) files.set(file, readSource(file));
  for (const [source, output] of Object.entries(STARTER_FILES)) {
    files.set(output, readSource(`templates/starter/${source}`));
  }
  const date = new Date().toISOString().slice(0, 10);
  const escapeHtml = (value: string) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  files.set(
    "index.html",
    files.get("index.html")!.replaceAll("__TITLE__", () => escapeHtml(options.title)),
  );
  for (const file of templateFiles()) {
    const contents = readSource(file);
    const local = relative("templates/note", file);
    files.set(file, contents);
    files.set(`src/notes/${options.slug}/${local}`, renderNote(file, contents, options, date));
  }
  const favicon = existsSync(resolve(ROOT, "templates/starter/favicon.svg"))
    ? "templates/starter/favicon.svg"
    : "public/favicon.svg";
  if (existsSync(resolve(ROOT, favicon))) files.set("public/favicon.svg", readSource(favicon));
  files.set("package.json", starterPackage(options.slug));
  files.set(
    ".gitignore",
    "node_modules/\ndist/\ndist-*/\n.env\n.env.*\n.wrangler/\nwrangler.*.jsonc\n.note-framework/\n.vitest/\n",
  );

  mkdirSync(dirname(target), { recursive: true });
  const staging = mkdtempSync(join(dirname(target), ".note-starter-"));
  try {
    for (const [file, contents] of files) {
      const output = join(staging, file);
      mkdirSync(dirname(output), { recursive: true });
      writeFileSync(output, contents, { flag: "wx" });
    }
    for (const file of COMPONENT_SCREENSHOTS) {
      const output = join(staging, file);
      mkdirSync(dirname(output), { recursive: true });
      writeFileSync(output, readSourceBytes(file), { flag: "wx" });
    }
    validateDestination(options.directory);
    // A directory rename fails if the destination became nonempty meanwhile.
    renameSync(staging, target);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
  return target;
}

export function parseStarterOptions(args: string[]): StarterOptions {
  const [directory, ...flags] = args;
  if (!directory || directory.startsWith("-")) throw new Error(`Usage: ${USAGE}`);
  const values = new Map<string, string>();
  for (let i = 0; i < flags.length; i += 2) {
    const flag = flags[i];
    const value = flags[i + 1];
    if (
      !["--slug", "--title"].includes(flag) ||
      value === undefined ||
      value.startsWith("--") ||
      values.has(flag)
    ) {
      throw new Error(`Unknown, repeated, or missing option: ${flag}. Usage: ${USAGE}`);
    }
    values.set(flag, value);
  }
  const slug = values.get("--slug") ?? basename(resolve(directory));
  const title =
    values.get("--title") ??
    slug
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  return { directory, slug, title };
}

if (import.meta.main) {
  if (process.argv.slice(2).join(" ") === "--help") {
    console.log(`Usage: ${USAGE}\nDefaults: slug from the directory name; title from the slug.`);
  } else {
    try {
      const options = parseStarterOptions(process.argv.slice(2));
      const target = createStarter(options);
      const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
      console.log(
        `Created ${target}\n\nNext:\n  cd ${quote(target)}\n  bun install\n  bun run dev\n\nVerify:\n  bun run check\n  bun run test\n  bun run note:build ${options.slug}\n`,
      );
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}
