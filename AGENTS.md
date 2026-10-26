# Note framework conventions

Explainer notes in the style of anoma.ly and kitlangton.com: a book-serif blog post whose figures move only when asked, plus a glossary, sources, and a map so no reader gets lost.

## Quick start

```sh
bun run note:new <slug> "Title"   # scaffold src/notes/<slug>/ (route /notes/<slug>)
bun run dev                       # framework home at http://localhost:3000
bun run note:publish <slug>       # build that note alone, check it, deploy to Cloudflare, wait until live
bun run framework:new ../my-note --slug my-note --title "My note"  # export an independent starter
bun run note:share <slug>         # single-file export + versioned hosted upload (invited profile)
```

Before authoring, animating, or typesetting a note, read `.agents/skills/note-explainers/SKILL.md`. Then list the skills your harness offers and use the ones that fit (`dataviz` for charts, `arena` for competing visual ideas, `deep-research` for sourcing, `run` or a browser to verify). Record reusable lessons in that local skill and its linked reader contract, never in global skills. For mechanism-focused interactive explanations, use `.agents/skills/explorable-explanations/SKILL.md`; source case studies are optional. For UI polish, read the installed `emil-design-eng` skill (currently `<local-skill-root>/emil-design-eng/SKILL.md`). Verify actual menu and page-transition motion separately from the figures; animated diagrams alone do not establish animated UI.

## Rules

- Authored notes belong in `src/notes/<topic>/`, registered by their `note.json`; portable study guides belong in `notes/<topic>/`. New notes are built with the kit in `src/kit`.
- Reuse the existing typography, `SceneFrame`, `createScene`, `tip`, and spring variables. Preserve other notes that are still in progress; never edit a note another agent is working on.
- Render mathematical notation with `src/components/ui/Tex.tsx`. Keep KaTeX fonts local and HTML + MathML output enabled. Invalid authored TeX should fail verification.
- Keep SVG nodes persistent. Derive numerical geometry and playback state from the scene clock; do not replace SVG markup or run a separate animation timer. Pause before seeking. Discrete decisions must not animate through misleading mathematical states.
- Scope note-specific CSS to its page class. Check inherited rules (especially wide figures and `pre`) at desktop and phone widths.
- Publish independent notes with `bun run note:publish <slug>` or the explicitly configured hosted client `bun run note:share <slug>`; never deploy the default `dist`. The hosted sharing service has its own API and database: use `bun run share:deploy`, never static `note:publish framework`.

- Primary code follows the measured GitHub Dark palette; patch inspection uses Pierre’s Vesper theme with inverse selection.
- Use the shared terminal/Fastfetch palette in `src/post/theme.css`. Diagram roles use `--diagram-*` tokens. Validate actual scaled label sizes and staged construction/invariant motion, as described in the reader contract.
- The reusable distribution is an explicit allowlisted export in `scripts/starter.ts`, with portable guidance in `templates/starter/`. New dependencies or kit files need a fresh independent export/install/build check. Do not ship existing notes, course archives, user paths or credentials in the starter ZIP.
- Minimize agent context through progressive disclosure: public `/llms.txt` ≤300 words, starter AGENTS ≤220 words, figure/math skill ≤380 words. Link deeper references instead of requiring a full documentation read. Keep course history and service internals out of the authoring path; context-budget checks enforce these entry sizes.
- Hosted publication accepts one self-contained HTML file; keep the router-free `src/single.tsx` entry and opaque sandbox. Never add `allow-same-origin`, relax network isolation or embed uploaded HTML in trusted DOM to repair portability. Record limitations honestly. Preserve private origin-scoped credentials, stable publication IDs, immutable versions and pending-operation retries. Review `sharing/DESIGN.md` before changing that contract.

- Before sharing a new or changed visual note, run `bun run note:audit <slug>` (install Chromium with `bun run visual:install`). Fix measured failures and inspect unsupported states; keep screenshots and mathematical checks. The checker samples gates, beat boundaries/midpoints, paused states, open disclosures, outline and expanded Fit when present. It is not a proof of universal visibility.
