# ADR-005 — Identity, authentication & authorization

> **Status:** `in-review` · **Owner:** CTO · **Date:** 2026-07-18

## Authentication (reuse, don't rebuild 🔒)

- **`@arad/auth-otp`** (Mizro Tier-1, fully port-injected): phone **OTP → JWT session cookie** (jose), sliding refresh, bcrypt-hashed codes, Iranian-mobile normalization, Redis rate-limit stores. No passwords. CRM wires its own ports (`UserRepo`, `OtpSessionRepo`, `OtpSender` via Connect SMS, `RegistrationGate` = invite-only in pilot).
- **Own user base** — CRM sellers/managers are NOT Mizro merchants; `users` lives in `arad_crm`. A shared Arad identity core is a future foundation concern; the seam is that auth-otp is already the common module.
- Cookie: `ac_session`, httpOnly + SameSite, CSRF middleware ported; sliding refresh per request; impersonation (later, ops) uses fixed absolute expiry — all Mizro middleware patterns.
- Sellers are onboarded by **invite** (manager creates member → phone-bound invite, Mizro E48 pattern) — no open registration.

## Authorization

**Roles (static catalog in code, versioned — no permission editor in MVP):** `visitor_seller` · `followup_seller` · `sales_manager` · `owner_admin` · `deployment_ops` · `finance` (read-only on sales activity 🔒, per dev spec §7). Role assignment is per-org membership (`org_members.role`), managers additionally scoped to team(s).

**Model: per-module policy layer with data scopes** — every module exposes `policy.ts` answering `can(actor, action, resource)` where visibility scope is one of **`own` | `team` | `org`**:

- 🔒 **A seller sees only their own** leads/opportunities/activities/commission; never other sellers' data, never org-wide financials (product doc §8).
- Manager: team scope + approval powers (commission approval within authority cap, reassignment, dispute resolution — the manager action-queue from dev spec §14).
- Finance: org-wide financial read + payout write; cannot edit sales activities.
- Policy checks live at the service layer (not just routes) so worker/event paths obey the same rules.

**Enforcement & tests:** scope filters are applied in queries (not post-filtering); every module ships **visibility tests** (cross-seller + cross-team + cross-org) as part of the data-leak suite (ADR-004/011). Sensitive grants/changes → `audit_log`.

## Options rejected

- **CASL / generic policy engine or DB-driven permissions** — dynamic permission editing is a Phase-5+ SaaS feature; a static catalog + explicit policy functions is auditable, testable, and matches the 6-role reality.
- **Separate auth service** — the "shared identity core" ambition doesn't justify a service; the shared *module* is the foundation-level reuse for now.
- **Password or magic-link primary auth** — field sellers live on phones; OTP is the house pattern. (Magic-link kept as a Mizro-proven fallback seam.)

## Revisit triggers

Phase 2 team features (territories, split attribution) → extend scopes; Phase 5 SaaS → custom roles/permission editor; Commerce OS build → shared identity-core extraction conversation.
