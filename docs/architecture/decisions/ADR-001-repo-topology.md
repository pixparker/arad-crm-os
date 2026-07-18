# ADR-001 — Repo topology & the shared Arad foundation

> **Status:** `in-review` · **Owner:** CTO · **Date:** 2026-07-18
> Product doc §3/§18 delegates the topology as "the CTO's call"; requirement is **shared foundation, not duplicated**.

## Context

- Mizro (`digital-menu`) is a **live product** mid-pilot with 91 migrations, CI ratchets, and a locked extraction-hygiene principle (its doc-29): Tier-1 packages are business-agnostic and **extract on the 2nd real consumer**. The CRM *is* that 2nd consumer (of `auth-otp`, `connect`, `observability`, `logger`, `i18n`, …).
- `arad-commerce-os` is docs-only, zero commits — a future 3rd consumer, not a coordination partner today.
- The money doc's build directive: **new monorepo in mvp-pool, working name `arad-crm-os`, modular monolith** — standalone repo is settled; the open question is how sharing works.
- Team is small (founder + AI-agent dev); publishing overhead must stay near zero.

## Options considered

| | Option | Verdict |
|---|---|---|
| A | Single Aradvision megarepo now (move digital-menu in) | Best long-term, but high-risk churn on a live product mid-pilot; premature |
| B | Private npm registry + versioned publishes (changesets) | Correct at >1 team; publish/bump friction is real drag for a 1–2 person team iterating daily |
| C | New `arad-foundation` repo, mounted as a **git submodule** inside each product's pnpm workspace | Live-editable, no publish step, plain workspace linking; submodule DX cost is acceptable and AI-tooling handles it |
| D | Copy packages into CRM, extract "later" | Violates the no-duplication mandate; "later" never comes |

## Decision

**Option C, staged.**

1. **Create `arad-foundation`** (new repo in mvp-pool). Seed it by extracting Mizro's Tier-1 packages, renamed to neutral **`@arad/*`** scope. Mounted at `foundation/` via git submodule; `pnpm-workspace.yaml` includes `foundation/packages/*`.
2. **Extraction waves — only what's consumed, when consumed:**
   - **Wave 1 (scaffold week):** `tsconfig` · `biome-config` · `config` · `errors` · `logger` · `observability` · `i18n` · `auth-otp` · **`platform-events` (new — the event contract, ADR-006)**.
   - **Wave 2 (when SMS/notifications wire up, still Phase 1):** `connect` + `providers/core` + `providers/sms` · `notifications`.
   - **Deferred until needed:** `ui`/`icons` (CRM brand is greenfield), `ops-kit`/`ops-rbac` (when an internal-ops surface exists), `wallet-ledger` (if/when seller payout wallets ship), `providers/storage`.
3. **digital-menu migrates staged, not now.** 🔒 **Freeze rule:** from the seed date, the extracted packages' copies inside digital-menu are **change-frozen** — any change lands in `arad-foundation` first; digital-menu either migrates to the submodule then, or cherry-syncs with a provenance note. Migration trigger: first genuinely shared change, or the first post-pilot maintenance window. No behavior changes during extraction — renames + import moves only.
4. **Commerce OS adopts `arad-foundation` wholesale at its Sprint 0.** Its project doc currently lists its own `auth/`, `design-system/`, `deployment/` packages — those must become foundation consumers, not rivals (flagged to founder).
5. **Naming:** foundation = `@arad/*`; CRM-local packages = `@arad-crm/*` (rename cosmetically when brand lands).
6. **DX rules — the submodule must stay invisible** (requirements-fit #1): repo scripts wrap the flow (`pnpm foundation:status|pull|bump`); CI checks out recursively; CONTRIBUTING documents the two-commit cross-repo change. Note: until Mizro migrates, the CRM is the foundation's **only active consumer** — cross-repo coordination cost is ~zero exactly during the high-churn Phase-1 window.

## Consequences

- CRM starts day 1 on proven auth/connect/observability code instead of rewrites — and hardens them as the second consumer.
- Submodule costs: `--recurse-submodules` in CI checkout, pointer-bump discipline. Accepted; documented in CONTRIBUTING.
- Cross-repo atomic changes (foundation + product) take two commits. Accepted at this team size.
- The eventual megarepo (option A) stays cheap to reach later — foundation is already a clean subtree.

## Revisit triggers

- Team grows past ~4 devs or an external team consumes the foundation → graduate to option B (registry + changesets).
- Commerce OS Sprint 0 → re-confirm foundation ownership + contract governance.
