# Note Framework

Visual explanations on ink-black pages: SolidJS, TypeScript, local fonts, source links, a glossary, responsive math, and figures driven by one seekable clock.

## Start

Install [Bun](https://bun.sh), then:

```sh
bun install
bun run dev
```

The starter holds one complete example. Replace its topic, sources and figures.

## Tell an agent

> Use this repository's Note Framework. Read AGENTS.md and .agents/skills/note-explainers/SKILL.md. Make a compact, source-checked visual note about [topic] for [audience]. Explain terms on first use, preserve mathematical assumptions, verify desktop and phone, and give me a share link.

## Author

```sh
bun run note:new my-topic "My topic"
bun run lint && bun run check && bun run test
bun run note:build my-topic
```

Each note is a folder in `src/notes/`. `note.json` registers its route and title. Write `chapters.ts` first, then the sources and glossary; use `index.tsx` and `figures/` as the shape, not as content to keep.

For a smaller start, `src/recipes.tsx` has a complete `IndexExperiment` with no CSS or animation setup. [Authoring tools](.agents/skills/note-explainers/references/authoring-tools.md#add-an-instrument) explain it.

## Reuse a visual pattern

`MorphFigure`, `LayerFigure` and `InkFigure` accept your geometry and handle interruption and reduced motion. `src/kit/patterns/recipes.tsx` has working components, and each has a skill: `morph-figures`, `layer-figures`, `ink-figures`.

## Share

On your own Cloudflare account, `note:publish` builds only that note and returns a public URL. Your first publication creates `wrangler.my-topic.jsonc`; give the Worker a unique name if yours is taken.

```sh
bunx wrangler login
bun run note:publish my-topic
```

On the public beta, sign in with a passkey and approve your agent once:

```sh
bun run share login --server https://note-framework-public.pronsh.workers.dev
bun run note:share my-topic
```

Open the printed approval URL and check its fingerprint. Add a backup passkey under Your notes, because there is no email recovery.

The hosted sandbox blocks network, storage, forms, popups and parent access, so bundle assets inline; relative attachments are not included. The limit is 5 MiB of UTF-8. Anyone with a link can read and download every retained version, and nothing can be deleted, so keep private material out.

## Check it

```sh
bun run visual:install          # once
bun run note:audit my-topic     # single-file note, in the hosted sandbox, at desktop, 390px and 320px
bun run test:components:vitest  # the kit in Chromium, with screenshot baselines
```

The audit reports alignment, edge spacing, SVG label size, collisions and clipping, and declared visibility. Exit 1 is a measured failure; exit 2 is incomplete verification. Finite samples prove neither mathematical correctness nor visibility in every frame.

Add component tests as `component-tests/*.browser.tsx`. After an intentional visual change, run `bun run test:visual:update`, inspect the PNGs and rerun. References are Linux Chromium at DPR 1; other platforms need their own.

## Make it yours

- `src/kit/theme.css`: surfaces and semantic colours.
- `src/kit/`: reading layout, glossary, sources, checks, math and the scene clock.
- `templates/note/`: the next note you create.
- `.agents/skills/`: authoring guidance, which ships with the project.

The project includes no analytics, backend requirement, remote fonts or credentials. Dependencies keep their own licenses; choose a license for your content.
