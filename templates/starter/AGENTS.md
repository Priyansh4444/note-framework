# Note Framework

SolidJS + TypeScript. Start with the worked note in `src/notes/`; read only files you need to change. No global skills, course history or service internals are required.

- New note: `bun run note:new <slug> "Title"`. `note.json` registers it; `chapters.ts` owns questions, takeaways and sources.
- Reading path: context → picture → reason → key fact. Define necessary terms visibly. Put longer reasoning in named disclosures; preserve assumptions and source coverage.
- Reuse `src/kit`. Keep ink-black theme tokens and semantic `--diagram-*` colors. Use GitHub Dark code; Vesper patches. Hand-author SVG diagrams; no Mermaid. For figures/math, read `.agents/skills/note-explainers/SKILL.md`; pattern skills and deeper guidance are linked there only when needed.
- Verify sources/numbers, then `bun run lint`, `bun run test`, `bun run check`, `bun run note:build <slug>`. Run `bun run visual:install` once, then `bun run note:audit <slug>`; resolve failures and unverified states. Browser-check desktop/390/320px, scaled labels, intermediate motion, keyboard and reduced motion.
- Share: run `bun run share login --server https://note-framework-public.pronsh.workers.dev`, open its approval link, sign in with a passkey, and approve the matching fingerprint. Then `bun run note:share <slug>`. Or use `bun run note:publish <slug>` with the user's Cloudflare account. Verify the live page. Credentials stay outside this project. Retry interrupted uploads unchanged; never silently rebase a conflict.
