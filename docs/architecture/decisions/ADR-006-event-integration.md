# ADR-006 — Event integration & the Mizro/Commerce contract

> **Status:** `in-review` · **Owner:** CTO · **Date:** 2026-07-18
> 🔒 Locked upstream: thin, event-based integration; own DB; sale = a real payment event. The CRM is system-of-record for **sales activity**; Mizro/Commerce for **service + payment**.

## The contract package — `@arad/platform-events`

Born in `arad-foundation` (new code, no extraction risk); **the CRM owns the contract, producers implement it.** This closes today's gap: Commerce OS's doc defines no events — the contract must not live in any single product's head.

**Envelope (v1):** `{ id (uuidv7), type, version, occurred_at, producer ("mizro"|"commerce"|…), payload, meta: { correlation_id, attribution_ref? } }` — Zod-schema'd per event type, semver'd; additive changes only within v1.

**Events in (producers → CRM):** `payment.received` · `payment.refunded` · `business.created` · `subscription.created|activated|renewed|upgraded|cancelled|expiring` · `menu.published` · `onboarding.completed` · lead/form events (E49's public form becomes a lead source). Payment payloads carry **net-collected amount fields** (bigint Rial as string) — the commission calc base (ADR-007).

**Commands out (CRM → Mizro partner API):** `create-demo` · `create-business-draft` · `request-onboarding` · `create-referral-link` · `create-subscription-offer` — authenticated service-token REST calls to new `/v1/partner/*` endpoints on Mizro's api.

## Transport & reliability

- **Delivery:** producer → `POST /v1/integrations/events` on CRM api. **HMAC-SHA256 signature + timestamp header** (Mizro's signed-token util pattern), shared secret per producer.
- **Idempotent inbox 🔒:** `integration_events_inbox` with `UNIQUE (producer, event_id)` — duplicates ack'd as no-ops. Handlers run via BullMQ (worker), each handler idempotent; failures retry with backoff → **DLQ status + ops replay** endpoint.
- **At-least-once + reconciliation:** producer side retries (BullMQ job off Mizro's existing `platform_events`/hooks — no full outbox rebuild needed there); CRM runs a **daily reconciliation sweep** against a Mizro partner checkpoint endpoint (Mizro's own wallet-reconciliation pattern) so lost webhooks can't lose sales. 🔒 No event may be processed into money twice — commission idempotency is the second gate (ADR-007).
- **No message broker** (Kafka/Rabbit): two parties on one host; HTTP + inbox + sweeps is the right weight.

## Attribution linchpin 🔒

- Per-seller **immutable demo links/QR** (`attribution_links`: seller, token, created_at — never reassigned).
- Demo/lead URLs carry `?ref=<token>`; **Mizro stamps `attribution_ref`** into the business draft/subscription and echoes it in every related event's `meta`.
- CRM keeps **append-only `attribution_claims`** (org, account, seller, token, first_touch_at). Conflict rule (e.g. first-touch within validity window) is a **Phase-0 locked parameter**; conflicts and manual overrides go to the manager dispute queue with audit — never silent edits.
- `payment.received` + `attribution_ref` (fallback: claim lookup by business ref) → resolves seller → commission event.

## Mizro-side epic (needs a digital-menu roadmap slot — founder decision)

1. Event emitter job (hook points: wallet `markAvailable`, subscription lifecycle, publish, onboarding) with retry + signing.
2. `/v1/partner/*` command endpoints + service-token auth + checkpoint endpoint for reconciliation.
3. `?ref=` stamping through demo link → business draft → subscription → events.

## Options rejected

- **Shared DB / direct DB reads** — forbidden upstream 🔒.
- **Redis pub/sub as transport** — couples infra, no durability across the product boundary.
- **Full transactional outbox in Mizro now** — their idempotency-ledger + retry pattern reaches the same guarantee at pilot scale; outbox is the upgrade path if event volume grows.

## Revisit triggers

Commerce OS Sprint 0 (adopts contract; second producer) · event volume growth → outbox/broker upgrade · webhooks-out to third parties (Phase 5).
