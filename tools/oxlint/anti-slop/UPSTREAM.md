# anti-slop provenance

- Source: https://github.com/dmmulroy/anti-slop
- Revision: 13909c9e07590f5a85d93c62712259fe14a883f7
- Installed: 2026-10-22 with `skills/install-anti-slop/scripts/install.mjs`
- Installed paths: `index.ts`, `rules/`, `shared/`, `effect/`,
  `vendor/eslint-stylistic/`, and `LICENSE`
- Upstream tests: the skill bundle omits `*.test.ts` files; this repository
  exercises the plugin through `pnpm lint` and the follow-up enforcement PR
  adds focused rule tests.
- Local deviations: none in the copied source. `UPSTREAM.md` and `LICENSE` were
  copied from the revision above. The parent configuration stages the rules at
  `warn` and keeps `require-readable-spacing` off until the repository-wide
  cleanup lands, because its autofix would push files past the 150-line budget.
- Verification: `diff -rq` against the upstream `src/` tree matched every
  non-test file at the recorded revision.
- License: MIT for anti-slop. The nested padding rule keeps the ESLint
  Stylistic license in `vendor/eslint-stylistic/LICENSE` and its provenance in
  `vendor/eslint-stylistic/UPSTREAM.md`.
