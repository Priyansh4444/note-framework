# Standalone public source repository

From the private workspace, run:

```sh
bun scripts/public-repository.ts /absolute/path/to/new-empty-framework
```

The destination must be an empty directory outside the source repository. Missing directories are created. Source overlap, occupied directories, symlink destinations and symlink ancestors are rejected before writing. The exporter stages all files beside the destination and renames the completed directory into place. It neither initializes Git nor installs dependencies, creates a remote, pushes, or deploys.

`scripts/public-repository.ts` enumerates the reviewed source paths. It reads those working-tree files only, so reviewed fixes are included before commit. It does not crawl the filesystem, query Git history, or read credentials. New framework files require an explicit manifest update and review. The public export can itself export another independent copy without the private repository.

The distribution includes the shared kit, home and docs, Bézier demo, shared-service explainer, Inside SVG, spring workshop, dark studies, source attribution and vendor licenses, authoring skills, unit/page/component tests and exact binary PNG baselines, portable starter generator, sharing client, Worker/authentication/UI and migrations. Its CI runs at repository root. Original framework code is MIT licensed; third-party license and source notices remain alongside their code.

It excludes the original CS169 and filesystems authored notes (including the seven TinyFS engine tests), their course synchronization/resource plugins and Wrangler configs, legacy course-specific authoring guidance, internal handoff reports, course archives and downloads, private history, credentials, dependencies and generated builds/releases. The note registry discovers only the included examples. The existing portable starter retains its narrower allowlist and does not acquire these showcase notes or service infrastructure.

The exported default `dev` route is the framework home. `build` packages the portable starter, then builds that isolated site. Per-note builds still use the note registry. No sibling course checkout is required:

```sh
bun install --frozen-lockfile
bun run dev
bun run test
bun run check
bun run lint
bun run deadcode
bun run build
bun run test:components:vitest
bun run test:components
```

## Hosted use and self-hosting

The hosted public service remains [Note Framework](https://note-framework-public.pronsh.workers.dev). Authors can use its passkey account and agent login without operating Cloudflare infrastructure.

Both public and legacy invitation Wrangler configurations contain `00000000-0000-0000-0000-000000000000` as a placeholder database ID. Before self-hosting, create your own D1 database, set its returned ID, choose a Worker name and canonical HTTPS `PUBLIC_ORIGIN`, and update the explicit deployment target checks. Keep the database name consistent with migration/deploy commands and CI. The checked-in hosted URLs identify the public service; they do not grant access or configure your deployment. See [public beta setup](public-beta.md) for local migration, authentication and end-to-end browser checks. Do not run a remote deploy command until your own configuration is complete.

Local Wrangler migrations and tests use local storage. The exporter never reads `.env`, `.dev.vars`, Cloudflare credentials or private author profiles, and never copies `.git`.
