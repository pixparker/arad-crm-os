# ADR-011 — Quality gates, observability & audit

> **Status:** `in-review` · **Owner:** CTO · **Date:** 2026-07-18
> 🔒 Locked upstream: financial transparency + full audit; sensitive changes logged; sellers see how commission was computed.

## Testing (Vitest, two tiers — Mizro pattern)

- **Unit tests** co-located; **`*.db.test.ts` integration tests** against real Postgres 16 (CI service container). No mocked-DB theater for money paths.
- **Non-negotiable suites 🔒:**
  - **Commission golden scenarios + property tests** (ADR-007) — replay-idempotency, split-sum, reversal symmetry, plan-version stability.
  - **Data-leak tests per module** — cross-org (ADR-004) and cross-seller/team (ADR-005) visibility.
  - **Event-contract tests** — fixture payloads from `@arad/platform-events` versions; inbox dedupe; DLQ/replay paths.
  - Activity invariant: 🔒 every open lead/opportunity has a dated next-action or a close reason — enforced in service layer + tested.

## CI guard scripts (ported Mizro pattern — invariants as code)

`scripts/check-*.ts` in a `verify` chain, run in CI before tests: `check-org-scope` (AST: no unscoped tenant-table queries) · `check-commission-ledger-integrity` (no update/delete surface on entries) · `check-module-boundaries` (no deep cross-module imports) · `check-contracts-enums` (no enum re-declaration outside api-contracts) · `check-forbidden-fields` (forbidden-data list never appears in core schema) · `secret-grep`. Pipeline: **Biome → typecheck → guards → Vitest(+PG)**, plus a **drizzle migration-drift check** (schema ↔ generated migrations always in sync).

**Guards land staged, with the code they protect** (requirements-fit #1 — no day-1 ceremony tax): scaffold week ships `check-org-scope` · `check-contracts-enums` · `secret-grep` · migration-drift; `check-commission-ledger-integrity` arrives with the commission package; `check-module-boundaries` with the second module; `check-forbidden-fields` with the first core schema.

## Observability

- **Logs:** `@arad/logger` (pino), correlation-id middleware end-to-end (api → worker jobs carry it).
- **Errors:** Sentry per app; scrub/sample policy from `@arad/observability` (PII redaction — phones, names); each app owns its `Sentry.init`.
- **Domain events** persisted to `platform_events`; integration inbox has status/attempt telemetry; worker jobs log outcome counts (Mizro sweep pattern).
- **Business metrics** (product doc §17: % visits logged, next-action coverage, funnel conversion, event-lag) come from the reporting module's queries — no separate metrics stack in Phase 1.

## Audit 🔒

- **`audit_log` append-only** — `{actor, org, action, entity_type/id, before/after snapshot, reason?, correlation_id, at}`.
- **Mandatory-audit actions:** commission adjustments/approvals, plan-version publishes, attribution overrides & dispute resolutions, role/membership changes, lead reassignment, impersonation, module enable/disable, exports of org data.
- Audit writes happen in the same transaction as the mutation; no fire-and-forget.

## Options rejected

- **Full OTel collector/metrics stack now** — Mizro runs spans-only + Sentry; match it; upgrade path exists.
- **E2E browser-test suite (Playwright) in Phase 1** — thin value vs cost pre-product-market; the money paths are covered by db-tier tests; revisit when the seller flow stabilizes.
- **Coverage-percentage gates** — invariant guards + mandated suites beat vanity thresholds; commission package alone targets ~100% branch.
