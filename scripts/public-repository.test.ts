import { afterAll, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { exportPublicRepository, PUBLIC_REPOSITORY_FILES } from "./public-repository";

const temporary = mkdtempSync(join(tmpdir(), "framework-public-test-"));
afterAll(() => rmSync(temporary, { recursive: true, force: true }));

test("exports framework sources and exact binary baselines without private material or real bindings", () => {
  const target = exportPublicRepository(join(temporary, "public"));
  for (const file of PUBLIC_REPOSITORY_FILES) expect(existsSync(join(target, file))).toBe(true);
  for (const file of [
    "PREVIEW.md",
    "docs/review.md",
    "docs/validation.md",
    ".agents/skills/note-explainers/references/legacy-authoring.md",
    "src/notes/cs169",
    "src/notes/filesystems",
    "scripts/cs169",
    "scripts/cs169-resources.ts",
    "wrangler.cs169.jsonc",
    "wrangler.filesystems.jsonc",
    "wrangler.toml",
    ".git",
    ".env",
    ".dev.vars",
    "node_modules",
    "releases",
    "dist",
    "course",
    "exams",
    "lectures",
    "homework",
  ]) {
    expect(existsSync(join(target, file))).toBe(false);
  }
  for (const file of PUBLIC_REPOSITORY_FILES.filter((path) => path.endsWith(".png"))) {
    expect(readFileSync(join(target, file))).toEqual(
      readFileSync(resolve(import.meta.dirname, "..", file)),
    );
  }
  for (const file of ["wrangler.public.jsonc", "wrangler.sharing.jsonc"]) {
    const config = JSON.parse(readFileSync(join(target, file), "utf8"));
    expect(config.d1_databases[0].database_id).toBe("00000000-0000-0000-0000-000000000000");
  }
  expect(readFileSync(join(target, "LICENSE"), "utf8")).toContain(
    "2026 Note Framework contributors",
  );
  const vite = readFileSync(join(target, "vite.config.ts"), "utf8");
  expect(vite).not.toContain("cs169");
  expect(vite).toContain(
    'const frameworkPreview = !single || process.env.VITE_FRAMEWORK_PREVIEW === "1";',
  );
  const pkg = JSON.parse(readFileSync(join(target, "package.json"), "utf8"));
  expect(pkg.scripts.build).toBe("bun run framework:release && vite build");
  expect(Object.keys(pkg.scripts).some((key) => /cs169|filesystems/.test(key))).toBe(false);
  expect(readFileSync(join(target, "sharing/DESIGN.md"), "utf8")).toContain(
    "checked-in database ID is a placeholder",
  );
  expect(readFileSync(join(target, "AGENTS.md"), "utf8")).not.toMatch(/\/home\/[^/]+\//);
  const ci = readFileSync(join(target, ".github/workflows/framework.yml"), "utf8");
  expect(ci).not.toContain("framework-redesign/");
  expect(ci).not.toContain("working-directory:");
  expect(ci).toContain("include-hidden-files: true");
  expect(ci).toContain("if: failure() && steps.page_tests.outcome == 'failure'");
  expect(ci).toContain("visual/baselines/ubuntu-24/");
});

test("accepts an empty external directory and preserves independent starter export", () => {
  const target = join(temporary, "empty");
  mkdirSync(target);
  exportPublicRepository(target);
  const process = Bun.spawnSync(
    [
      "bun",
      "-e",
      'import { createStarter } from "./scripts/starter.ts"; createStarter({directory: process.argv[1], slug: "first-note", title: "First note"});',
      join(temporary, "starter"),
    ],
    { cwd: target },
  );
  expect(process.exitCode).toBe(0);
  expect(existsSync(join(temporary, "starter/src/kit/CodeBlock.tsx"))).toBe(true);
  expect(existsSync(join(temporary, "starter/src/notes/framework"))).toBe(false);
});

test("rejects occupied destinations, source overlap and symlink paths without touching files", () => {
  const occupied = join(temporary, "occupied");
  mkdirSync(occupied);
  writeFileSync(join(occupied, "keep"), "untouched");
  expect(() => exportPublicRepository(occupied)).toThrow("not an empty directory");
  expect(readFileSync(join(occupied, "keep"), "utf8")).toBe("untouched");
  expect(() => exportPublicRepository(resolve(import.meta.dirname, "../public-export"))).toThrow(
    "outside the source repository",
  );
  expect(() => exportPublicRepository(resolve(import.meta.dirname, ".."))).toThrow(
    "outside the source repository",
  );
  const link = join(temporary, "link");
  symlinkSync(occupied, link);
  expect(() => exportPublicRepository(link)).toThrow("symlink");
  expect(() => exportPublicRepository(join(link, "child"))).toThrow("symlink");
  const dangling = join(temporary, "dangling");
  symlinkSync(join(temporary, "missing"), dangling);
  expect(() => exportPublicRepository(dangling)).toThrow("symlink");
  expect(readdirSync(occupied)).toEqual(["keep"]);
});
