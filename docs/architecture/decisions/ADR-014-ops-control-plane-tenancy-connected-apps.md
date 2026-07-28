# ADR-014 — Ops control plane, tenant provisioning & connected apps

> **Status:** `implemented` (E01, 2026-07-28) · **Owner:** CTO · **Date:** 2026-07-27
> **Built:** `apps/ops` + `/v1/ops/*` · `users.is_ops` + `ops_user_roles` · `connections`/`connection_events`/`connection_templates`/`app_settings` · `producer_bindings`. Foundation wave 2 landed (`@arad/connect`, `@arad/platform-config`, `@arad/ops-tenant`). **Not yet exercised against a real provider account or the production pool.**
> **Driver:** [demo-01-mizro](../../founder/demos/demo-01-mizro.md) — "same as our ops panel in Mizro". Revises [ADR-013 §2](ADR-013-deployment-domains-origins.md) (which deferred `apps/ops`) and triggers [ADR-001](ADR-001-repo-topology.md) foundation **wave 2**.

## Context

demo-01 requires, before any seller can log in: register a business, create users and assign them across businesses, connect sms.ir as a provider, and set platform settings. None of that exists. ADR-003 deferred the internal-ops console to Phase 5 on the reasoning that "in the pilot, org admin *is* Arad" — the demo retires that assumption.

Mizro has already solved this shape in production (`apps/web-ops`, `businesses`/`business_members`, `users.is_ops` + `ops_user_roles` + `ops_business_assignments`, `app_settings`, `connections`). **Default rule from ADR-002 applies: mirror Mizro; deviate only with a recorded reason.**

## Decision

### 1. Two identity axes 🔒

A user has **at most one platform identity** (`users` row, keyed by phone) and **two independent authorization axes**:

```
ops axis      : users.is_ops + ops_user_roles   → super_admin | onboarding_agent | support | finance
tenant axis   : org_members(organization_id, user_id, role) → visitor_seller | … | owner_admin
```

🔒 **An ops user is never an `org_members` row, and a tenant role never grants ops access** (founder framework decision 15, §15). The two are checked by different middleware against different surfaces. An Arad staffer who is also a Mizro seller holds one row on each axis — deliberately, and visibly in audit.

`ops_business_assignments` (scoping a support agent to specific businesses) is **deferred** — every ops user is global until Arad has enough staff for least-privilege to mean anything. The table shape is reserved so adding it is additive.

### 2. `apps/ops` — the control plane

New Next app at `ops.aradap.ir`, independently built and deployed (ADR-013 §4). It is **not** a tenant surface; it never renders tenant-role screens.

Surfaces, mirroring `digital-menu/apps/web-ops`:

| Screen | Purpose |
|---|---|
| **Businesses** | list · register a business · detail (members, status, vertical) |
| **Users** | create by phone · assign to one or more businesses with a tenant role · disable |
| **Ops users** | grant/revoke ops roles — separate screen because it is a separate identity axis (§1) |
| **Connected apps** | register a provider connection · enter credentials (write-only) · test · view health · rotate |
| **Platform settings** | typed config registry — hot-reloadable keys, no redeploy (§3, `platform-config`) |
| **Audit** | every ops mutation, filterable by actor and business |
| **Integration inbox** | event stream, failures, replay — moved off `web-admin` |

🔒 **Every mutating ops action writes an `audit_log` row in the same transaction as the change.** Ops acts across tenant boundaries by definition, so the audit trail is the only control that survives a mistake. This is also where the current `audit_log` coverage gap gets closed for ops writes.

Cross-tenant reads inside `apps/ops` use the documented escape hatch (`// @invariant-allow: orgScope-cross-tenant <reason>`) — never by weakening `orgScope()`.

### 3. Connected apps — extract from Mizro, don't rewrite 🔒

**Decision: foundation wave 2 fires now** (ADR-001 §2 named both triggers — "when SMS/notifications wire up" *and* "`ops-kit`/`ops-rbac` when an internal-ops surface exists"; demo-01 fires both at once). Rewriting would duplicate envelope encryption, adapter registration, health tracking and template routing — the highest-risk code to get wrong twice.

Extraction is **not uniform**, because Mizro's packages differ in how product-coupled they are. Verified against `digital-menu/packages/*/package.json`:

| Package | Coupling | Call |
|---|---|---|
| `platform-config` | `errors`, `zod` only | ✅ **extract as-is** — clean typed config registry |
| `ops-tenant` | zero deps | ✅ **extract as-is** |
| `ops-rbac` | `@mizro/db`, drizzle | ⚠️ **extract with port injection** — same treatment `auth-otp` already got (ADR-005) |
| `connect` + `providers/*` | `config`, `db`, `errors`, `logger`, `observability`, `platform-config`, `libsodium` | ⚠️ **extract with port injection.** Real work, not a rename — but the crypto, adapter registry and routing are exactly the parts worth not rewriting |
| `ops-kit` | **`@mizro/ui`** | ❌ **do not extract** — it would drag Mizro's design system into a product with a greenfield brand and its own `@arad-crm/ui` (ADR-009, ADR-012). Ops screens are built on the CRM's own kit |
| `notifications` | `connect`, `db`, `providers-sms`, `web-push` | ⏸ **later** — E01's OTP path calls Connect directly; fan-out isn't needed yet |

🔒 The ADR-001 **freeze rule** applies to every package extracted here: from the extraction date, Mizro's copies are change-frozen and changes land in `arad-foundation` first.

Schema mirrors Mizro's, platform-scoped:

- `connections` — `type` (`communication`; `payment`/`ai` reserved) · `provider` (`smsir` first) · `label` · `status` · `capabilities[]` · `health` · `cred_hint` · **envelope-encrypted credentials** (per-row DEK sealed by an env-mastered KEK; four `bytea` columns, never plaintext)
- `connection_events` — immutable credential-lifecycle audit, written in the same transaction, scrubbed of secrets
- `connection_templates` — provider-side OTP template refs
- `app_settings` — `key` → `jsonb`, platform configuration

🔒 **Credentials are write-only.** The UI sees `cred_hint` ("…1234") and nothing else; rotation means re-entering. Nothing outside the connect package may select the encrypted columns.

**Platform-scoped, not tenant-scoped, in E01** — Arad operates SMS on behalf of every tenant. Deliberately **no `organization_id` column**: adding a nullable one would enrol these tables in the org-scope guard's tenant-table list and force scoping on rows that have no tenant. Per-tenant connections ("bring your own SMS") are an additive migration.
**Revisit trigger:** the first tenant that must use its own provider account or its own sender ID.

### 4. Mizro's inbound webhook becomes a connection

`MIZRO_WEBHOOK_SECRET` (one global env var) is the same shape as the SMS key and has the same problems: not rotatable without redeploy, not per-tenant, not auditable. It becomes a `connections` row of type `integration` once Connect is in — the CRM issues the secret, Mizro consumes it, matching the direction already argued (CRM owns the registry; the producer owns its outbox).

**Not in E01** — the current env-var path works and is verified; changing it would risk the one integration that already functions. Sequenced immediately after F05.

### 5. Tenant provisioning

Ops registers a business (`organizations` row) and creates users by phone. Membership is `org_members`, which already carries `unique(organization_id, user_id)` — **multi-business membership needs no schema change**, only the ops UI and login-time workspace resolution.

Consequence 🔒: `pilotOrgId()` in the worker (`select … from organizations limit 1`) becomes wrong the moment a second business exists. Org must be resolved from the producer connection. Tracked as E01-F10.

## Options rejected

- **Ops screens inside `web-admin`** — collapses the two identity axes onto one surface, which decision 15 forbids; and a tenant-facing app should never hold cross-tenant credentials.
- **A fresh CRM-local SMS abstraction** — duplicates Mizro's proven crypto and adapter model; guarantees drift between two products that must agree on provider behaviour.
- **Per-tenant connections in E01** — no tenant needs it, and it fights the org-scope guard for zero present value.
- **Storing provider credentials in env vars** — not rotatable, not auditable, not per-connection; the reason `connections` exists.
- **A single `is_admin` flag** — cannot express "support may read but not move money"; Mizro already outgrew it.

## Revisit triggers

- Second Arad ops staffer → enable `ops_business_assignments` least-privilege scoping.
- First tenant demanding its own provider account → per-tenant `connections`.
- `payment` or `ai` connection types → confirm the adapter registry generalizes beyond `communication`.
- Mizro migrating onto foundation (ADR-001 §3) → re-confirm `@arad/connect` ownership and the freeze rule.
