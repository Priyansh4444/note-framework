# T3 Code lint rules

Adapted from [pingdotgg/t3code](https://github.com/pingdotgg/t3code) at commit `9eac774602a9462a90f9ea5a029e0f6ac35d03f4` (2026-10-26). The original MIT license is retained in `LICENSE`.

The general configuration follows its root `vite.config.ts` lint block: ESLint/Oxc/Unicorn/TypeScript correctness, suspicious and performance categories; accumulating-spread, unused-code, empty-pattern, useless-spread, unsafe-chain and module-specifier rules. Project commands reject warnings and unused suppressions. The imported custom rules require explained suppressions, reject low-value comments, and replace native title tooltips. The tooltip diagnostic names this framework’s `tip` helper instead of T3 Code’s React UI components; the other two retain their rule behavior, with formatting changes only.

React Compiler/hooks, React Native/Hermes, shadcn/Tailwind, Effect-specific runtime rules and T3 RPC/import boundaries do not apply to this SolidJS framework and are not enabled. T3’s bans on frame/time probes are not ported: the visual harness deliberately samples intermediate geometry and the simulated clock, while state assertions still use observable completion. This is a documented stack adaptation, not a claim to enable T3’s entire monorepo configuration.

Solid compiles JSX `ref={element}` into assignments. The generic `no-unassigned-vars` rule cannot see those writes, so it is disabled only for TSX files; the rule stays enabled for ordinary TS/JS. Pinned upstream vendor files, generated artifacts and standalone authoring templates are excluded from automatic rewrites. The public kit entry and dynamically loaded notes/fixtures are declared as Knip entries, so unused-file checks preserve the distribution API and real generators.

Knip’s only ignored dependency is Wrangler: `scripts/note.ts` invokes that installed CLI indirectly through its publication command. KaTeX ships its own declarations, so the obsolete `@types/katex` dependency was removed instead of ignored. Standalone script files loaded as build inputs and the public recipe collection are explicit entries.
