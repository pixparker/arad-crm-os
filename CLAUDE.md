# Arad CRM-OS — agent guide

CRM/sales-OS for Arad; Mizro is client + vertical #1. **Read `docs/architecture/00-overview.md` + the ADR index before structural changes** — decisions there are approved and 🔒 items are locked invariants.

## Commands

- `pnpm verify` — full gate: biome → typecheck → org-scope guard → contracts-enums guard → migration-drift → secret-grep → tests. Run before declaring work done.
- `pnpm services:up` / `services:reset` — dev Postgres (5433) + Redis (6380) + migrate.
- `pnpm db:generate` after ANY `packages/db/src/schema.ts` change (drift guard fails otherwise).
- Dev ports: api **4100**, web-seller **3101**, web-admin **3102** (Mizro owns 4000/3001-3006/5432/6379 — never reuse).

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
