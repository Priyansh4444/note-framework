# Note Framework

Visual explanations on ink-black pages. SolidJS, TypeScript, local fonts, source links, a glossary, responsive math, and figures driven by one seekable scene clock.

## Start

Install [Bun](https://bun.sh), then:

```sh
bun install
bun run dev
```

Open the URL Vite prints. The starter contains one complete example; replace its topic, outline, sources and figures with your own.

## Tell an agent

> Use this repository's Note Framework. Read AGENTS.md and .agents/skills/note-explainers/SKILL.md. Make a compact, source-checked visual note about [topic] for [audience]. Explain terms on first use, preserve mathematical assumptions, verify desktop and phone, and give me a share link.

The agent does not need your original workspace or any sibling course folder.

## Author

```sh
bun run note:new my-topic "My topic"
bun run note:list
bun run lint
bun run check
bun run test
bun run note:build my-topic
```

Each note is a folder in `src/notes/`. Its `note.json` registers the route and publication title. Write `chapters.ts` first, then its sources and glossary. Use the worked example in `index.tsx` and `figures/` as the shape, not as content to keep.

## Try a small instrument

The example's Index slider selects any of its sixteen slots; changing it completes construction before moving the outline. Its original animation and source example remain in `figures/FillFigure.tsx` and `examples/selection.ts`.

For a smaller start, `src/recipes.tsx` contains a complete `IndexExperiment`: a controlled `Parameter` and an `Experiment`, with no CSS or animation setup. In a note, import `IndexExperiment` from `"../../recipes"` and render `<IndexExperiment />`. The optional [authoring tools](.agents/skills/note-explainers/references/authoring-tools.md#add-an-instrument) show the full TSX and animation ownership rule.

## Reuse a visual pattern

The kit exports `MorphFigure`, `LayerFigure`, and `InkFigure` with `brushStroke`. They accept your own geometry, handle interrupted motion and reduced motion, and stay dark. See `src/kit/patterns/recipes.tsx` for complete working components. Use `makeMorphShapes()` to try the original four-form morph immediately.

The focused skills are `.agents/skills/morph-figures/SKILL.md`, `.agents/skills/layer-figures/SKILL.md`, and `.agents/skills/ink-figures/SKILL.md`. Ask for the pattern that explains your topic; these are included locally with no external skill installation.

## Keep the code clean

`bun run lint` applies the framework’s Solid-compatible rules adapted from T3 Code. `bun run fmt` formats owned source; `bun run fmt:check` verifies it. Explain any necessary suppression. Source and adaptations are in `tools/oxlint/SOURCES.md`.

## Test components and their appearance

Run `bun run visual:install` once, then `bun run test:components:vitest`. These tests mount the real Solid kit in Chromium, exercise keyboard and selection behavior, and compare eight dark screenshot baselines at desktop and phone widths. They run separately from `bun run test` and its numerical tests.

Add component cases under `component-tests/` with the `.browser.tsx` suffix. The mount helper owns cleanup; shared teardown rejects browser errors and unhandled rejections. Use `bun run test:visual` for screenshots alone. After an intentional visual change, run `bun run test:visual:update`, inspect the changed PNGs, and rerun without updates. The included references use Linux Chromium at DPR 1; other platforms need their own reviewed baselines. Failure images stay in ignored `.vitest/`.

## Share

For your own Cloudflare account:

```sh
bunx wrangler login
bun run note:publish my-topic
```

The command builds only that note and returns a public URL. Course resources and unrelated notes are excluded by default. Your first publication creates `wrangler.my-topic.jsonc`; give the Worker a unique name if yours is already used in your Cloudflare account.

For the public beta at https://note-framework-public.pronsh.workers.dev, sign in with a passkey and approve your agent once. Readers only need the link:

```sh
bun run share login --server https://note-framework-public.pronsh.workers.dev
bun run note:share my-topic
```

Open the approval URL printed by the login command and check its fingerprint. Create an account with a passkey or sign in, then select Connect agent. Add a backup passkey under Your notes; there is no email recovery. Passkeys belong to that hostname. Credentials and the retry journal stay in your private user configuration, outside the project. Repeat the same sharing command after interruption. It exports a self-contained HTML note, verifies the downloaded bytes and prints a stable link; future uploads create retained versions. Use `bun run share list` to list your own links or `bun run share upload ./note.html` for existing self-contained HTML. Old invitation files remain supported with `share login --credential-file`.

The hosted sandbox blocks external network requests, storage, forms, popups and parent access. Bundle assets inline; relative attachments are not included. The 5 MiB limit applies to original UTF-8 bytes. Anyone with a link can download the original HTML and earlier versions; the initial service has no deletion command. See the service's `/llms.txt` for current agent instructions.

## Make it yours

- `src/post/theme.css`: ink-black surfaces and semantic accent/diagram colors.
- `src/kit/`: reading layout, glossary, source links, checks and math.
- `src/post/scene/`: play, pause, restart and seekable animation.
- `templates/note/`: the next note you create.
- `.agents/skills/note-explainers/`: portable authoring and verification guidance.
- `.agents/skills/explorable-explanations/`: optional mechanism and linked-view design guidance, with Making Software and Maxime Heckel case studies.

The generated project includes no analytics, backend requirement, remote font dependency, course archive or deployment credentials. Dependencies keep their own licenses; choose an appropriate license for the content you add and any redistributed changes.

## Inspect the finished page

```sh
bun run visual:install
bun run note:audit my-topic
```

The checker builds the actual single-file note and measures it inside the hosted service's opaque sandbox at desktop, 390px and 320px. It reports alignment, outer-edge spacing, SVG label size/collisions/clipping, and declared visibility obligations with screenshots. Exit 1 means a measured failure; exit 2 means incomplete verification. Review both. Finite samples do not establish mathematical correctness or visibility in every frame.

For the SVG viewer, Pierre code/diff blocks, layout declarations and their limits, read the optional [authoring tools](.agents/skills/note-explainers/references/authoring-tools.md).
