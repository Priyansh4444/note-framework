# Note framework conventions

Explainer notes: a book-serif post whose figures move only when asked, with a glossary and sources.

```sh
bun run note:new <slug> "Title"   # scaffold src/notes/<slug>/, route /notes/<slug>
bun run dev                       # framework home, port 3000
bun run dev:framework             # the same, with every example note
bun run note:audit <slug>         # measure a finished note; run bun run visual:install once
bun run note:publish <slug>       # static deploy of that note alone
bun run note:share <slug>         # single-file export and versioned hosted upload
bun run framework:new ../my-note --slug my-note --title "My note"  # independent starter
```

Before authoring, animating or typesetting, read `.agents/skills/note-explainers/SKILL.md`. Use `.agents/skills/explorable-explanations/SKILL.md` for mechanism-focused explanations and `.agents/skills/emil-design-eng/SKILL.md` for UI polish. Record reusable lessons in those local skills, never global ones.

## Notes

- A note lives in `src/notes/<topic>/`, registered by `note.json`, and imports from `src/kit`. Never edit a note another agent is working on.
- The kit owns controls, disclosures, page chrome and their motion: `NoteNav`, `More`, `Check`, `Choice`, `Action`, `Toolbar`, `Parameter`, `Instrument`. A note writes CSS only for its own diagram, scoped to its page class. A missing control belongs in the kit.
- Words earn their place. Say each thing once: a figure heading, recap or caption must add what the chapter's title, question and prose have not.
- Render math with `src/kit/math/Tex.tsx`. Keep KaTeX fonts local and HTML + MathML output on. Invalid TeX should fail verification.

## Figures

- Keep SVG nodes persistent. Derive geometry and playback from the scene clock; no second timer. Pause before seeking.
- Discrete decisions must not animate through misleading mathematical states.
- Colours come from `src/kit/theme.css`; diagram roles use `--diagram-*`. Primary code uses the GitHub Dark palette, patch inspection Pierre's Vesper with inverse selection.
- Check inherited rules, especially wide figures and `pre`, at desktop and phone widths. Validate labels at their scaled size, and verify UI motion separately from figures.
- Before sharing a changed note, run `note:audit`, fix measured failures and inspect unsupported states. It samples gates, beat boundaries and midpoints, paused states and open disclosures, so it does not prove universal visibility.

## Distribution

- Deploy a note only with `note:publish` or `note:share`, never the default `dist`. The public service deploys with `bun run public:deploy`, the invitation service with `bun run share:deploy`.
- The starter is an explicit allowlist in `scripts/starter.ts`, with guidance in `templates/starter/`. New dependencies or kit files need a fresh export, install and build. Never ship existing notes, course archives, user paths or credentials in it.
- Entry points have enforced word budgets: `/llms.txt` 300, starter AGENTS 220, figure skill 380. Link deeper references rather than growing them.
- Hosted publication accepts one self-contained HTML file, so keep the router-free `src/single.tsx` entry and the opaque sandbox. Never add `allow-same-origin`, relax network isolation or embed uploads in trusted DOM. Preserve private credentials, stable publication IDs, immutable versions and pending-operation retries. Read `sharing/DESIGN.md` before changing that contract.
