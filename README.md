# Arad CRM-OS

Sales execution system + CRM: leads → daily plan → visits → opportunities → **payment-event attribution** → **append-only commission ledger** → seller money panel. Headless horizontal core + vertical apps; **Mizro (cafe) is vertical #1**. Architecture: [`docs/architecture/00-overview.md`](docs/architecture/00-overview.md).

## Layout

| Path | What |
|---|---|
| `foundation/` | git submodule → [`arad-foundation`](../arad-foundation) — shared `@arad/*` Tier-1 packages |
| `apps/api` | Hono modular monolith (`src/modules/<module>/`) — port **6100** |
| `apps/worker` | BullMQ jobs: reminders, cadences, reconciliation, event-inbox processing |
| `apps/web-seller` | Seller PWA («امروز من») — port **6101** |
| `apps/web-admin` | Manager/owner console — port **6102** |
| `packages/db` | Drizzle schema + migrations + `orgScope()` 🔒 |
| `packages/config` | Zod-validated env (product-specific; foundation stays neutral) |
| `packages/api-contracts` | Zod single source of truth for API shapes 🔒 |
| `packages/commission` | commission engine — append-only ledger discipline 🔒 |
| `packages/ui` / `packages/web-shared` | tokens+primitives / non-visual web glue |
| `packages/verticals/mizro` | cafe vertical package |
| `scripts/check-*.ts` | CI invariant guards (org-scope, contracts-enums, migration-drift) |

## Quickstart

```bash
git clone --recurse-submodules git@github.com:pixparker/arad-crm-os.git
cd arad-crm-os && cp .env.example .env   # fill JWT_SECRET
pnpm install
pnpm services:up      # postgres:5433 + redis:6380 (offset from Mizro) + migrate
pnpm dev              # api :6100 · seller :6101 · admin :6102 · ops :6103
pnpm verify           # biome → typecheck → guards → secret-grep → tests
```

## Dev ports (never collide with Mizro)

| Service | Mizro | **CRM-OS** |
|---|---|---|
| api | 4000 | **6100** |
| web apps | 3001–3006 | **6101–6103** |
| Postgres | 5432 | **5433** |
| Redis | 6379 | **6380** |

## Rules that CI enforces 🔒

- Every tenant-table query goes through `orgScope()` (`scripts/check-org-scope.ts`).
- API enums/shapes live only in `@arad-crm/api-contracts` (`scripts/check-contracts-enums.ts`, escape: `// @invariant-allow: local-enum <reason>`).
- Schema never drifts from migrations (`scripts/check-migration-drift.ts`).
- Foundation changes land in `arad-foundation` first (see `foundation/README.md` freeze rule).
