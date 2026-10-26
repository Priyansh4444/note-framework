import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

function lint(source: string) {
  const directory = mkdtempSync(join(tmpdir(), "note-lint-"));
  try {
    const file = join(directory, "fixture.tsx");
    writeFileSync(file, source);
    const result = Bun.spawnSync(
      [
        resolve("node_modules/.bin/oxlint"),
        "--config",
        resolve(".oxlintrc.json"),
        "--format",
        "json",
        file,
      ],
      { cwd: resolve(".") },
    );
    if (result.stderr.length) throw new Error(result.stderr.toString());
    return JSON.parse(result.stdout.toString()).diagnostics as { code: string }[];
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
test("borrowed T3 rules reject native tooltips, redundant comments and unexplained suppressions", () => {
  expect(
    lint('export const View=()=> <button title="Wait">Run</button>;').some(
      (d) => d.code === "t3code(no-native-title-tooltip)",
    ),
  ).toBe(true);
  expect(
    lint("// -------- section --------\nexport const value=1;").some(
      (d) => d.code === "t3code(no-low-value-comments)",
    ),
  ).toBe(true);
  expect(
    lint("// @ts-expect-error\nexport const value:string=1;").some(
      (d) => d.code === "t3code(require-suppression-reason)",
    ),
  ).toBe(true);
});
test("accessible names and explained compiler assertions remain valid", () => {
  expect(lint('export const View=()=> <iframe title="Diagram" />;')).toEqual([]);
  expect(
    lint(
      "// @ts-expect-error -- This fixture proves the public string contract.\nexport const value:string=1;",
    ),
  ).toEqual([]);
});
