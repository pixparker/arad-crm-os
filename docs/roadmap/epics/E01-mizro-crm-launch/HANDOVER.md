# E01 — developer handover

> **To:** the developer(s) building E01 · **From:** CTO · **Date:** 2026-07-27
> **Read [`README.md`](README.md) first** — it is the epic. This doc is how to get productive on day one.

## 0. Blocker for whoever hands this over ⚠️

**This repo is 1 commit ahead of `origin/main`, and none of the E01 architecture work is committed.** A developer cloning today gets a repo without ADR-013/014/015, the epic, or the deploy layer. Commit and push before sharing.

Verified working, so *don't* worry about these:

- `github.com/pixparker/arad-foundation` exists and its `HEAD` (`092250d`) **matches this repo's submodule pointer exactly** — a fresh `--recurse-submodules` clone resolves correctly.
- `.gitmodules` uses the relative URL `../arad-foundation.git`, which resolves as a sibling of this repo's origin. Correct as written.

## 1. Get it running (~10 minutes)

Prerequisites: **Node ≥22**, **pnpm 9.15.0** (via corepack), **Docker running**.

```bash
git clone --recurse-submodules git@github.com:pixparker/arad-crm-os.git
cd arad-crm-os

# If you cloned without --recurse-submodules:
#   git submodule update --init --recursive
# foundation/ MUST be populated — empty ⇒ pnpm install fails on unresolved @arad/*

corepack enable && pnpm install

cp .env.example .env
# Set JWT_SECRET (min 32 chars):  openssl rand -base64 32
# Leave SMS_PROVIDER=fake for now — OTP codes print to the api's stdout.

pnpm services:up                       # shared dev stack + provision + migrate
SEED_OWNER_PHONE=09163349938 pnpm db:seed   # org آراد + تهران + commission plan + you as owner_admin

pnpm dev:api                           # :6100   — API + Scalar docs at /docs
pnpm dev:seller                        # :6101   — seller PWA
pnpm dev:admin                         # :6102   — manager console
pnpm dev:ops                           # :6103   — Arad control plane (ADR-014)
```

**Ops panel:** it needs an ops user, and ops roles are granted from inside the
panel — so the first one comes from the seed:

```bash
SEED_OPS_PHONE=09163349938 pnpm db:seed   # + super_admin on the ops axis
```

🔒 That phone is now BOTH a tenant user (if you also seeded it as owner) and an
Arad operator — two rows on two axes, deliberately. Logging into
`localhost:6103` gives no workspace, and logging into `:6101` gives no control
plane.

**Log in:** enter the seeded phone at `localhost:6101/login`, then read the OTP code from the api's terminal output (`OTP (fake sender)`). That is the dev path and stays the dev path: `SMS_PROVIDER=fake` never sends. For real delivery set `SMS_PROVIDER=connect` + `CONNECT_MASTER_KEY`, then register the sms.ir connection in the ops panel — the api refuses to boot with `connect` and no valid master key, which is deliberate (a silently-fake OTP path is how an outage hides).

Ports are deliberately offset from Mizro's (api 4000, web 3001-3006, pg 5432, redis 6379) so both stacks run side by side. **Never reuse Mizro's ports.**

Sanity check before you write anything: `pnpm verify` (biome → typecheck → 4 invariant guards → secret-grep → tests, including a real-Postgres tier).

## 2. Read in this order

| # | Doc | Why |
|---|---|---|
| 1 | [`CLAUDE.md`](../../../../CLAUDE.md) | the hard rules, one page |
| 2 | [`README.md`](README.md) | the epic — features, tracks, acceptance script |
| 3 | [`docs/architecture/00-overview.md`](../../../architecture/00-overview.md) | system shape + ADR index |
| 4 | ADR-003, ADR-008 | module boundaries · contract-first API |
| 5 | ADR-013 / 014 / 015 | deployment+domains · ops control plane · flows |
| 6 | [`docs/product/product-description.md`](../../../product/product-description.md) §7, §13 | the core loop and why it is the core loop |
| 7 | [`docs/founder/demos/demo-01-mizro.md`](../../../founder/demos/demo-01-mizro.md) | the acceptance script in the founder's words |

Skim `docs/founder/معماری کسب و کار.md` (business/domain model) too — it defines مخاطب / لید / فرصت / پرداخت precisely, and §11's twelve rules are the domain invariants.

## 3. Rules that will fail your PR

All CI-enforced by `pnpm verify` — these are not style preferences:

1. 🔒 **Tenant queries go through `orgScope(table.organizationId, orgId)`.** Escape hatch is a comment (`// @invariant-allow: orgScope-cross-tenant <reason>`) and it is for ops/aggregate jobs only.
2. 🔒 **Request/response/enum shapes live in `packages/api-contracts`.** No `z.enum` anywhere else. **Contract first, then the route** — this is also the track ①→③ interface (README §5.1).
3. 🔒 **Money is `bigint` Rial end-to-end; a digit-string on the wire** (`rialStringSchema`). Never a float, never a JS `number`. Display Toman, store Rial.
4. 🔒 **Commission entries and audit rows are append-only.** Corrections are reversal/adjustment rows — never UPDATE, never DELETE.
5. 🔒 **A sale is a payment event from a producer**, never a manual toggle. `status='won'` is not settable through the API.
6. **Module boundaries:** `apps/api/src/modules/<name>/`, cross-module access only via the other module's `index.ts`. No deep imports, no cross-module writes.
7. **Foundation changes land in `arad-foundation` first**, then bump the pointer here (two commits — see CONTRIBUTING).
8. **Persian-first:** fa-IR copy, RTL, `Intl` for dates, UTC `timestamptz` in storage.
9. `pnpm db:generate` after **any** `packages/db/src/schema.ts` change, or the migration-drift guard fails.

## 4. Where to start

**Track ① is built (2026-07-28) — F01 through F11, `pnpm verify` green.** What remains is not more backend:

1. **Prove F05 against a real sms.ir account.** Everything else is tested; this is not. Set `SMS_PROVIDER=connect` + a `CONNECT_MASTER_KEY`, register the connection in the ops panel, add its OTP template id, then press «آزمایش» and «ارسال آزمایشی». Until a phone actually rings, treat OTP delivery as unproven.
2. **Run the deploy scripts against the pool for the first time.** Fill a copy of `deploy/.env.production.example`, run **`pnpm env:check <file>`** (same schema the api boots with, plus the production-only rules; prints key names, never values), upload it to `/srv/apps/arad-crm/.env`, then deploy — the script re-checks those keys exist on the host *before* it builds, so a missing `CONNECT_MASTER_KEY` costs a second rather than a full build-ship-restart. `bash scripts/deploy/deploy.sh ops --dry-run` prints the plan; the real run also needs the `arad-crm` slug provisioned and the DNS records live. The scripts are written, syntax-checked and dry-run-verified, never executed against a host.
3. **Track ③ (the seller UI)** — the workspace selector, the ＋ sheet and the guided post-create screen, against contracts that are already merged and visible at `/docs`. Wait for the prototype to settle the IA (README §5.1).

The contracts a surface developer needs: `GET /v1/auth/workspaces` + `POST /v1/auth/workspace` (F06), `GET /v1/quick-add` (F07), `GET /v1/leads/:id/guidance` + `POST /v1/leads/:id/guided-followup` (F08), `/v1/flows/*` (F09), and the entity reads behind them (F11): `POST /v1/accounts`, `GET /v1/accounts/lookup`, `GET /v1/leads/:id`, `GET /v1/opportunities/:id`.

## 5. Non-obvious things (found the hard way this session)

Things you would otherwise lose a day to:

- **`tsx` is a runtime dependency, not a dev one.** Library packages ship raw `.ts` (`main: ./src/index.ts`, no build step), so `tsx` *is* the production interpreter. Moving it back to `devDependencies` makes `pnpm deploy --prod` prune it and the container won't boot.
- **Both Next apps need `output: 'standalone'` AND `outputFileTracingRoot` at the monorepo root.** Without the tracing root, Next traces only the app's own subtree and silently omits the workspace packages — the standalone server then crashes on a missing `@arad-crm/*` import.
- **Never read raw `x-forwarded-for`.** Behind Arvan→Caddy it is a client-prependable proxy *chain*. Use [`clientIp()`](../../../../apps/api/src/lib/client-ip.ts), which reads only `X-Real-IP`.
- **Cookie deletion must mirror the cookie's `domain`.** `COOKIE_DOMAIN` is unset in dev and set in prod, so a mismatch here is invisible locally and breaks logout in production.
- **Org resolution for producer events is now `producer_bindings`** (F10, replacing `pilotOrgId()`). With no binding and exactly one org it falls back and warns; with several it refuses and the event lands in the failed inbox. Registering a second business therefore means binding its producer in the ops panel — the refusal is the reminder.
- **`audit_log.organization_id` is nullable now.** NULL means a platform-scoped ops action (a connection, a platform setting, an ops-role grant) that belongs to no tenant. Tenant writes still always carry the org, and the column keeps the table inside the org-scope guard's derived list.
- **Seller visibility is one rule, in [`accounts/service.ts`](../../../../apps/api/src/modules/accounts/service.ts).** Territory **or** an assignment/ownership that overrides it — the second half exists because a manager can assign across territories on purpose, and refusing the read would hand a seller a lead they cannot open. Every detail read (account, lead, opportunity) goes through it; if you add another entity page, use it rather than re-deriving the rule.
- **Tenant-side audit now has a helper: [`lib/tenant-audit.ts`](../../../../apps/api/src/lib/tenant-audit.ts)** (`writeAudit(tx, c, actor, …)`), the twin of `ops/audit.ts`. Covered: lead assign · lead pick · guided follow-up · opportunity stage/lost · `account.mizro_linked`. The rule for adding more is business-architecture §11 rule 11 — if a write changes **ownership, pipeline state, or the attribution bridge**, it takes an audit row in the same transaction. Activity logging is deliberately exempt (activities *are* the log).
- **The Mizro event loop already works and is verified.** Signed outbox → HMAC inbox → dedupe → commission. Don't "fix" it; if you change the envelope, coordinate with `digital-menu`'s `crm_outbox`.
- **Docker must be running** for `*.db.test.ts` — that tier is real Postgres, not mocks.
- **The demo script is a test now.** `demo-01-acceptance.db.test.ts` walks §2 steps 3–8 in the founder's order; if you change ops provisioning, OTP, workspace resolution, the ＋ registry or the guided follow-up, that file is where you find out. It swaps `authDeps.otpSender` for a capturing one (codes are hashed at rest) and restores it in `afterAll`.
- **`/v1/health` is liveness, `/v1/health/ready` is readiness.** The deploy smoke check and the compose healthcheck both use `/ready`, which touches Postgres and Redis; `/v1/health` answers 200 from a process that cannot reach its database. 🔒 Readiness returns a fixed vocabulary (`unreachable`), never the driver error — those carry the connection string, and the endpoint is unauthenticated.

## 6. Working agreement

- Branch off `main`, PR into `main`. `pnpm verify` green is the bar.
- **Contract first.** A new endpoint starts as a Zod contract in `api-contracts`; the surface track reads it from `/docs`. If a screen needs data no contract exposes, that is a track-① request — not a fetch invented in the app (README §5.1).
- **Reusable primitives go into `@arad-crm/ui`, only screens into the app** (README §5.6). Otherwise the shared kit never materializes and vertical #2 starts from zero.
- Ask early about anything marked 🔒 — those are locked invariants with reasons recorded in ADRs, and working around one silently is the only truly expensive mistake available here.

## 7. Known-open decisions (don't resolve these alone)

- **`web-admin`'s fate** — fold into the vertical app as role-gated routes, or give it its own tenant host. ADR-013 §2; decide at E02.
- **Arvan `trusted_proxies` ranges** — until filled in, all sellers share one OTP rate-limit bucket (`OTP_MAX_REQUESTS_PER_IP_HOUR` is raised to compensate). ADR-013 §5.
- **Phase-0 process lock** — the commission percentage in [`phase-0-process-lock.md`](../../../product/phase-0-process-lock.md) §5 is still blank. The seed ships 15% as a placeholder; it is the founder's number to supply.
