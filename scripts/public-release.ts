import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const configuration = JSON.parse(readFileSync(resolve(root, "wrangler.public.jsonc"), "utf8"));
const origin = configuration.vars.PUBLIC_ORIGIN;
if (
  typeof origin !== "string" ||
  new URL(origin).origin !== origin ||
  !origin.startsWith("https://")
)
  throw new Error("Set one canonical HTTPS PUBLIC_ORIGIN in wrangler.public.jsonc.");
const env = {
  ...process.env,
  FRAMEWORK_ORIGIN: origin,
  VITE_FRAMEWORK_PUBLIC: "1",
  VITE_FRAMEWORK_PREVIEW: "1",
};
for (const command of [
  ["bun", "run", "framework:release"],
  ["bunx", "vite", "build", "--outDir", "dist-framework-public"],
]) {
  const child = Bun.spawn(command, {
    cwd: root,
    env,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  if ((await child.exited) !== 0) throw new Error(`Public build failed: ${command.join(" ")}`);
}
