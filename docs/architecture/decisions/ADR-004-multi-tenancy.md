# ADR-004 — Multi-tenancy & data isolation

> **Status:** `in-review` · **Owner:** CTO · **Date:** 2026-07-18
> Locked upstream: multi-tenancy as a **seam now** — `organization_id` on every row; onboarding/billing/white-label later (product doc §5).

## Context

Phase 1 runs one tenant (Arad itself selling Mizro). Phase 5 sells the CRM as SaaS. Retrofitting tenancy is the classic death trap, so the seam must be structural from day 1 — but tenant *features* (onboarding, billing, branding) must not be built yet. Mizro already solved the same problem with application-level scoping (`tenantScope()` on `businessId`) enforced by an AST guard in CI — no Postgres RLS.

## Decision

1. 🔒 **Every tenant-scoped table carries `organization_id uuid NOT NULL`** (FK → `organizations`), included in composite indexes that serve list queries.
2. 🔒 **All tenant-scoped queries route through `orgScope(column, organizationId)`** (ported from Mizro's `tenant-scope.ts`; throws on empty id). Direct `.from(<tenantTable>)` without an `orgScope` predicate fails CI via an AST guard (`scripts/check-locked-invariants.ts` port). Escape hatch: `// @invariant-allow: orgScope-cross-tenant` with justification, for ops/aggregate jobs only.
3. **Shared DB, shared schema, app-level isolation. No Postgres RLS for now.** Rationale: consistency with the proven in-house pattern and its CI tooling; RLS would add a second enforcement regime to keep in sync, and our single-tenant pilot gets zero marginal safety from it. Dedicated-DB-per-large-tenant stays a future option (dev spec §26) — nothing in the schema may assume cross-org joins.
4. **Org context resolution:** from the authenticated session (user → org membership), never from client-supplied org ids. Multi-org users (future) pick an active org server-side.
5. 🔒 **Data-leak tests are mandatory per module** (dev spec §26): every module ships tests proving cross-org queries return nothing, and seller-level scope tests (ADR-005) prove cross-seller isolation.
6. **Seams built now, features later:** `organizations` table + membership + module registry (ADR-010) exist from day 1; tenant onboarding/billing/branding are Phase 5 modules.

## Options rejected

- **Postgres RLS as primary enforcement** — split-brain with the app-level pattern Mizro's guards already enforce; adds migration/session-GUC complexity for no pilot-phase gain. Revisit below.
- **Schema-per-tenant / DB-per-tenant now** — operational overkill for N=1; kills cheap cross-tenant ops queries; stays a future option for hard-isolation demands.
- **No tenancy until SaaS phase** — retrofit cost is catastrophic; rejected upstream already.

## Revisit triggers

- Phase 5 (external tenants) → reassess RLS as **defense-in-depth** behind `orgScope()`, and per-tenant encryption needs.
- A regulated vertical (clinic) or enterprise tenant demanding hard isolation → dedicated-DB option.
