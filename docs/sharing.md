# Sharing and self-hosting

Most authors only need the hosted service: see [public beta setup](public-beta.md).

## Publish from the command line

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

## Self-host

Both Wrangler configurations check in `00000000-0000-0000-0000-000000000000` as a placeholder database ID. Before deploying your own copy, create a D1 database, set its ID, choose a Worker name and a canonical HTTPS `PUBLIC_ORIGIN`, and update the deployment target. Local migrations and tests use local storage. The service contract is in [`sharing/DESIGN.md`](../sharing/DESIGN.md).

## The invitation service

The public passkey service is [documented separately](public-beta.md). This older service issues publishing keys by invitation.

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
