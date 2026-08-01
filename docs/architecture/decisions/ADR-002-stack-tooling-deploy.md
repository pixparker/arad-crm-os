# ADR-002 — Runtime stack, tooling & deployment

> **Status:** `approved` (founder, 2026-07-18) · **Owner:** CTO · **Date:** 2026-07-18

## Context

Mizro's stack is proven in production on the same infrastructure (mvp-pool), on the same network reality (Iranian providers, sanctions-aware self-hosting), with CI guards and deploy tooling already built. Every deviation would fork knowledge, tooling, and the shared foundation. **Default rule: mirror Mizro; deviate only with a recorded reason.**

## Decision

| Concern | Choice | Notes / provenance |
|---|---|---|
| Language | TypeScript ~5.7, strict-maximal via `@arad/tsconfig` | `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, ES2022; packages ship source (`main: src/index.ts`) |
| Runtime | Node ≥22 | matches Mizro |
| Monorepo | pnpm 9 workspaces + Turbo 2 | `apps/*`, `packages/*`, `foundation/packages/*` |
| Lint/format | Biome + lefthook hooks | one toolchain with Mizro |
| API server | **Hono 4** + `@hono/zod-openapi` + Scalar docs | not Fastify/Nest — consistency with Mizro's api, contracts pattern carries over |
| Web apps | **Next.js 15 App Router + React 19**, Tailwind **3.4** | Tailwind pinned to foundation's version; upgrades happen in foundation for all consumers together |
| PWA | `@serwist/next` (web-seller) | Capacitor Android shell = later seam (Mizro pattern exists) |
| ORM / DB | **Drizzle + drizzle-kit + pg → Postgres 16**, own database **`arad_crm`** | 🔒 own DB, never welded to Mizro's; same managed Postgres host initially, separate logical DB + credentials |
| IDs / time / money | **UUIDv7** app-generated PKs · `timestamptz` UTC · **money = `bigint` Rial** (display Toman in UI) | UUIDv7 for index locality (new DB, no legacy); money rule mirrors E53 🔒 |
| Jobs/queue | **BullMQ + Redis 7** (own logical DB), repeatable jobs for crons | worker app, Mizro pattern |
| Contracts | Zod as single source of truth in `@arad-crm/api-contracts` | ADR-008 |
| Tests | Vitest; `*.db.test.ts` tier against real Postgres 16 | ADR-011 |
| Observability | pino (`@arad/logger`) + Sentry per app + `@arad/observability` scrub policy + correlation-id | ADR-011 |
| Files/storage | S3-compatible (Arvan) via `@arad/providers-storage` — **deferred until a feature needs it** | visit photos are optional/consent-gated |
| Env/config | Zod-validated env via `@arad/config`; prod secrets out-of-band on runner | Mizro pattern; `secret-grep` guard in CI |

## Deployment

- **Target:** mvp-pool shared host ("pagio") behind Caddy — register the CRM's slug + **port allocations** in mvp-pool. **Locked dev allocation (never collides with Mizro's 4000/3001-3006/5432/6379):** api **6100** · web-seller **6101** · web-admin **6102** · ops **6103** · Postgres **5433** · Redis **6380**.
  - *Amended 2026-07-28 (founder):* the app ports moved from 4100/3101–3103 to a single **6100–6103** block. 4100 and 3101–3103 sit one digit away from Mizro's 4000 and 3001–3006, which is close enough that a stray process on either side reads as the other product's — the failure looks like a port clash long before anyone suspects the wrong app answered. One contiguous block nowhere near Mizro's ranges removes the ambiguity. The datastore ports are unchanged: 5433/6380 already sit in their own space, and moving them would churn every existing `.env` and volume mapping for no gain.
  - *Superseded 2026-08-01 by [ADR-P007](../../../foundation/docs/decisions/ADR-P007-shared-dev-stack.md) — datastore ports only.* The **app** ports above are unchanged and still locked. The **datastore** offsets are gone: local dev now runs one shared Postgres (:5432) and one shared Redis (:6379) for the whole portfolio, and the CRM's isolation is its database `arad_crm` + role `arad` + Redis **index 1**. The 2026-07-28 note's reasoning — *"moving them would churn every existing `.env` and volume mapping for no gain"* — was right at two products and wrong at four: the gain is that "the next free port" stopped being tracked in three separate code comments, and it is the same isolation model `mvp-pool` already runs in production. Isolation below is **unchanged in substance** — own DB, own Redis logical DB — only the container topology moved.
- **Containers:** per-app Dockerfiles (`deploy/Dockerfile.api|worker|web-seller|web-admin`); dev datastores come from the shared stack (`foundation/delivery/dev`), driven by `deploy/dev/services.sh`. Apps run natively with `tsx watch`/`next dev`.
- **CI/CD:** mirror Mizro's — CI: Biome → typecheck → guard scripts → Vitest (+ PG service container). CD: self-hosted runner builds images → object storage → staged manifest → **Telegram `/promote`** flip. Reuse the pipeline scripts, parameterized.
- **Isolation:** own DB, own Redis logical DB, own Sentry projects, own cookies/domains. Integration with Mizro is HTTP-only (ADR-006). 🔒

## Options rejected

- **NestJS/Fastify** — no capability gap vs Hono here; would fork the contracts/OpenAPI pattern and middleware set.
- **Prisma** — Drizzle already the house ORM; migration/tooling knowledge exists.
- **Supabase/managed BaaS** — conflicts with self-hosted mvp-pool ops model and Iranian network constraints.
- **Kafka/RabbitMQ** — scale doesn't justify it; BullMQ + Postgres idempotency ledgers cover Phase-1..3 needs.
- **Tailwind 4 / newest-everything** — shared `ui`/foundation compatibility outweighs novelty; upgrade centrally later.

## Revisit triggers

Foundation-wide version upgrades (Node/Next/Tailwind) are made in `arad-foundation` and roll to all consumers in one coordinated change.
