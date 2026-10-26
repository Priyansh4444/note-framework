import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
async function run(args: string[]) {
  const child = Bun.spawn(args, {
    cwd: root,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  if ((await child.exited) !== 0) throw new Error(`Failed: ${args.join(" ")}`);
}
await run(["bun", "run", "test"]);
await run(["bun", "run", "check"]);
await run(["bun", "run", "framework:release"]);
await run(["bun", "run", "note:build", "framework"]);
await run([
  "bunx",
  "wrangler",
  "d1",
  "migrations",
  "apply",
  "note-framework-share",
  "--remote",
  "--config",
  "wrangler.sharing.jsonc",
]);
await run(["bunx", "wrangler", "deploy", "--config", "wrangler.sharing.jsonc"]);
