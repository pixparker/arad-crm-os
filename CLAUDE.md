# Arad CRM-OS — agent guide

CRM/sales-OS for Arad; Mizro is client + vertical #1. **Read `docs/architecture/00-overview.md` + the ADR index before structural changes** — decisions there are approved and 🔒 items are locked invariants.

## The framework

`foundation/` is the `arad-vision` submodule. Its docs are **portfolio-binding**: a product ADR that contradicts one is wrong by construction.

| Doc | When |
|---|---|
| `foundation/docs/00-north-star.md` | portfolio boundaries — who owns which entity |
| `foundation/docs/01-approved-stack.md` | adding a dependency or a tool |
| `foundation/docs/02-package-tiers.md` | adding a package — declare a tier + write `EXTRACTION.md` first |
| `foundation/docs/03-platform-concerns.md` | touching cross-cutting plumbing — check the concern's owner before hand-rolling |
| `foundation/docs/04-ux-standards.md` | building any UI |
| `foundation/docs/05-delivery-method.md` | picking up an epic |
| `foundation/docs/06-delivery-pipeline.md` | deploying |

**UI work:** `standards/ux/AGENTS.md` (the `ux-best-practices` submodule) is the operating rule set — pick the archetype per app (`web-seller` = consumer-mobile-app, `web-admin`/`ops` = ops-admin-panel), then apply the non-negotiable defaults.

🔒 **Never hand-roll a concern `foundation/docs/03` already assigns an owner** — auth, external services, config, logging, crash reporting, cross-product events, deploy. Use the `@arad/*` package.

**Two gaps this repo owns** (`foundation/docs/03`): it has **no back-stack** (row 0 — Back must close the topmost overlay, never unload the page), and its `deploy/` is a fork of Mizro's with CI but no pipeline — adopt `foundation/delivery` (`foundation/delivery/MIGRATION.md`, this repo is adopter #2).

## Commands

- `pnpm verify` — full gate: biome → typecheck → org-scope guard → contracts-enums guard → migration-drift → secret-grep → tests. Run before declaring work done.
- `pnpm services:up` / `services:reset` — dev Postgres (5433) + Redis (6380) + migrate.
- `pnpm dev:ops` — the Arad control plane (ADR-014). `SEED_OPS_PHONE=09… pnpm db:seed` bootstraps the first ops user; ops roles are granted from the panel after that.
- `pnpm db:generate` after ANY `packages/db/src/schema.ts` change (drift guard fails otherwise).
- Dev ports: api **6100**, web-seller **6101**, web-admin **6102**, ops **6103** (Mizro owns 4000/3001-3006/5432/6379 — never reuse).

## Hard rules (CI-enforced, do not work around)

1. 🔒 Tenant tables (any table with `organization_id`) are queried ONLY through `orgScope(table.organizationId, orgId)` — escape hatch comment `// @invariant-allow: orgScope-cross-tenant <reason>` for ops/aggregate jobs only.
2. 🔒 API request/response/enum shapes live in `packages/api-contracts` only. No `z.enum` outside it (escape: `// @invariant-allow: local-enum <reason>`).
3. 🔒 Money = `bigint` Rial end-to-end; on the wire it is a digit-string (`rialStringSchema`). Never float, never `number`.
4. 🔒 Commission entries and audit rows are append-only — reversal/adjustment entries, never UPDATE/DELETE.
5. 🔒 Sale = payment event from a producer (`@arad/platform-events`), never a manual toggle.
6. Module boundaries (ADR-003): `apps/api/src/modules/<name>/` slices; cross-module access via the other module's `index.ts` service API; no cross-module writes; no deep imports.
7. Foundation (`foundation/` submodule): changes land in the `arad-foundation` repo first, then bump the submodule pointer here. Foundation packages never import product packages.
8. Persian-first: UI copy fa-IR, RTL; dates displayed via `Intl` fa-IR; storage always UTC `timestamptz`.

## Conventions

- TS strict-maximal (`@arad/tsconfig`), Biome (via foundation config), Vitest; integration tests are `*.db.test.ts` against real Postgres.
- Packages ship source (`main: ./src/index.ts`) — no build step for libs.
- IDs: UUIDv7 via `packages/db` `uuidv7()` helper.
- Errors: throw `@arad/errors` classes; api maps them centrally.
- New API endpoint = contract in `api-contracts` first, then route via `@hono/zod-openapi`.
