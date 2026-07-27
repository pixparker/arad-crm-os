# ADR-013 — Deployment topology, domains & origins

> **Status:** `approved` (founder, 2026-07-27) · **Owner:** CTO · **Date:** 2026-07-27
> Supersedes the domain map in `docs/founder/arad-crm-os-repository-and-deployment-framework-fa.md` §7/§19 (`aradcrm.ir` — **not our domain**). Extends [ADR-002](ADR-002-stack-tooling-deploy.md) (deploy target) and [ADR-005](ADR-005-identity-authz.md) (session cookie).

## Context

The founder framework doc locks the *shape* (one app per surface, independent build/deploy, subdomain per surface, shared reverse proxy in phase 1) but names `aradcrm.ir`, which Arad does not own. The real target is **`aradap.ir`** on the existing **mvp-pool** framework — the same VPS-pool tooling that runs Mizro (`digital-menu/deploy/`), where each slug gets its own Postgres role, Redis DB index, env file and compose stack behind a shared Caddy.

## Decision

### 1. Domain map 🔒

| Host | Serves | App | Audience |
|---|---|---|---|
| `mizro-crm.aradap.ir` | The tenant CRM surface — **the installable PWA** | `web-seller` | tenant users (mobile, field) |
| `ops.aradap.ir` | **Arad control plane** | `apps/ops` | Arad staff (desktop) |
| `api.aradap.ir` | CRM API gateway | `api` | both web apps + producers |
| `id.aradap.ir` | Identity — **reverse-proxy alias onto `api:/v1/auth`**, not a separate service | `api` | login flows |
| `aradap.ir` | product site | — | deferred |

**Host ≠ app ≠ vertical.** `mizro-crm` is a *host name* chosen by the founder; the app behind it is the generic vertical CRM surface and the vertical package stays industry-shaped (subscription sales), not Mizro-shaped. When a second tenant arrives on the same vertical, add a host — one Caddy block, no code, no rename.

**Single-label subdomains are deliberate.** A wildcard `*.aradap.ir` certificate covers exactly one label; `crm.mizro.aradap.ir` would need a second wildcard. Hyphenated single labels (`mizro-crm`) keep one cert for every surface. This is why the founder doc's `clinic.` / `insurance.` pattern generalizes here as `<vertical>-crm.aradap.ir`.

### 2. `ops.aradap.ir` serves a real `apps/ops` — **revised 2026-07-27**

> **Superseded.** The original decision mapped `ops.aradap.ir` to `web-admin` and deferred `apps/ops` to tenant #2, following ADR-003's "in the pilot, org admin *is* Arad." [demo-01](../../founder/demos/demo-01-mizro.md) overrides this: the founder's walkthrough registers businesses, creates users across businesses, and connects providers from the ops panel — a genuine control plane, on day one.

`ops.aradap.ir` → **`apps/ops`** (new). It is Arad's control plane, not a tenant surface: businesses, users, connected apps, platform settings, audit, event-inbox replay. 🔒 Ops identity is a **separate axis** from tenant membership — an ops user is not an `org_members` row (founder framework decision 15). Design in [ADR-014](ADR-014-ops-control-plane-tenancy-connected-apps.md).

The host naming rationale survives unchanged and is now literally true: `ops.aradap.ir` means "Arad's internal console" permanently.

**Open decision — `web-admin`.** Its screens (manager dashboard, leads import, commission approval, team, performance) are *tenant* surfaces, so they belong with the tenant app, not on `ops.`. Two options, neither blocking E01 (the demo needs neither):

- **(recommended)** fold them into the vertical CRM app as role-gated routes — matches founder framework §5.1's one-app-per-vertical model and the demo's single-login flow;
- or give it its own tenant host and keep the desktop-dense archetype split that ADR-003/009 justified.

Decide at E02, before the manager surfaces get real pilot traffic — moving them later means moving a URL for an existing audience, which §1 exists to prevent.

### 3. Origins, session & CORS

- **Session cookie** `ac_session` is issued on **`Domain=.aradap.ir`**, `httpOnly`, `Secure`, `SameSite=Lax` — so one login covers every surface without an SSO handshake between origins (founder doc §7.1: "authentication must be unified, but each app keeps its own origin and PWA").
- `SameSite=Lax` is sufficient because every surface is same-site under `aradap.ir`. It must **not** be relaxed to `None` — that would widen CSRF exposure for no gain.
- `WEB_ORIGINS` (CORS allowlist, credentialed) = `https://mizro-crm.aradap.ir,https://ops.aradap.ir`. `'*'` stays illegal with `credentials:true`.
- **Producer webhooks send no `Origin`** — CORS never applies to them; they are authenticated by HMAC alone (ADR-006).
- A future **custom domain** (founder doc §8.1) terminates at the same Caddy and must map to a tenant *before* auth, never after — it may not bypass tenant isolation.

### 4. mvp-pool mapping — one bundled slug for the pilot

**Slug `arad-crm`, mvpool type `full-stack-queue`**, holding every service (`api`, `worker`, `web-seller`, `ops`, and `web-admin` while it exists — §2) on one compose stack with one `.env`, one Postgres DB+role, one Redis DB index. Caddy routes by `Host` header to compose service names on the shared `mvpool_edge` network — Mizro's proven production shape (`digital-menu/deploy/compose.yaml` + `caddy/mizro.caddy`).

This is a deliberate reading of founder doc §6, which requires that the *architecture* not force joint deployment — and explicitly allows the opposite as a starting choice:

> تیم می‌تواند برای شروع همه اپ‌ها را با یک Release هماهنگ منتشر کند، اما معماری نباید این حالت را اجباری کند.

The architecture keeps independence where it counts: **per-app `Dockerfile.<app>`, per-app images, per-app build filters** (`pnpm --filter @arad-crm/web-seller build`). What the pilot gives up is only per-app *release cadence* — all four images are built from one commit and share `IMAGE_TAG`, so `mvpool rollback <tag>` stays atomic and correct.

**Splitting later is a compose + DNS change, not a code change:** move a service to its own slug, give it a `container_name`, point its Caddy block at that name. No app code, no URL, no image changes. Trigger: an app needing independent release cadence, its own scaling, or its own host.

**Own database 🔒** — `arad_crm` role + DB on the pool's shared Postgres, never Mizro's (ADR-002). Own Redis DB index.

**Registry** — `deploy/apps.tsv` mirrors Mizro's single-source-of-truth pattern (app, slug, host, smoke path, change triggers) so per-app build/deploy scripts read one file rather than hardcoding names.

### 5. TLS, edge & client IP

**`aradap.ir` is registered in ArvanCloud** (confirmed 2026-07-27). TLS therefore terminates at the Arvan edge and the origin serves plain HTTP — every Caddy block is `http://<host>`, matching Mizro's production shape. DNS records are created with `"cloud": true` (proxied) by `deploy/dns-arvan.sh ensure-all <pool-ip>`, ported from Mizro's script.

**Client IP 🔒.** Behind Arvan → Caddy → api, `X-Forwarded-For` is a proxy *chain* and is client-prependable. It must never be used as an identity. Two rules:

1. Caddy sets `X-Real-IP: {client_ip}` via `header_up` on the api-facing blocks. Because `header_up` overwrites, a client cannot forge it.
2. The api reads **only** `X-Real-IP` (`apps/api/src/lib/client-ip.ts`), falling back to the left-most XFF entry for local dev where no Caddy is in front.

`{client_ip}` resolves to the real visitor only once Caddy's `trusted_proxies` lists Arvan's edge ranges. **Until it does, every request resolves to an edge IP and all sellers share one OTP rate-limit bucket** — sized for a single user (30/hour) it would lock the team out of login. `OTP_MAX_REQUESTS_PER_IP_HOUR` is therefore configurable; the per-mobile cap (5/hour) remains the real per-user protection and is unaffected.

## Options rejected

- **Path-based verticals** (`app.aradap.ir/mizro`) — founder doc §7.1 forbids it; also breaks PWA scope isolation (§9), since one service worker would control another vertical's routes.
- **Nested subdomains** (`crm.mizro.aradap.ir`) — second wildcard cert per vertical, for no addressing benefit.
- **A separate identity service at `id.`** — ADR-005's auth is a module inside `api`; a proxy alias gives the founder doc's `id.` origin with zero code split. Extract only if identity ever needs independent scaling.
- **One origin for seller + manager** — different archetypes (mobile PWA vs dense desktop), and a shared service worker would cache manager routes onto sellers' phones.
- **`ops.aradap.ir` deferred until `apps/ops` exists** — leaves Arad staff on a URL that must later move. Naming the host by *audience* now costs nothing and prevents that.

## Revisit triggers

- First non-Arad tenant → build `apps/ops`, split roles (§2 above).
- Vertical #2 → `<vertical>-crm.aradap.ir` joins the map; confirm the wildcard cert still covers one label.
- Custom-domain / white-label plan → tenant resolution at the edge (founder doc §8.1).
- Traffic or blast-radius growth → per-app slugs move to separate pool hosts; the URL map is unchanged by design.
