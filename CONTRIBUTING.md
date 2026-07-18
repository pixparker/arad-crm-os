# Contributing

## Foundation submodule flow (ADR-001)

`foundation/` is a git submodule of [`arad-foundation`](../arad-foundation). Its packages are normal workspace members (`@arad/*`).

- **Change a foundation package:** edit under `foundation/`, commit **in the submodule** (`git -C foundation add -A && git -C foundation commit`), push it, then commit the pointer bump here (`git add foundation`). Two commits, one session.
- **Pull latest foundation:** `pnpm foundation:pull` (then commit the pointer).
- **Status:** `pnpm foundation:status`.
- **Fresh clone:** `git clone --recurse-submodules …` (CI uses `submodules: recursive`).
- After the GitHub repo `pixparker/arad-foundation` exists and is pushed, `git submodule sync` aligns local remotes with `.gitmodules` (`../arad-foundation.git` resolves as a sibling of this repo's origin).

🔒 Never patch an extracted package's copy inside `digital-menu` — those are change-frozen (foundation README rule 2).

## Verify before done

`pnpm verify` must pass. If you changed `packages/db/src/schema.ts`, run `pnpm db:generate` and commit the migration with the schema change.
