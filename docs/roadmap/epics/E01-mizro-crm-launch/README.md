# E01 — Mizro CRM launch (control plane → login → guided capture)

> **Status:** 🔴 **BUILD NOW** · **Owner:** CTO · **Date:** 2026-07-27
> **Source:** [`docs/founder/demos/demo-01-mizro.md`](../../../founder/demos/demo-01-mizro.md) — the founder's walkthrough is the acceptance script.
> **Architecture:** [ADR-013](../../../architecture/decisions/ADR-013-deployment-domains-origins.md) (revised) · [ADR-014](../../../architecture/decisions/ADR-014-ops-control-plane-tenancy-connected-apps.md) (new) · [ADR-015](../../../architecture/decisions/ADR-015-flows-guided-next-action.md) (new)
> **UI/UX:** designed in the prototype repo — this doc specifies *behaviour and data*, not screens.

## 1. What this epic is

Everything between "the code is built" and "a Mizro seller logs in on their phone and captures a lead." The Phase-1 core loop already exists and is tested; E01 delivers the **control plane, the identity path, and the guided capture flow** that make it usable by a real team.

Three things here are genuinely new subsystems, not wiring: an **ops control plane** (`apps/ops`), a **connected-apps/Connect layer** (so SMS works at all), and **flows** (guided next-step playbooks).

## 2. The acceptance script

Straight from the demo — E01 is done when this runs end to end:

1. `./scripts/deploy/deploy-ops-prod.sh` → ops panel live at `ops.aradap.ir` (fire & forget)
2. `./scripts/deploy/deploy-mizro-crm-prod.sh` → CRM live at `mizro-crm.aradap.ir`
3. In ops: **register Mizro as a business**; create user `09163349938`; assign to that business
4. In ops: **connect sms.ir as a connected app**; configure platform settings
5. At `mizro-crm.aradap.ir`: enter `09163349938` → **receive a real OTP** → log in
6. Single business ⇒ land directly on the dashboard (no selector)
7. Press **＋** → choose **new lead** → fill → save
8. System **suggests an opportunity and schedules the next action** ("remind me in 2 weeks")

## 3. Features

Track column per §5: **① core** (architecture/BE/logic) · **② design** (prototype repo) · **③ surface** (CRM UI consuming ① via ②).

| # | Feature | Track | New? | Notes |
|---|---|---|---|---|
| **F01** | Fire-and-forget prod deploy scripts | ① | new | `scripts/deploy/deploy-{ops,mizro-crm}-prod.sh`, mirroring `digital-menu/deploy/deploy-prod-*.sh` |
| **F02** | `apps/ops` control-plane app + ops identity/roles | ①+③ | **new app** | ADR-014 §2. Kit-built, no design pass — see §5.3 |
| **F03** | Business provisioning + user↔business membership | ①+③ | partial | `organizations`/`org_members` exist; no ops UI/API, no multi-business UX |
| **F04** | Connected apps + typed platform config | ① | **new** | ADR-014 §3 — **foundation wave 2** extraction. No UI dependency |
| **F05** | Real OTP delivery via the sms.ir connection | ① | **blocker** | replaces the stdout `otpSender`. No UI dependency |
| **F06** | Workspace resolution + selector | ①→③ | new | 1 business ⇒ direct; N ⇒ selector (founder framework §8) |
| **F07** | Unified ＋ quick-add | ①→②→③ | new | lead · customer · opportunity · touch · info |
| **F08** | Guided post-create: lead → opportunity + next action | ①→②→③ | new | the demo's step 8 |
| **F09** | Flows — playbooks with suggested next step | ①→②→③ | **new** | ADR-015 |
| **F10** | Worker org resolution (drop `pilotOrgId`) | ① | fix | required once >1 business can exist |

**F04 and F05 — the critical path — have no UI dependency at all.** That is what makes the parallel split genuinely worth doing rather than just coordination overhead.

### F01 — Deploy scripts
Two idempotent scripts that build per-app images, push to the pool registry, and `docker compose up` the `arad-crm` slug. Must be **fire & forget**: return immediately after kicking off, log to a file, and be safe to re-run. Post-deploy smoke check hits each app's `smoke_path` from `deploy/apps.tsv`. Migration runs via the `migrate` compose profile **before** api/worker restart.

### F02 — Ops control plane
New Next app at `ops.aradap.ir`, mirroring `digital-menu/apps/web-ops`. 🔒 **Ops identity is a separate axis from tenant membership** (founder framework decision 15): an ops user is not an `org_members` row. Model follows Mizro — `users.is_ops` + `ops_user_roles`, where one user may hold several (`super_admin` · `onboarding_agent` · `support` · `finance`).

Screens: **businesses** · **users & membership** · **ops users** · **connected apps** · **platform settings** · **audit** · **integration inbox + replay**. 🔒 Every mutating ops action writes an `audit_log` row in the same transaction — ops crosses tenant boundaries by definition, so audit is the only control that survives a mistake.

Built on `@arad-crm/ui`, **not** Mizro's `ops-kit` (which would drag Mizro's design system into a greenfield brand — ADR-014 §3).

### F03 — Tenant provisioning & membership
Ops registers a business (= `organizations` row), creates users by phone, and assigns each to **one or more businesses** with a tenant role. `org_members` already carries `unique(organization_id, user_id)`, so multi-business membership needs **no schema change** — what's missing is the ops UI, the ops API, and login-time workspace resolution (F06).

### F04 — Connected apps + platform configuration
Three pieces, all mirroring Mizro:

- **`connections`** — provider registry with **envelope-encrypted credentials** (per-row DEK sealed by an env KEK). Credentials are 🔒 **write-only**: the UI only ever sees a masked hint; rotation means re-entering. First provider **sms.ir**; test + health + rotate in the ops UI.
- **`platform-config`** — a *typed* config registry (key, group, type, default, access level, hot-reload), not a loose key/value bag. Hot-reloadable keys change behaviour with no redeploy.
- **`connection_events`** — immutable credential-lifecycle audit, same transaction, scrubbed of secrets.

🔒 Decision: **foundation wave 2 fires here** (ADR-001 §2) — extract `platform-config` and `ops-tenant` as-is, and `connect` + `providers/*` + `ops-rbac` with port injection. Extracting Connect is real work, not a rename; it is still far cheaper and safer than writing envelope encryption a second time. Full extractability analysis in ADR-014 §3.

### F05 — Real OTP
Replace the stdout sender in [`auth-wiring.ts`](../../../../apps/api/src/lib/auth-wiring.ts) with a Connect-backed sender resolved from the active `communication` connection. **This is the hard launch blocker** — until it lands, a seller in the field cannot log in at all.

### F06 — Workspace resolution
On login, resolve the user's active memberships. One ⇒ set workspace and go to the dashboard. More than one ⇒ workspace selector. Zero ⇒ explicit "no access" state, never a blank dashboard. The resolved workspace scopes every subsequent request.

### F07 — Unified ＋ quick-add
One primary action opening: **lead · customer · opportunity · touch (call/message) · info (note/fact)**. The menu is driven by a typed registry so a vertical can add or hide entries without a redesign.
**Out of scope:** سفارش/orders — see §6.

### F08 — Guided post-create
Saving a lead does not dead-end. It offers, in one step: (a) create an opportunity for a product/service, and (b) schedule the next action with quick offsets ("2 weeks", "Saturday"). This is where the 🔒 open-lead invariant (dated next action **or** a close reason) is enforced in the UI, not just the API.

### F09 — Flows
A flow is a **named ordered playbook** attached to a lead, opportunity, or customer — "cold campaign for product X", "active upsell". When an entity is enrolled, the system **suggests** the flow's next step; the seller may accept or override manually. 🔒 E01 ships suggestion only — **no sending, no waits, no conditions** (product description §10/§15 defer the generic builder). ADR-015.

### F10 — Worker org resolution
[`pilotOrgId()`](../../../../apps/worker/src/processor.ts) selects the first organization in the table. Correct while exactly one business exists; wrong the moment ops can register a second. Resolve the org from the producer connection instead.

## 4. Dependencies & order

```
F01 ────────────────────────────────────────┐
F04 (wave-2 extraction) ─→ F05 (real OTP) ──┼─→ acceptance script §2
F02 (apps/ops) ─→ F03 (provisioning) ─→ F06 ┤
                                  F07 → F08 → F09
F10 (independent, required before business #2)
```

**F04 → F05 is the critical path**, and F04 is the largest single item because it carries the foundation extraction. Everything else can proceed in parallel — but nothing reaches a real seller until OTP delivery works, so if F04 slips, the whole epic slips.

**Sequencing note:** F02/F03 can be built against the existing fake OTP sender (an ops user logs in with a code from the logs), so the ops panel does *not* have to wait for Connect. Only the seller-facing acceptance step does.

## 5. Build tracks & the handover contract

Three tracks run in parallel, by different people:

| Track | Who | Produces |
|---|---|---|
| **① Core** | CTO / this repo | architecture, schema, API contracts, services, worker, deploy, ops backend |
| **② Design** | designer, prototype repo | interactive prototype: IA, screens, flows, states |
| **③ Surface** | main developer, this repo | the CRM UI — builds ②'s design against ①'s contracts |

### 5.1 The interface between them 🔒

**`packages/api-contracts` is the contract, and the running api's `/openapi.json` + `/docs` is how the other tracks read it.** CLAUDE.md's rule already forces the right order — *contract in `api-contracts` first, then the route* — so track ① produces the contract as a side effect of building, not as a separate deliverable.

Two rules keep the tracks from diverging:

- **① publishes each slice's contract *before* finishing that slice's implementation.** The designer designs against real field names, real enum values, real states — not invented ones. This is the single highest-leverage discipline in the whole arrangement.
- **③ never invents an endpoint.** If a screen needs data no contract exposes, that is a track-① request, not a fetch written in the app. The contracts-enums guard already blocks the most common form of this drift.

### 5.2 Vertical slices, not layers

Track ③ starts as soon as *a slice's* contract exists — waiting for all of ① would make this sequential with extra coordination cost. Slice order:

1. **auth + workspace** (F05, F06) — login, session, "which business am I in"
2. **quick-add + guided post-create** (F07, F08) — the demo's steps 7–8
3. **flows** (F09) — suggestion surfacing

Each slice is independently demoable.

### 5.3 Design investment is not uniform

- **Tenant app** (`mizro-crm.aradap.ir`) — full design pass in the prototype. Sellers use it daily on a phone, in the field; the <2-minute visit log lives or dies on it.
- **Ops panel** (`ops.aradap.ir`) — **no design pass.** Built directly on `@arad-crm/ui` primitives (ADR-014 §2 — deliberately *not* Mizro's `ops-kit`). Arad staff, desktop, low volume. Spending designer time here buys nothing; Mizro made the same call.

### 5.4 Definition of ready for track ③

Before the surface developer starts a slice:

- [ ] contracts for the slice merged in `packages/api-contracts`, visible at `/docs`
- [ ] `pnpm services:up && pnpm db:seed` yields a working local org, user, and login
- [ ] the prototype for that slice is marked settled (IA + flows), per [ui-ux-handover.md](../../../product/ui-ux-handover.md) §6
- [ ] the slice's states are agreed: empty · loading · error · **no-permission**

### 5.5 What prototypes reliably omit — track ③ owns these

Named explicitly because they are where this hand-off model usually leaks. The existing handover doc already flags most of them as deliberately absent from the mock:

- empty / loading / error / no-permission states
- **role-gated rendering** — a seller must never see another seller's pipeline or org financials
- 🔒 **money is a digit-string on the wire** (`rialStringSchema`), never a JS `number` — display Toman, store Rial
- fa-IR + RTL correctness, `Intl` date formatting, tabular numerals
- optimistic-update and offline behaviour on the seller PWA
- the 🔒 open-item invariant enforced *in the UI*: an open lead cannot be saved without a dated next action or a close reason

### 5.6 Components land in the kit, not the app

Reusable primitives the surface developer builds go into `@arad-crm/ui`; only screens live in the app (ADR-012's three layers). Otherwise the shared kit never materializes and vertical #2 starts from zero — the exact outcome ADR-012 exists to prevent.

## 6. Out of scope (deliberate)

- **Orders (سفارش)** — Mizro's sale is a subscription payment event, not a manual order. Orders land with the payments/fulfillment work identified in the business-architecture gap review, not here. The ＋ registry is built to accept them later without redesign.
- **Automation/messaging engine** — F09 suggests; it does not send. Sending arrives after Connect is proven.
- **web-admin's fate** — the demo needs neither its screens nor its host. Merge-vs-separate-host is an open decision in ADR-013 §2; it does not block E01.
- **Per-tenant connections** — `connections` is platform-scoped in E01 (Arad operates SMS for all tenants). ADR-014 §3 records the revisit trigger.

## 7. Definition of done

- The §2 script runs end to end on production hosts, from a clean pool.
- `pnpm verify` green, including the `*.db.test.ts` tier.
- An ops action that creates a business, a user, or a connection writes an `audit_log` row.
- A credential never appears in a log, an API response, or an image layer (`secret-grep` + review).
- A second business can be registered without any code change.
