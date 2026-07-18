# ADR-008 — API style & contracts

> **Status:** `in-review` · **Owner:** CTO · **Date:** 2026-07-18
> 🔒 Core is headless / API-first — vertical apps are just API clients (product doc §5).

## Decision

- **REST under `/v1`**, Hono. **All request/response/enum shapes live in `@arad-crm/api-contracts` (Zod) — the single source of truth.** OpenAPI generated at runtime via `@hono/zod-openapi`; Scalar reference UI at `/docs` (non-prod). 🔒 Enum/type re-declaration outside contracts is CI-banned (Mizro guard rule ported).
- **Auth transport:** session cookie + CSRF middleware for the two web apps; service-token auth for `POST /v1/integrations/events` (ADR-006). Middleware set ported from Mizro: `session` · `csrf` · `cors` · `rate-limit` · `correlation-id` · `require-org`.
- **Idempotency-Key header (required) on seller-app mutating endpoints** — visit logging, next-action completion, opportunity moves. Field network is flaky; retries must be safe. Server stores `key → response` with TTL; replays return the stored response. (Mizro precedent: callback dedupe; here it's generalized for the <2-min field flow.)
- **Errors:** `@arad/errors` shape (code + message + details), fa-facing messages via i18n catalog; correlation id echoed.
- **Pagination:** cursor-based, standard `{items, next_cursor}` — no offset pagination on unbounded lists.
- **Route organization mirrors modules** (ADR-003): `apps/api/src/modules/<module>/routes.ts`, composed in `app.ts`. If an internal-ops surface arrives later, the `v1/` ↔ `internal-ops/` **import firewall** applies (Mizro pattern).
- **Versioning:** additive-only within `/v1`; breaking changes = `/v2` (not expected before SaaS phase).

## Options rejected

- **GraphQL / tRPC** — headless-for-many-verticals favors plain REST+OpenAPI (external consumability, curlability, contract docs for free); tRPC couples clients to TS internals; GraphQL is unjustified server complexity here.
- **Codegen'd clients (ts-rest/orval)** — monorepo + shared Zod contracts already give end-to-end types; add codegen only if an external vertical team appears.

## Revisit triggers

External vertical developers (Phase 6) → published OpenAPI + generated SDKs; webhook-out subscriptions (Phase 5).
