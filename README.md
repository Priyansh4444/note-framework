# Note Framework

Short visual explanations: a book-serif page, figures the reader can operate, terms explained in place, and a link you can share.

**Live site and examples:** https://note-framework-public.pronsh.workers.dev

## Make a note with an agent

Give your coding agent this instruction:

> Use https://note-framework-public.pronsh.workers.dev/llms.txt to create a compact, source-checked visual note about [topic] for [audience]. Explain terms, verify the diagrams, and give me the published link.

Create an account with a passkey, then approve your agent's login link and check that its fingerprint matches. Anyone with a note's link can read it. Add a backup passkey, because there is no email recovery. See [public beta setup](docs/public-beta.md).

## Make a note yourself

```sh
bun run framework:new ../my-note --slug my-note --title "My note"
cd ../my-note
bun install
bun run dev
```

The new project contains the kit, fonts, a working example, a sharing client and its own agent instructions. It contains none of this repository's notes, infrastructure bindings or credentials. Read its `AGENTS.md` before authoring.

Publish it to the hosted service, or to your own Cloudflare account:

```sh
bun run share login --server https://note-framework-public.pronsh.workers.dev
bun run note:share my-note     # hosted: stable link, immutable versions

bunx wrangler login
bun run note:publish my-note   # static hosting on your own account
```

Details, limits and self-hosting are in [sharing and self-hosting](docs/sharing.md).

## Work on the framework

```sh
bun install
bun run dev                     # framework home
bun run dev:framework           # the same site with every example note

bun run check:all               # lint, format, dead code, types, unit tests
bun run test:components         # Playwright against real pages
bun run test:components:vitest  # Vitest browser component tests
bun run note:audit my-note      # measure one finished note inside the hosted sandbox
```

Run `bun run visual:install` once to install Chromium. An audit exits 1 on a measured failure and 2 on incomplete verification. Its samples are finite, so it does not prove mathematical correctness or visibility in every frame.

| Path | Holds |
| --- | --- |
| `src/kit/` | Everything a note imports: page, figures, controls, clock, math |
| `src/notes/` | The framework home and its example notes |
| `sharing/` | The publishing Workers and their storage |
| `templates/starter/` | What `framework:new` exports |
| `studies/` | Standalone motion experiments |
| `visual/`, `component-tests/` | Browser tests and image baselines |
| `.agents/skills/` | Authoring guidance that ships with the starter |

See [component testing](docs/component-testing.md) and [`AGENTS.md`](AGENTS.md). Borrowed lint rules keep their upstream MIT license; see `tools/oxlint/SOURCES.md`.
