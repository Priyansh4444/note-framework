import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createStarter } from "./starter.ts";

const root = resolve(import.meta.dirname, "..");
const origin = new URL(
  process.env.FRAMEWORK_ORIGIN ?? "https://note-framework-share.pronsh.workers.dev",
).origin;
const releases = join(root, "releases");
const digest = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
const temporary = mkdtempSync(join(tmpdir(), "note-framework-release-"));
try {
  const project = createStarter({
    directory: join(temporary, "starter"),
    slug: "first-note",
    title: "One idea, made visible",
  });
  mkdirSync(releases, { recursive: true });
  const archive = join(temporary, "starter.zip");
  const zip = Bun.spawn(["zip", "-qr", archive, "."], {
    cwd: project,
    stdout: "inherit",
    stderr: "inherit",
  });
  if ((await zip.exited) !== 0) throw new Error("Could not package the starter.");
  const starterHash = digest(archive);
  const starterName = `starter-${starterHash.slice(0, 12)}.zip`;
  copyFileSync(archive, join(releases, starterName));
  copyFileSync(archive, join(releases, "starter.zip"));
  const client = join(root, "scripts/share.ts");
  const clientHash = digest(client);
  const clientName = `cli-${clientHash.slice(0, 12)}.ts`;
  copyFileSync(client, join(releases, clientName));
  copyFileSync(client, join(releases, "cli.ts"));
  copyFileSync(join(root, "templates/starter/SKILL.md"), join(releases, "skill.md"));
  writeFileSync(
    join(releases, "starter.sha256"),
    `${starterHash}  starter.zip\n${clientHash}  cli.ts\n`,
  );
  writeFileSync(
    join(releases, "llms.txt"),
    `# Note Framework — start here

Build a compact visual note for the user's topic/audience. SolidJS, TypeScript, ink-black serif pages, local fonts, one seekable figure clock.

1. Download ${origin}/downloads/${starterName}
   SHA-256: ${starterHash}
2. Verify the hash; unzip into a NEW empty folder. Read AGENTS.md, then only the example/files needed. Do not preload README, detailed references, service internals or unrelated notes. Figure/math rules are a small local skill, linked from AGENTS.md.
3. Run bun install, bun run dev. Replace first-note or use bun run note:new my-topic "My topic". Explain terms visibly; preserve source coverage/assumptions; keep detailed reasoning expandable.
4. Run bun run test, bun run check, bun run note:build my-topic, bun run note:audit my-topic (after bun run visual:install). Review diagnostics and browser-check desktop/390/320px, actual scaled labels and intermediate motion.
5. Run bun run share login --server ${origin}. Ask the user to open its approval URL, sign in with a passkey and approve the matching fingerprint. Never approve on their behalf. Then bun run note:share my-topic. Or use bun run note:publish my-topic with the user's Cloudflare account. Verify the public page; never invent a link.

Optional local pattern skills: morph-figures, layer-figures, ink-figures. Read only the matching one; working recipes are in src/kit/patterns/recipes.tsx.

Hosted login/setup/limits only if needed: ${origin}/docs
Standalone Bun client only for existing HTML: ${origin}/downloads/${clientName}
Client SHA-256: ${clientHash}

Keep credentials outside the project and out of chat/URLs/arguments. Hosted uploads accept one self-contained UTF-8 HTML file ≤5 MiB, retain versions, and expose originals to anyone with the link. Network/storage/forms/popups are blocked. Retry interrupted uploads unchanged; never silently rebase conflicts.
`,
  );
  writeFileSync(
    join(releases, "release.json"),
    JSON.stringify({ origin, starterName, starterHash, clientName, clientHash }, null, 2) + "\n",
  );
  if (readFileSync(join(releases, "llms.txt"), "utf8").split(/\s+/).length > 300)
    throw new Error("Keep the agent bootstrap under 300 words; link optional detail instead.");
  console.log(`Starter: ${starterName}\nClient: ${clientName}\nPublic resources are ready.`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
