# Requirements-Fit Review — the founder's five axes

> **Status:** `approved` (founder, 2026-07-18) · **Owner:** CTO · **Date:** 2026-07-18
> Founder requirements: **(1)** agile/fast dev flow · **(2)** low risk of bugs & breakage · **(3)** low-effort maintenance · **(4)** high performance where needed · **(5)** high feature flexibility.

## The governing principle: deliberate asymmetry

These five pull against each other (speed vs safety vs flexibility). This architecture resolves the tension by being **asymmetric on purpose**:

- **Rigid spine** where a bug costs trust or money: commission ledger, attribution, tenancy scoping, event idempotency, API contracts. Here we pay ceremony (append-only, CI guards, golden tests) to buy #2 and #3.
- **Flexible flesh** everywhere features live: module slices, domain events, config-as-data (pipelines, outcome sets, commission *plans*), vertical packages, provider registry. Here changes are cheap, additive, and org-scoped — buying #1 and #5.

## Per-requirement mapping

| # | Requirement | Strongest mechanisms (ADR) | Accepted tax + mitigation |
|---|---|---|---|
| 1 | **Fast dev flow** | Proven reused packages — auth/OTP, Connect, observability arrive working (001) · one stack, zero research decisions (002) · feature = one module slice: routes+service+policy+tests in one folder (003) · Zod contracts give end-to-end types, no client codegen (008) · packages ship source — no build step in the inner loop · one-command dev compose (002) | Submodule ceremony (001 §DX: wrapped in `pnpm foundation:*` scripts; CRM is the sole active consumer until Mizro migrates, so coordination cost ≈ 0 in Phase 1) · two web apps (009: shared `web-shared` glue package kills the duplication) |
| 2 | **Low bug/breakage risk** | Strict-maximal TS + Zod at every boundary (002/008) · invariants as CI AST guards, not conventions (011) · append-only + idempotent everywhere money moves (006/007) · real-Postgres test tier, golden commission scenarios, data-leak suites (011) · Idempotency-Key makes flaky-network retries safe (008) · reconciliation sweeps self-heal lost events (006) | No browser-E2E in Phase 1 (011) — money paths are covered at the db tier; smoke-E2E on login+visit-log is the named revisit once flows stabilize |
| 3 | **Low-effort maintenance** | One stack across all Arad products; upgrades decided once in foundation, rolled everywhere (001/002) · modular monolith = one deploy, no fleet (003) · boring mainstream deps with long runway · guards double as executable documentation — invariant knowledge can't rot (011) · idempotent inbox + sweeps = integrations that fix themselves instead of paging you (006) | Self-hosted PG/Redis ops — already sunk cost shared with Mizro on mvp-pool · submodule pointer bumps (scripted) |
| 4 | **Performance where needed** | Hono = fastest-tier Node HTTP, no DI runtime (002) · Drizzle = thin SQL, no lazy-ORM N+1 magic; org-scoped composite indexes designed in (004) · UUIDv7 index locality on append-heavy tables (ledger/activities/events) (002) · heavy work off the request path via worker (003) · cursor pagination only (008) · seller-felt performance: PWA shell caching + perf budget for mid-range Android on weak networks (009) | No premature caching/rollups — pilot scale (2–3 sellers) is trivial; named seam: reporting moves to rollup tables/materialized views when org count grows |
| 5 | **Feature flexibility** | Headless core — any new surface (Telegram bot, Capacitor app, vertical UI) is just an API client (008) · domain events — new behavior (loyalty, gamification, flows) attaches as handlers without touching existing modules (003) · config-as-data: pipeline stages, outcome taxonomies, commission plans are versioned *data*, not code (007/010) · commission rule types are a discriminated union — new rule kinds are additive, no migration (007) · module registry toggles features per org (010) · provider registry swaps SMS/etc. without feature changes (006) · JSONB metadata hatch for vertical fields (010) | Deliberately *inflexible*: money history (append-only), roles (static catalog until Phase 5), custom fields (deferred) — flexibility is withheld exactly where silent change = disputes |

## Verdict

The architecture meets all five, with the trade-offs above accepted **by design**: requirements #2 and #3 are structurally guaranteed (guards, append-only, one stack); #1 and #5 are served by where the flexibility was placed (modules, events, config-as-data) rather than by loose rules; #4 is a non-issue at pilot scale and has named seams (worker offload, rollups) for when it becomes one.

**Watch-items the founder should hold me to:** submodule friction staying invisible behind scripts; guard scripts landing *with* the code they protect (staged, 011) so day-1 velocity isn't taxed; the no-E2E gap revisited before the pilot widens beyond 2–3 sellers.
