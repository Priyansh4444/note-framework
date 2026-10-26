# Note Framework

Compact visual explanations with ink-black pages, serif typography, local fonts, a glossary, source links and figures driven by one seekable clock.

The public beta, examples, starter and uploader live at **https://note-framework-public.pronsh.workers.dev**. Give an agent this instruction:

> Use https://note-framework-public.pronsh.workers.dev/llms.txt to create a compact, source-checked visual note about [topic] for [audience]. Explain terms, verify the diagrams, and give me the published link.

Create an account with a passkey, then approve your agent’s login link and matching fingerprint. Anyone with a note link can read it. Add a backup passkey; there is no email recovery. See [public beta setup](docs/public-beta.md). The original invitation service remains separate.

The public agent bootstrap stays under 300 words. The starter's AGENTS is under 220 words; its figure/math skill is loaded only when needed. Detailed references, human setup docs and backend internals stay off that default reading path. Automated word budgets keep future additions from expanding the required context.

## Export a clean project

```sh
bun run framework:new ../my-note --slug my-note --title "My note"
```

The exporter copies an explicit allowlist: the kit, fonts/dependencies, working example, templates, sharing client and local agent instructions. It excludes existing notes, course archives, infrastructure bindings and credentials. It never installs or deploys automatically. In the new project:

```sh
bun install
bun run dev
bun run check
bun run test
bun run note:build my-note
```

Read `AGENTS.md` and `.agents/skills/note-explainers/SKILL.md` before authoring. See `templates/starter/` for the portable guide. This repository contains the framework, public examples and studies. Existing course notes and archives are excluded.

## Develop and review

```sh
bun run check:all
bun run test:components
bun run test:components:vitest
bun run build:framework-preview
```

`check:all` runs lint, formatting, unused-file/dependency checks, TypeScript and tests. The lint rules are adapted from T3 Code for SolidJS; see `tools/oxlint/SOURCES.md`. Borrowed rules retain their upstream MIT license.

The example’s Morph, Layers and Ink tabs use one editable curve and display their actual source component. Reusable recipes and focused skills ship in the starter. Use `bun run dev:framework` to review the local application; the shared hosted service is not changed by local builds.

## Share

```sh
bun run share login --server https://note-framework-public.pronsh.workers.dev
bun run note:share my-note
```

Open the login command’s approval link, sign in, check its fingerprint, and connect the agent. Its secret is generated locally and stays outside the project. Legacy invitation files remain supported with `share login --credential-file`. User profiles and the durable retry journal are stored under `~/.config/note-framework/share/`. `NOTE_FRAMEWORK_CONFIG_DIR` selects another private location for tests. Use `share list` to list your own publications, `share upload ./note.html` for an existing self-contained file, and `--new` to start a separate publication. Updates preserve the stable link and create immutable versions. The CLI checks the exact downloaded hash before reporting success. Repeat the same command after interruption; inspect a stale-version conflict rather than rebasing it automatically.

One valid UTF-8 HTML file is accepted, up to 5,242,880 original bytes. `note:html <slug>` bundles a router-free single-file note into `dist-<slug>-single/index.html`. Relative course attachments and external dependencies do not become portable automatically. The hosted sandbox blocks network access, storage, forms, popups, parent access and top navigation. All versions and raw HTML remain accessible to anyone with the opaque link; this initial service has no deletion command.

Independent static hosting is still available:

```sh
bunx wrangler login
bun run note:publish my-note
```

## Run the original invitation service

For the public passkey service, use [its separate setup guide](docs/public-beta.md). The following setup describes the older invitation service.

The service uses one Cloudflare Worker and one dedicated D1 database. Its contract is in `sharing/DESIGN.md`. No R2, KV or Durable Object is needed. The checked-in database ID is a placeholder: create your own database and update `wrangler.sharing.jsonc` before self-hosting. Set a unique Worker name and your canonical HTTPS `PUBLIC_ORIGIN`; asset, viewer and content routes must stay on that origin.

```sh
bun install
bunx wrangler login
bunx wrangler d1 create note-framework-share
# Copy the returned database ID into your own wrangler.sharing.jsonc.
bun run share:deploy
bun scripts/sharing-bootstrap.ts
```

`share:deploy` runs tests, typecheck, packages the public starter, builds the service, applies migrations to the dedicated database, and deploys with the service config. Do not use the static `note:publish framework` command: it would omit the API. Bootstrap creates a private owner credential locally and installs only its domain-separated hash as a Worker secret through stdin. It never prints the token and reuses the saved owner profile on retries. For another deployment, pass its HTTPS origin as the bootstrap argument and update the config first.

Invite a writer by creating a private handoff file:

```sh
mkdir -m 700 /private/path/invitations
bun run share key create --name "Writer" --out /private/path/invitations/writer.json
```

Deliver that file privately. Do not commit it or include it in a note, URL or chat prompt. The file is saved before registration, so `share key register /private/path/invitations/writer.json` can retry the same registration after a lost response. Revoke permanently with `share key revoke --publisher <publisher-id> --key <key-id>`. A registration retry never reactivates a revoked key. New publishers have a 128 MiB total-version quota by default; `--quota <bytes>` sets an initial quota. The owner credential administers invitations; it is distinct from a publishing credential.

To rotate a publisher key while preserving its identity, pass `--publisher <existing-id>` and the same original `--name` label. Publisher labels and initial quotas are immutable through this registration endpoint.

Public readers have no account or listing. The trusted viewer embeds uploaded HTML in an opaque sandbox, enforced again by the content response CSP. API responses are not cached. Upload metadata, ordered chunks, immutable version, current head, quota usage and idempotency receipt commit in one D1 batch. Ownership, active key, expected version and quota are checked inside the transaction; stale writers receive a conflict, and retries preserve their original result.

For a local runtime test, apply migrations with `--local --config wrangler.sharing.jsonc`, then run Wrangler dev with a loopback `PUBLIC_ORIGIN` override and a private local owner hash. The client requires `--local` on every HTTP loopback command. Never use production credentials in a local test. Passing boundary tests demonstrates correctness for those fixtures, not a free-tier or traffic-capacity guarantee.

## Inspect the finished page

```sh
bun run visual:install
bun run note:audit my-topic
```

The checker builds the actual single-file note and measures it inside the hosted service's opaque sandbox at desktop, 390px and 320px. It reports alignment, outer-edge spacing, SVG label size/collisions/clipping, and declared visibility obligations with screenshots. Exit 1 means a measured failure; exit 2 means incomplete verification. Review both. Finite samples do not establish mathematical correctness or visibility in every frame.

For the SVG viewer, Pierre code/diff blocks, layout declarations and their limits, read the optional [authoring tools](.agents/skills/note-explainers/references/authoring-tools.md).

## Standalone source repository

`bun run dev` opens the framework home. `bun run build` packages its portable starter and builds the isolated framework site. No course checkout is required. See [the export boundary and self-hosting notes](docs/public-repository.md).
