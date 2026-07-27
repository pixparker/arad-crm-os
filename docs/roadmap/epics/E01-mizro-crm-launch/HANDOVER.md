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

pnpm services:up                       # postgres :5433 + redis :6380 + migrate
SEED_OWNER_PHONE=09163349938 pnpm db:seed   # org آراد + تهران + commission plan + you as owner_admin

pnpm dev:api                           # :4100   — API + Scalar docs at /docs
pnpm dev:seller                        # :3101   — seller PWA
pnpm dev:admin                         # :3102   — manager console
```

**Log in:** enter the seeded phone at `localhost:3101/login`, then read the OTP code from the api's terminal output (`OTP (fake sender)`). Until F05 lands, that is the only way to get a code — by design, not breakage.

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

**Do not start at F01.** Start where the risk is.

**F04 (Connect + platform-config extraction) is the critical path and the largest single item.** It gates F05, and nothing reaches a real seller until OTP delivery works. If F04 slips, the epic slips. Everything else is parallelizable around it.

Suggested first week:

1. **Read + run** (§1, §2) — get `pnpm verify` green locally, log in with a fake OTP.
2. **F04 step 1: extract the two clean packages** — `platform-config` and `ops-tenant` from `digital-menu/packages/`. Zero product coupling; a real extraction with no design decisions, so it's the ideal way to learn the foundation two-commit flow.
3. **F04 step 2: `connect` + `providers/sms` with port injection.** This is the hard part — `@mizro/db` and `@mizro/config` must become injected ports, the way `auth-otp` already is (read `foundation/packages/auth-otp` first; it is the worked example).
4. **F05** — swap the stdout `otpSender` in [`apps/api/src/lib/auth-wiring.ts`](../../../../apps/api/src/lib/auth-wiring.ts) for a Connect-backed sender.

In parallel, if there are two developers: **F02/F03 (ops panel + provisioning) do not need Connect.** An ops user can log in with a fake OTP from the logs the whole time they're built.

## 5. Non-obvious things (found the hard way this session)

Things you would otherwise lose a day to:

- **`tsx` is a runtime dependency, not a dev one.** Library packages ship raw `.ts` (`main: ./src/index.ts`, no build step), so `tsx` *is* the production interpreter. Moving it back to `devDependencies` makes `pnpm deploy --prod` prune it and the container won't boot.
- **Both Next apps need `output: 'standalone'` AND `outputFileTracingRoot` at the monorepo root.** Without the tracing root, Next traces only the app's own subtree and silently omits the workspace packages — the standalone server then crashes on a missing `@arad-crm/*` import.
- **Never read raw `x-forwarded-for`.** Behind Arvan→Caddy it is a client-prependable proxy *chain*. Use [`clientIp()`](../../../../apps/api/src/lib/client-ip.ts), which reads only `X-Real-IP`.
- **Cookie deletion must mirror the cookie's `domain`.** `COOKIE_DOMAIN` is unset in dev and set in prod, so a mismatch here is invisible locally and breaks logout in production.
- **`pilotOrgId()` in the worker selects the first organization in the table.** Correct today; wrong the moment ops can register a second business. That is F10, and it must land before business #2 exists.
- **`audit_log` is currently written in only two places** (org team-add, lead assign). Opportunity stage/owner/amount changes are *not* audited. If you touch those paths, add the audit row — business-architecture §11 rule 11 requires it.
- **The Mizro event loop already works and is verified.** Signed outbox → HMAC inbox → dedupe → commission. Don't "fix" it; if you change the envelope, coordinate with `digital-menu`'s `crm_outbox`.
- **Docker must be running** for `*.db.test.ts` — that tier is real Postgres, not mocks.

## 6. Working agreement

- Branch off `main`, PR into `main`. `pnpm verify` green is the bar.
- **Contract first.** A new endpoint starts as a Zod contract in `api-contracts`; the surface track reads it from `/docs`. If a screen needs data no contract exposes, that is a track-① request — not a fetch invented in the app (README §5.1).
- **Reusable primitives go into `@arad-crm/ui`, only screens into the app** (README §5.6). Otherwise the shared kit never materializes and vertical #2 starts from zero.
- Ask early about anything marked 🔒 — those are locked invariants with reasons recorded in ADRs, and working around one silently is the only truly expensive mistake available here.

## 7. Known-open decisions (don't resolve these alone)

- **`web-admin`'s fate** — fold into the vertical app as role-gated routes, or give it its own tenant host. ADR-013 §2; decide at E02.
- **Arvan `trusted_proxies` ranges** — until filled in, all sellers share one OTP rate-limit bucket (`OTP_MAX_REQUESTS_PER_IP_HOUR` is raised to compensate). ADR-013 §5.
- **Phase-0 process lock** — the commission percentage in [`phase-0-process-lock.md`](../../../product/phase-0-process-lock.md) §5 is still blank. The seed ships 15% as a placeholder; it is the founder's number to supply.
