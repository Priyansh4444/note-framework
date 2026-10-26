import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const config = "wrangler.public.jsonc";
const configuration = JSON.parse(readFileSync(resolve(root, config), "utf8"));
if (
  configuration.name !== "note-framework-public" ||
  configuration.d1_databases[0].database_name !== "note-framework-public-beta"
)
  throw new Error("The public deploy command must target the separate public service.");
const commands = [
  ["bun", "run", "check:all"],
  ["bun", "run", "test:components:vitest"],
  ["bun", "run", "public:build"],
  [
    "bunx",
    "wrangler",
    "d1",
    "migrations",
    "apply",
    "note-framework-public-beta",
    "--remote",
    "--config",
    config,
  ],
  [
    "bunx",
    "wrangler",
    "d1",
    "execute",
    "note-framework-public-beta",
    "--remote",
    "--config",
    config,
    "--command",
    "UPDATE public_settings SET enabled=1 WHERE id=1",
  ],
  ["bunx", "wrangler", "deploy", "--config", config],
];
for (const command of commands) {
  const child = Bun.spawn(command, {
    cwd: root,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  if ((await child.exited) !== 0) throw new Error(`Public deploy stopped: ${command.join(" ")}`);
}
