# Mizro → CRM producer integration (handoff spec)

> **Status:** `approved` contract (ADR-006) · consumer side LIVE in this repo · producer side = a small epic in `digital-menu` (needs a roadmap slot — founder).
> Contract source of truth: `@arad/platform-events` (foundation). This doc is the implementation guide for the Mizro side.

## Transport

`POST https://<crm-host>/v1/integrations/events` (dev: `http://localhost:6100`)

Headers 🔒:
- `content-type: application/json`
- `x-arad-timestamp`: unix seconds (rejected if |skew| > 300s)
- `x-arad-signature`: hex `HMAC-SHA256(secret, "<timestamp>.<rawBody>")` — shared secret = CRM env `MIZRO_WEBHOOK_SECRET`

Body = the **envelope** (see `@arad/platform-events` `eventEnvelopeSchema`, strict):

```json
{
  "id": "<uuidv7 — the idempotency root, NEVER reused>",
  "type": "payment.received",
  "version": 1,
  "occurred_at": "2026-07-18T10:00:00.000+03:30",
  "producer": "mizro",
  "payload": { … },
  "meta": { "correlation_id": "…", "attribution_ref": "<?ref token if known>" }
}
```

Responses: `200 {accepted, deduped}` (deduped=true ⇒ already have it — STOP retrying) · `400` invalid envelope/payload (fix producer bug, do not retry) · `401` signature/timestamp · `503` CRM secret unconfigured. **Retry policy:** at-least-once with backoff on network/5xx; the CRM inbox dedupes on `(producer, id)` and the commission ledger double-dedupes on money 🔒 — replays are always safe.

## Events to emit (hook points in digital-menu)

| Event | Emit at (Mizro hook) | Payload notes |
|---|---|---|
| `payment.received` | wallet ledger `markAvailable` / subscription payment confirmed (E53) | `payment_id` (wallet tx id) · `business_ref` (business id) · `amount_rial`, **`net_amount_rial`** (🔒 commission calc base: net collected after tax/refund/pass-through — producer computes, CRM never re-derives) · `currency:"IRR"` · `method` · `paid_at` · `subscription_ref?` · `package_ref?` · `attribution_ref?` |
| `payment.refunded` | refund/reversal recorded | `payment_id` (same as original!) · `amount_rial` · `refunded_at` · `reason?` |
| `business.created` | business/draft created (esp. via demo link) | `business_ref` · `name` · `business_type?` · `phone?` · `attribution_ref?` |
| `subscription.created/activated/renewed/upgraded/cancelled/expiring` | E52 lifecycle + expiry sweep | `subscription_ref` · `business_ref` · `package_ref?` · `period?` · `ends_at?` |
| `menu.published` | publish pipeline commit | `business_ref` · `menu_ref` · `published_at` |
| `onboarding.completed` | E48 onboarding done | `business_ref` · `completed_at` |
| `lead.captured` | E49 public form submit | `lead_ref` · `source:"home_form"` · `business_name?` · `phone?` · `requested_features?` · `captured_at` |

## Attribution stamping 🔒 (the linchpin)

Seller demo links look like `<DEMO_LINK_BASE>?ref=<token>` (CRM issues per-seller immutable tokens). Mizro must:
1. Persist `ref` from the demo/landing URL onto the business draft it creates.
2. Carry it to the business + subscription rows.
3. Echo it as `attribution_ref` (payload and/or `meta`) on `business.created`, `payment.received`, and `subscription.*` for that business.

CRM behavior: first-touch claim is created once per account and never changes; every future payment of that business credits the claimed seller.

## What happens on the CRM side (already live + tested)

`payment.received` → account upsert by `business_ref` → seller via claim/`attribution_ref` → open opportunity marked **won** (or auto-won recorded) → **commission entries appended** (idempotent, plan-versioned, 15% pilot plan) → account mirror updated (plan/status/totals) → timeline entry. `payment.refunded` → clawback reversal entries. No attribution ⇒ processed with `no_attribution` note, zero money.

## Later (same epic, phase 2)

- `GET /v1/partner/checkpoint` on Mizro (payment ids since T) for the CRM's daily reconciliation sweep — lost webhooks can't lose sales.
- `/v1/partner/*` command endpoints (create-demo · create-business-draft · request-onboarding · create-referral-link · create-subscription-offer).

## Dev testing

Set `MIZRO_WEBHOOK_SECRET` in both sides' env. Sign + send:

```bash
TS=$(date +%s); BODY='{"id":"<uuid>","type":"payment.received",...}'
SIG=$(printf '%s.%s' "$TS" "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -r | cut -d' ' -f1)
curl -X POST localhost:6100/v1/integrations/events -H "content-type: application/json" \
  -H "x-arad-timestamp: $TS" -H "x-arad-signature: $SIG" -d "$BODY"
```
