# ADR-003 — Modular monolith, module map & app layout

> **Status:** `approved` (founder, 2026-07-18) · **Owner:** CTO · **Date:** 2026-07-18
> Locked upstream: modular monolith, NOT microservices (product doc §14; dev spec §24). This ADR defines the modules and their rules.

## Apps

| App | Role | Why separate |
|---|---|---|
| `apps/api` | Hono modular monolith — all HTTP | single deployable, transactional integrity for the core loop |
| `apps/worker` | BullMQ consumer — reminders, special-events cadence, reconciliation, target/leaderboard rollups, event-inbox processing | Mizro pattern; keeps api latency clean |
| `apps/web-seller` | Seller PWA (mobile-first) | audience + archetype split (ADR-009); lean bundle; PWA/Capacitor path |
| `apps/web-admin` | Manager/Owner console (desktop-dense) | dense-table archetype; different auth surface weight |

Internal-ops console (Arad operating the SaaS itself) is a **seam** — deferred to Phase 5; in the pilot, org admin *is* Arad.

## Module map

Modules live in `apps/api/src/modules/<name>/` (routes + service + policy + events). A module graduates to `packages/` only when a 2nd consumer appears — **`commission` and `db` and `api-contracts` start as packages** (worker consumes them day 1).

**platform-core (L1):** `identity` (users, sessions, OTP glue) · `org` (organizations, members, teams, territories) · `audit` · `notifications` (SMS/push fanout via Connect) · `integrations` (event inbox, Mizro partner-command client, webhooks-out seam) · `files` (seam).

**sales-core (L2, industry-agnostic):** `accounts` (accounts + contacts) · `leads` · `opportunities` (pipeline, stages, win/loss) · `activities` (visits, calls, next-actions — the mandatory-next-action invariant lives here 🔒) · `products` (products/offers, minimal) · `attribution` · `commission` (package) · `targets` · `reporting` (funnel + manager dashboard queries).

**verticals (L4):** `packages/verticals/mizro` — cafe entities (cafe profile, current-menu assessment, demo refs, onboarding checklist), vertical visit-form fields, pipeline preset, event handlers. ADR-010.

Installable L3 modules (field-sales extras, gamification, flows, loyalty/lifecycle, scheduling, customer-finance, NBO/AI) are **later phases**; the seams they need now are only: domain events, module registry (ADR-010), and Connect.

## Boundary rules 🔒 (adapted from Mizro doc-29 P1–P5)

1. A module's public surface is its `index.ts` (service API + emitted event types). **No deep imports** across modules.
2. **No cross-module writes.** Reads of another module's data go through its service API; joins inside one module's tables are free.
3. Modules communicate side-effects via **in-process domain events** (typed, from `@arad/platform-events` + local event defs), persisted to `platform_events`; handlers must be idempotent.
4. Foundation (Tier-1) tables never FK into product tables — opaque IDs only. Within the CRM, vertical tables may FK **to core aggregate roots only** (account, contact, opportunity); core never references vertical tables.
5. Neutral naming in anything destined for foundation.

**Enforcement:** ported AST guard script `scripts/check-module-boundaries.ts` in the CI `verify` chain (Mizro's guard-script pattern) — not convention-by-hope.

## Options rejected

- **Microservices / separate services per module** — explicitly out (deploy cost, transaction complexity, team size).
- **Everything-in-packages from day 1** — premature; packages are extraction targets, not a default location.
- **Shared "domain" grab-bag package** — becomes a boundary-less dumping ground; modules stay vertical slices.

## Revisit triggers

A module needed by a second deployable → extract to `packages/`. A vertical needing isolation/encryption guarantees (clinic) → revisit whether verticals get their own schema (ADR-010).
