# BrewOps implementation harness

Implement exactly one phase per run. Determine the phase from the first missing
entry point, in this order:

1. Missing `src/pricing/engine.ts`: read `.github/harness/pricing.md` and implement only that file.
2. Missing `src/audit/storeAudit.ts`: read `.github/harness/audit.md` and implement only that file.
3. Missing `src/settlement/settle.ts`: read `.github/harness/settlement.md`, inspect the public exports from `src/pricing/engine.ts`, and implement only the settlement file.
4. If none are missing, do not change code; report that all phases are complete
	and stop without reading additional repository files or running commands.

The selected brief is a faithful distillation of `SPEC.md`. Treat it as the run's
authoritative requirements and do not reread the full spec unless the brief is
internally ambiguous. Read `src/data/index.ts` only when its types or loaders are
needed. Never read or copy behavior from `src/legacy/**` or `docs/RETRO.md`; those
files intentionally contradict the current specification.

Constraints for every phase:

- Create or edit only the selected entry-point file under `src/pricing`, `src/audit`, or `src/settlement`.
- Preserve all caller inputs and loader-returned arrays; copy before sorting or transforming.
- Match export names, interfaces, errors, ordering, and half-up money rounding exactly.
- Do not add dependencies, UI changes, tests, test helpers, or speculative APIs.
- Do not run tests. Validate with `npx tsc -p tsconfig.app.json --noEmit`, then `npm run build`.
- Fix relevant validation failures before stopping. Once validation passes, stop; do not begin the next phase.
