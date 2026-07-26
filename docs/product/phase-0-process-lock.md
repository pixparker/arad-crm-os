# Phase-0 — Process Lock (founder working session)

> **Purpose:** §13 Phase-0 of `product-description.md` — lock the sales *process* before the pilot. The software is built (see *Build state* there); this is the only gating item left. **Format: react, don't invent** — every item below has a concrete proposal already in code; confirm it or mark the change. One sitting (~45 min).
> **Single source for vocab:** `packages/verticals/mizro/src/presets.ts` (Mizro vertical package). Changing a decision here = a preset edit, not a schema change.
> **Status: ⬜ OPEN — decisions unlocked until the founder signs each box.**

## 1. Funnel stages

Lead: `new → assigned → in_progress → qualified → lost / future_followup` (schema enum).
Opportunity: `open → won / lost`, staged via `OPPORTUNITY_STAGES` presets (revisit · follow-up call · send demo/price · deciding · awaiting payment · handover-to-deployment).

- ☐ Confirm as-is ☐ Change: ______________________

## 2. Visit form + outcome taxonomy

Locked UX rule: **< 2 minutes per visit log, low-field but precise.** Outcome is one tap from `VISIT_OUTCOMES` (~13 codes, each with a suggested next-action + day offset), e.g. `decider_met` ملاقات با تصمیم‌گیرنده → follow-up call +2d · `decider_absent` → revisit +1d · `sample_requested` → send demo same-day · `business_closed` → closes the lead.

- ☐ Confirm taxonomy + suggested-next offsets ☐ Edit codes: ______________________

## 3. Win / loss reasons

`WIN_REASONS` (menu-management simplicity · design · data-entry service · QR/NFC ordering · multi-language · multi-branch fit · price · convincing demo · referral · trust · support …) and `LOSS_REASONS` (no budget · competitor · satisfied-as-is · distrust · bad timing · no decider access · long decision · technical worry · missing feature · closed business · no response · bad experience · product-customer misfit). Mandatory on every close.

- ☐ Confirm ☐ Edit: ______________________

## 4. Attribution rule 🔒-candidate

Proposal: **the seller's demo-QR/link is the only attribution instrument** — immutable, per-seller, stamped at demo creation. The `payment.received` event maps the sale to the QR's seller. Single-seller (no splits) for the pilot; `split_shares` exists in the engine when teams arrive. **Open sub-question for the founder: attribution window** — does a payment 90 days after the demo still credit the seller? Proposal: **no window in the pilot** (any later payment credits), revisit at Phase 2.

- ☐ Confirm (no window) ☐ Window: ______ days

## 5. The one commission plan

Engine supports `percent_of_net` · `fixed_per_sale` · `split_shares` · `tiered` (versioned plans, append-only entries, clawback on `payment.refunded` automatic). Proposal for the pilot: **one plan, `percent_of_net`** on the producer-supplied `net_amount_rial`.

- **Percent: ______ %** (founder supplies — the one number the code cannot invent)
- Status flow to payout: `estimated → earned → approved → payable → paid` — who approves? Proposal: founder-as-finance for the pilot. ☐ Confirm ☐ Other: ______
- ☐ Confirm plan shape ☐ Change: ______________________

## 6. Roles for the pilot

Proposal: 2–3 × `visitor_seller` · founder = `owner_admin` (+ acting `sales_manager` + `finance`). No `followup_seller` split until volume forces it. Least-privilege holds: sellers never see each other's pipelines or org financials.

- ☐ Confirm ☐ Change: ______________________

## 7. Pilot gate

**1 city: ______** · 2–3 sellers · ~4–6 weeks → explicit **scale / kill** review on §17 metrics (visits logged % · open-leads-with-next-action % · lead→opp → opp→sale conversion · founder-hours-in-loop).

- Start date: ______ · Review date: ______

---

*When every box is ticked, flip Status to 🔒 LOCKED (date + who), copy the percent into the seeded commission plan, and the pilot can start (product-description §18 items 2–3: prod deploy → seed org → run).*
