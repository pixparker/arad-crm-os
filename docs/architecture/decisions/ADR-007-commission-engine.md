# ADR-007 — Commission engine (the crown jewel)

> **Status:** `in-review` · **Owner:** CTO · **Date:** 2026-07-18
> 🔒 Locked upstream: independent, versioned, append-only, idempotent, auditable, clawback-on-refund — E53 wallet-ledger rigor. **Built first, tested against fixture payment events, before any UI** (product doc §18.3).

## Shape

`packages/commission` — a **pure calculation engine** (plan rules × commission event → entries; zero I/O; property + golden tests) wrapped by a thin persistence layer with a single idempotent entry point (mirror of `wallet-ledger`'s `appendTransaction` discipline).

## Data model (core tables)

- `commission_plans` → **`commission_plan_versions`** — immutable JSONB rule snapshots + `effective_from`. 🔒 Every ledger entry stamps its `plan_version_id`. 🔒 A new version never recomputes existing entries. Rule snapshots are a **Zod discriminated union of rule types** (`percent_of_net` · `fixed_per_sale` · `tiered` · `split_shares` · …) — new rule kinds are **additive variants the engine dispatches on**, never a schema migration; this is where commission flexibility lives (requirements-fit #5) while history stays frozen.
- **`commission_entries`** — append-only. `{ org, source_event_id, beneficiary_user_id, entry_type (earn|reversal|adjustment), amount (bigint Rial, signed), plan_version_id, opportunity/account refs, status }`. 🔒 **No UPDATE/DELETE surface** — enforced by a ported `check-commission-ledger-integrity.ts` CI guard (AST, like Mizro's wallet guard). Balances/earnings are always **derived**.
- **Idempotency 🔒:** `UNIQUE (org, source_event_id, beneficiary_user_id, entry_type)` — a replayed `payment.received` credits exactly once (`wasDeduped` result, not an error). Adjustments carry their own generated source ids.
- **`commission_entry_status_audit`** — append-only status transitions (Mizro's `wallet_transaction_audit` pattern).
- `payouts` — groups `payable` entries into a paid batch (payout rails later; possibly `@arad/wallet-ledger` when seller wallets ship).
- `commission_disputes` — links entries to the manager action-queue.

## Status machine (8 states, dev spec §17) 🔒

`estimated → pending_finalization → earned → approved → payable → paid`, plus `reversed` and `disputed`. Transitions are validated (invalid-transition error), append-only audited, and permission-gated (manager approves **within authority cap**; finance moves `approved → payable → paid`). MVP config may collapse `estimated/pending` (plan-configurable), but the machine ships complete.

## Rules honored from the spec 🔒

- **Trigger events:** new-payment · renewal · upgrade · add-on/service sale · (debt-collection later) — all arriving as ADR-006 events.
- **Calc base:** *net collected revenue* (after tax/refund/pass-through/unauthorized discounts) — taken from event payload net fields, never recomputed from gross in the CRM.
- **Split shares:** one payment → N entries (referrer/visitor/closer) that must sum to the plan output — invariant test.
- **Clawback:** `payment.refunded` → automatic **reversing entry** (`reverses_entry_id`), never mutation; status → `reversed`.
- **Manual adjustment:** separate `adjustment` entry, mandatory reason, permission-gated, audit-logged.
- 🔒 **Transparency:** every entry stores enough (plan version + inputs snapshot) for the seller money panel to show *how the number was computed* — commission disputes die on explainability.

## Testing bar (higher than anywhere else)

Golden scenarios (fixture event streams → expected ledger), property tests (idempotent replay; splits sum; reversal symmetry; derived totals), `*.db.test.ts` against real Postgres, plus the CI integrity guard. This module reaches ~100% branch coverage before Phase-1 UI starts.

## Options rejected

- **Reuse `wallet-ledger` directly** — wallet semantics (overdraw refusal, available-balance states) aren't commission semantics (plan versioning, approval workflow, splits). Same *discipline*, separate package. Wallet may return for payouts.
- **Computed-on-read commission (no ledger)** — kills auditability, dispute handling, and plan-version stability. Rejected upstream.
- **Recompute-on-plan-change** — explicitly forbidden 🔒.
