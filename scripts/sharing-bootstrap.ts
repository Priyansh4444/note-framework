import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { credentialHash, normalizeServer, saveOwnerProfile } from "./share.ts";

const root = resolve(import.meta.dirname, "..");
const config = JSON.parse(readFileSync(join(root, "wrangler.sharing.jsonc"), "utf8"));
const server = normalizeServer(process.argv[2] ?? config.vars.PUBLIC_ORIGIN);
if (server !== config.vars.PUBLIC_ORIGIN)
  throw new Error(
    "Update the service config PUBLIC_ORIGIN before bootstrapping another deployment.",
  );
const profilePath = join(
  process.env.NOTE_FRAMEWORK_CONFIG_DIR ?? join(homedir(), ".config/note-framework/share"),
  "profiles.json",
);
// Read only this origin's existing token; saveOwnerProfile validates private
// ownership/modes and refuses symlink paths before anything leaves the machine.
const previous = existsSync(profilePath)
  ? JSON.parse(readFileSync(profilePath, "utf8")).profiles?.[server]?.owner
  : undefined;
const token = previous ?? `nf_owner_${randomBytes(32).toString("base64url")}`;
saveOwnerProfile(server, token);
const child = Bun.spawn(
  ["bunx", "wrangler", "secret", "put", "OWNER_TOKEN_SHA256", "--config", "wrangler.sharing.jsonc"],
  {
    cwd: root,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  },
);
child.stdin.write(credentialHash(token) + "\n");
child.stdin.end();
// Do not pass through provider output on a secret operation. Only its exit
// status is needed, so even an unexpected echo cannot expose a credential.
const drains = Promise.all([
  new Response(child.stdout).arrayBuffer(),
  new Response(child.stderr).arrayBuffer(),
]);
const status = await child.exited;
await drains;
if (status !== 0)
  throw new Error(
    "Could not install the owner verifier. The private profile is saved; retry this bootstrap after checking Wrangler authentication.",
  );
console.log(
  `Owner profile ${previous ? "reused" : "created"}; verifier installed for ${server}.\nCreate a publisher with bun run share key create --name Owner --out /private/path/owner-publisher.json.`,
);
