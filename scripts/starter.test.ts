import { afterEach, expect, test } from "bun:test";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { createStarter } from "./starter";

const ROOT = resolve(import.meta.dirname, "..");
const temporary: string[] = [];

test("portable agent entry stays small and defers deeper references", () => {
  const entry = readFileSync(join(ROOT, "templates/starter/AGENTS.md"), "utf8");
  const skill = readFileSync(join(ROOT, "templates/starter/SKILL.md"), "utf8");
  const localSkill = readFileSync(join(ROOT, ".agents/skills/note-explainers/SKILL.md"), "utf8");
  expect(entry.split(/\s+/).length).toBeLessThanOrEqual(220);
  expect(skill.split(/\s+/).length).toBeLessThanOrEqual(380);
  expect(localSkill.split(/\s+/).length).toBeLessThanOrEqual(380);
  const explorable = readFileSync(
    join(ROOT, ".agents/skills/explorable-explanations/SKILL.md"),
    "utf8",
  );
  expect(explorable.split(/\s+/).length).toBeLessThanOrEqual(380);
  expect(entry).toContain("read only files you need");
  expect(skill).toContain("only for deeper");
});

function sandbox() {
  const directory = mkdtempSync(join(tmpdir(), "note-starter-test-"));
  temporary.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    expect(entry.isSymbolicLink()).toBe(false);
    return entry.isDirectory() ? files(path) : [path];
  });
}

function options(directory: string, title = "A small worked example") {
  return { directory, slug: "worked-example", title };
}

function cli(args: string[], cwd: string) {
  return Bun.spawnSync([process.execPath, join(ROOT, "scripts/starter.ts"), ...args], { cwd });
}

test("CLI creates an independent kit with one home note and a clean sharing boundary", () => {
  const cwd = sandbox();
  const directory = join(cwd, "a project with spaces");
  const result = cli(
    [directory, "--slug", "worked-example", "--title", "A small worked example"],
    cwd,
  );
  expect(result.exitCode).toBe(0);
  expect(result.stderr.toString()).toBe("");
  expect(result.stdout.toString()).toContain(`cd '${directory}'`);
  for (const command of [
    "bun install",
    "bun run dev",
    "bun run check",
    "bun run test",
    "bun run note:build worked-example",
  ]) {
    expect(result.stdout.toString()).toContain(command);
  }

  const exported = files(directory);
  const paths = exported.map((path) => relative(directory, path));
  expect(paths).toContain("src/post/scene/clock.test.ts");
  expect(paths).toContain("src/components/ui/math.css");
  for (const file of [
    "src/kit/code-morph.ts",
    "src/kit/code-morph-plan.ts",
    "src/kit/wayfinder-model.ts",
    "scripts/diff-morph.ts",
  ])
    expect(paths).toContain(file);
  for (const file of [
    "Parameter.tsx",
    "Parameter.SOURCES.md",
    "parameter.css",
    "controls.ts",
    "Experiment.tsx",
    "experiment.css",
  ]) {
    expect(paths).toContain(`src/kit/${file}`);
  }
  expect(paths).toContain("src/recipes.tsx");
  expect(readFileSync(join(directory, "src/recipes.tsx"), "utf8")).toBe(
    readFileSync(join(ROOT, "templates/starter/recipes.tsx"), "utf8"),
  );
  expect(paths).toContain(".agents/skills/note-explainers/references/reader-contract.md");
  expect(paths).toContain(".agents/skills/explorable-explanations/SKILL.md");
  expect(paths).toContain(".agents/skills/explorable-explanations/references/case-studies.md");
  expect(
    paths.filter((path) =>
      /(?:^|\/)(?:\.git|\.env[^/]*|\.wrangler|node_modules|dist[^/]*)(?:\/|$)|\.(?:pdf|jsonc)$/.test(
        path,
      ),
    ),
  ).toEqual([]);
  expect(
    paths.filter(
      (path) => path.startsWith("src/notes/") && !path.startsWith("src/notes/worked-example/"),
    ),
  ).toEqual(["src/notes/navigation.css"]);
  expect(
    paths
      .filter((path) => path.startsWith("public/"))
      .every((path) => path === "public/favicon.svg"),
  ).toBe(true);
  expect(paths).not.toContain("scripts/cs169-resources.ts");
  expect(paths).not.toContain("scripts/starter.ts");
  const contents = exported.map((path) => readFileSync(path, "utf8")).join("\n");
  expect(contents).not.toMatch(/CS169|CS164|filesystems|cs169-resources|\/home\/pronsh|\/Users\//i);
  expect(contents).not.toContain(ROOT);

  const pkg = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
  expect(pkg.private).toBe(true);
  expect(
    Object.keys(pkg.scripts).every((name) =>
      /^(?:dev|build|check|test(?::[a-z]+)*|share|lint|fmt(?::check)?|note:[a-z]+|visual:[a-z]+)$/.test(
        name,
      ),
    ),
  ).toBe(true);
  expect(pkg.scripts.check).toBe("tsc --noEmit");
  expect(pkg.scripts["test:components:vitest"]).toContain("vitest.components.config.ts");
  for (const width of [390, 1280]) {
    for (const pattern of ["controls", "morph", "layers", "ink"]) {
      const baseline = `component-tests/__screenshots__/visual.browser.tsx/${pattern}-${width}-chromium-linux.png`;
      expect(readFileSync(join(directory, baseline))).toEqual(readFileSync(join(ROOT, baseline)));
    }
  }
  expect(pkg.scripts["note:publish"]).toBe("bun scripts/note.ts publish");
  expect(
    Object.values({ ...pkg.dependencies, ...pkg.devDependencies }).every(
      (version) => typeof version === "string" && !/(?:file|link|workspace):|\.\.\//.test(version),
    ),
  ).toBe(true);
  expect(readFileSync(join(directory, "src/index.tsx"), "utf8")).toContain(
    "@fontsource-variable/newsreader",
  );
  expect(readFileSync(join(directory, "src/components/ui/Tex.tsx"), "utf8")).toContain(
    "katex/dist/katex.min.css",
  );
  expect(readFileSync(join(directory, "vite.config.ts"), "utf8")).not.toContain("Resources");
  expect(readFileSync(join(directory, "README.md"), "utf8")).toBe(
    readFileSync(join(ROOT, "templates/starter/README.md"), "utf8"),
  );

  const manifest = JSON.parse(
    readFileSync(join(directory, "src/notes/worked-example/note.json"), "utf8"),
  );
  expect(manifest.home).toBe(true);
  expect(manifest.title).toBe("A small worked example");
  const listed = Bun.spawnSync([process.execPath, "run", "note:list"], { cwd: directory });
  expect(listed.exitCode).toBe(0);
  expect(listed.stdout.toString()).toMatch(/worked-example\s+\/\s/);
  expect(listed.stdout.toString()).toContain("A small worked example");

  // A second author can scaffold from the exported templates without the
  // original checkout, installed packages, or a sibling course directory.
  const scaffolded = Bun.spawnSync(
    [process.execPath, "run", "note:new", "another-note", "Another note"],
    { cwd: directory },
  );
  expect(scaffolded.exitCode).toBe(0);
  expect(
    JSON.parse(readFileSync(join(directory, "src/notes/another-note/note.json"), "utf8")).title,
  ).toBe("Another note");
});

test("titles roundtrip as data, including source delimiters and replacement tokens", () => {
  const directory = join(sandbox(), "safe-title");
  const title =
    'A "quote" \\ path\n</title><script>throw new Error("injected")</script>{danger} $& __SLUG__ __DATE__ __TITLE__ \u2028';
  createStarter(options(directory, title));
  const manifest = JSON.parse(
    readFileSync(join(directory, "src/notes/worked-example/note.json"), "utf8"),
  );
  expect(manifest.title).toBe(title);
  expect(manifest.nav).toBe(title);
  for (const path of files(join(directory, "src/notes/worked-example"))) {
    if (!path.endsWith(".json")) expect(readFileSync(path, "utf8")).not.toContain(title);
  }
  expect(readFileSync(join(directory, "index.html"), "utf8")).not.toContain("<script>throw");
});

test("an existing empty directory is supported and relative destinations use the caller's cwd", () => {
  const cwd = sandbox();
  mkdirSync(join(cwd, "hello-note"));
  const result = cli(["hello-note"], cwd);
  expect(result.exitCode).toBe(0);
  const manifest = JSON.parse(
    readFileSync(join(cwd, "hello-note/src/notes/hello-note/note.json"), "utf8"),
  );
  expect(manifest.title).toBe("Hello Note");
  expect(readdirSync(cwd)).toEqual(["hello-note"]);
});

test("existing files and nonempty directories, including hidden files, survive unchanged", () => {
  const cwd = sandbox();
  const directory = join(cwd, "occupied");
  mkdirSync(directory);
  const keep = join(directory, ".keep");
  writeFileSync(keep, "keep these exact bytes\n");
  expect(() => createStarter(options(directory))).toThrow("not an empty directory");
  expect(readFileSync(keep, "utf8")).toBe("keep these exact bytes\n");
  expect(readdirSync(directory)).toEqual([".keep"]);
  const file = join(cwd, "existing-file");
  writeFileSync(file, "preserved");
  expect(() => createStarter(options(file))).toThrow("not an empty directory");
  expect(readFileSync(file, "utf8")).toBe("preserved");
  expect(readdirSync(cwd).sort()).toEqual(["existing-file", "occupied"]);
});

test("source overlap and traversal cannot turn an export into a source edit", () => {
  for (const directory of [
    ROOT,
    dirname(ROOT),
    "/",
    join(ROOT, "new-starter"),
    join(ROOT, "src/../new-starter"),
  ]) {
    expect(() => createStarter(options(directory))).toThrow("outside the framework");
  }
  const cwd = sandbox();
  const destination = join(cwd, "not-created");
  for (const slug of [
    "../escaped",
    "../../escaped",
    "a/b",
    "/absolute",
    "Uppercase",
    "a b",
    "",
    "a--b",
    "-bad",
  ]) {
    expect(() => createStarter({ ...options(destination), slug })).toThrow("Slug");
  }
  expect(() => createStarter(options(destination, " \n "))).toThrow("Title");
  expect(existsSync(destination)).toBe(false);
  expect(readdirSync(cwd)).toEqual([]);
});

test("symlink destinations and aliases into the source are rejected", () => {
  const cwd = sandbox();
  const actual = join(cwd, "actual");
  mkdirSync(actual);
  const link = join(cwd, "linked");
  symlinkSync(actual, link, "dir");
  expect(() => createStarter(options(link))).toThrow("symlink");
  expect(lstatSync(link).isSymbolicLink()).toBe(true);
  expect(readdirSync(actual)).toEqual([]);
  const broken = join(cwd, "broken");
  symlinkSync(join(cwd, "missing"), broken, "dir");
  expect(() => createStarter(options(broken))).toThrow("symlink");
  expect(() => createStarter(options(join(broken, "child")))).toThrow("symlink");
  const sourceAlias = join(cwd, "source");
  symlinkSync(ROOT, sourceAlias, "dir");
  expect(() => createStarter(options(join(sourceAlias, "not-created")))).toThrow(
    "outside the framework",
  );
});

test("CLI reports invalid options before creating a destination", () => {
  const cwd = sandbox();
  for (const args of [
    [],
    ["project", "--unknown", "x"],
    ["project", "--slug"],
    ["project", "--slug", "a", "--slug", "b"],
    ["project", "--title", ""],
  ]) {
    const result = cli(args, cwd);
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString().length).toBeGreaterThan(0);
    expect(readdirSync(cwd)).toEqual([]);
  }
});
