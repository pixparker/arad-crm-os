# Arad CRM-OS — Product Description & Purpose

> **Repo:** `arad-crm-os` · **Status:** Concluded product description — **handover to CTO** (2026-07-18).
> **Working name:** "Arad CRM-OS" / "Sales OS" (final brand TBD).
> **Audience:** CTO + build team. This is the **business WHAT/WHY + the locked architectural direction + the roadmap.** The technical design (schemas, module internals, enforcement) is the CTO's to own.
> **Source materials (read alongside):**
> - Founder idea + a dev's 32-section "Sales OS" spec v0.1 → `arad-crm-os` seed (originally `digital-menu/docs/_ideas/funder/crm-idea.md`).
> - PO/CTO conclusion + 8-scenario architecture validation → `digital-menu/docs/money/sales-os-crm.md`.
> - Sibling platform → `arad-commerce-os/docs/founder/project-description.md`.

---

## 1. Purpose (why this exists)

Every business Arad works with — a cafe, an online shop, a beauty clinic, a flower shop — has the same two needs: **sell more, and give each customer more value.** Today that work is scattered across notebooks, Excel, WhatsApp, and people's memory, so leads are forgotten, follow-ups are missed, commissions are disputed, and nobody can see which customers are worth the most attention.

**Arad CRM-OS exists to make selling a repeatable, measurable system that focuses effort on the highest-value customers** — and to be the shared sales/relationship engine underneath every Arad project, starting with Mizro.

> **North star:** increase revenue by helping each business focus on its highest-ROI customers and act on the right offer, to the right customer, at the right time.

## 2. What it is

Not a contact database. A **sales execution system + CRM**: it collects leads from every source, distributes them to sellers, gives each one a **daily plan**, captures every visit/call/follow-up, moves opportunities to a close, **detects the sale from a real payment**, **computes commission transparently and auditably**, and drives **customer loyalty/lifecycle** — while learning *why* deals are won or lost.

> **One line:** the system that tells each seller **who to work on today, what to do next, and exactly how much they've earned** — and tells the business **which customers to focus on.**

## 3. Where it sits — the Aradvision platform (brain vs hands)

Arad runs two complementary "OS" products on one shared foundation:

| | Product | Role |
|---|---|---|
| **Hands** | **Arad Commerce OS** | runs the *store* — catalog · cart · checkout · order · payment · inventory · shipping · storefronts |
| **Brain** | **Arad CRM-OS** (this repo) | runs the *salesforce + relationships* — leads · pipeline · visits · commission · loyalty · lifecycle · next-best-offer |

**They are siblings, not parent/child.** The CRM sits *above* commerce and *consumes its events* (`order.paid` → attribute the sale, credit the seller, enrol loyalty, trigger the next-best-offer). It is **not** a module inside Commerce OS, and Commerce is **not** inside the CRM.

**Shared foundation (do NOT rebuild — coordinate with Commerce OS):** auth/OTP · **Connect/providers** (Zarinpal · SMS · WhatsApp — Mizro's E45 pattern; now a 3-consumer shared layer) · a shared **Customer/Identity** core · design-system · notifications · deployment tooling. Whether this lives as a shared-packages repo, submodule, published packages, or an eventual single Aradvision monorepo is the **CTO's topology call** — the requirement is *shared foundation, not duplicated*.

**Boundary rule (keep it):** **Arad CRM-OS is the sales / relationship / loyalty / intelligence brain — not the transaction hands.** Commerce, POS, online-shop, Mizro-ordering are **transaction surfaces (sales-sources)** that connect and feed it. Checkout · payment · inventory · accounting stay **out of the CRM core.**

## 4. Dual value — one build

- **For Arad/Mizro now:** the operating system for a field sales team — lifts the founder-as-only-seller ceiling, scales the team **controlled**, and plugs conversion leaks.
- **As a standalone product later:** a **generic sales core + per-vertical apps** — a **vertical-SaaS factory**. It **scales from a single solo seller** (a shop/online-store owner) up to a **multi-level sales org** (founder → sales managers → sellers). Same build; Mizro is the first customer.

## 5. Locked decisions

- **Custom-built** (not Odoo/Didar) — resale ambition needs ownership; **auto-commission-from-payment** is the differentiator; sellers need a **dead-simple mobile screen**; per-user pricing punishes the scaling you're selling.
- **Own DB · own sales users/roles · own deploy · thin event integration** — never welded into another product's database.
- **Sibling to Arad Commerce OS on a shared foundation** (§3) — not inside it, not a duplicated island.
- **Horizontal core + vertical apps** — the core is industry-agnostic; what you *sell* is always a **focused vertical app** (Mizro-for-cafes, then clinic/salon/shop). **Positioning = vertical-SaaS factory for SMBs, NOT a horizontal "do-everything" suite** (the Odoo/Zoho trap).
- **Core is headless / API-first** — each vertical brings its **own UI/app**; sensitive vertical data (e.g. medical) is **isolated + encrypted in the package**, never in the core.
- **Sale = a real payment event** (`payment.received` / `order.paid`) — never a manual "sold" toggle.
- **Commission = the crown jewel** — independent, **versioned, append-only, idempotent, auditable, clawback on refund** (mirror Mizro's E53 ledger rigor).
- **Attribution via the seller's demo-QR/link** — immutable, per-seller.
- **Designed to scale from N=1** — solo → team → multi-level; **two axes** (acquisition funnel + customer lifecycle/loyalty) on one core.
- **Multi-tenancy as a seam now** (`organization_id` on every row); tenant onboarding/billing/white-label built later.
- **Modular: connectors + industry packages, built on-demand** — no plugin store / SDK upfront.
- **Nexta stays a separate product** (forms/surveys/assessment), Connector-linked.
- **Scale pilot-first + controlled** — one city, 2–3 sellers, one commission plan; prove the motion before going wide.

## 6. Product structure (4 layers)

1. **Platform core** — orgs/tenants · users · roles · teams · audit log · events · API/webhook · notifications · files · **Connect** (shared provider layer).
2. **Generic sales core** *(industry-agnostic)* — lead · account · contact · opportunity · pipeline · activity/visit/call · next-action · source · win/loss reason · product/offer · **attribution** · **commission** · targets · reports.
3. **Installable modules** *(enable per need)* — field-sales · **lead/sales-source connectors** (Google-Maps-seek · online-shop · manual-sale/light-POS · surveys · Excel · web) · advanced-commission · gamification · **automation (communication flows)** · renewal/upsell · **customer-lifecycle / special-events (loyalty)** · **customer-finance / billing** (light — balances · per-customer profit · multi-party payments) · **scheduling / appointments** · AI · **next-best-offer / recommendation engine**.
4. **Vertical apps** — each its own UI + package on the headless core. **Mizro (cafe/restaurant) is vertical #1.** Later on-demand: clinic · salon · insurance · shop.

## 7. The core loop (the MVP spine — build this first)

```
login → «امروز من» (daily plan) → visit/call → quick standard outcome
→ mandatory next-action → opportunity → demo-QR (= attribution)
→ payment event → commission (auto + transparent) → seller money panel
```

Every seller lives in **«امروز من»** — *where do I go today and who do I work on.* Every open lead has either a **dated next-action** or a **close reason** — nothing is left to rot.

## 8. Roles (lean)

Seller/visitor · Seller/follow-up · **Sales manager** · Owner/admin · deployment-ops handoff · Finance *(later)*. **Least-privilege:** a seller never sees other sellers' data or org-wide financials.

## 9. Two axes (both on one core)

- **Acquisition (sales funnel):** win *new* customers (lead → opportunity → sale).
- **Customer lifecycle / loyalty:** grow & keep *existing* customers — **detect highest-value customers**, focus on **highest-ROI actions**, run **special-events cadence** (VIP birthday → −۱ ماه → −۱ هفته → روز رویداد), admin-customizable + **visualized on a timeline**.

*(The loyalty engine also powers **Mizro's diner customer-club** — built once, used per-tenant. A top extraction candidate.)*

## 10. Communication / automation flows — staged (never a generic builder in MVP)

- **Phase 1 primitive:** every lead/customer has a dated next-action + reminder; the system nudges.
- **Phase 2–3 predefined flows:** built-in templates (post-visit cold/hot · renewal-cadence) — event-triggered, delayed, single-branch, actions via Connect (SMS/opt-out · call-task · reminder · promo).
- **Phase 4–5 custom flow builder + visualization** (SaaS differentiator).

## 11. Next-best-offer — "the system as a new salesforce"

The convergence of lifecycle (§9) + flows (§10) + AI: right offer · right customer · right time. **Assisted mode** = a task pushed to the seller; **auto mode** = auto-send via a flow (high-volume shops). Staged **rules → ML**; human-in-the-loop; opt-out + frequency caps. This is the strongest expression of the north star (§1) — and the premium differentiator.

## 12. Integration (thin, event-based)

- **In (sales-sources → CRM):** `order.paid`/`payment.received` (Commerce, Mizro, POS, shop) · `subscription.*` · `menu.published` · `onboarding.completed` · form/lead events.
- **Out (CRM → systems):** `create-demo` · `create-business-draft` · `request-onboarding` · `create-referral-link`.
- **Attribution linchpin:** the seller's demo-QR/link stamps *which seller + which customer*; the payment event maps the sale automatically.
- **Reuse, don't fork:** Connect/providers · customer/identity · auth (shared foundation, §3). Mizro's **E45 Connect · E52 subscriptions · E53 payments · E48 invite/onboard · E54 ops** are the concrete Mizro-side integrations. The Growth-Pipeline (E49) public lead form becomes a **lead source**.

## 13. Roadmap (value-phased)

- **Phase 0 — Lock the process (paper, no code):** funnel stages · visit form · win/loss reasons · attribution rule · one commission plan · roles.
- **Phase 1 — Mizro pilot MVP (the core loop):** cafe list + import + dedupe · daily plan + map · fast visit log + outcome taxonomy + mandatory next-action · lead→opportunity→sale · payment-event attribution (single seller) · **one commission plan + append-only ledger + clawback** · seller money panel · basic manager dashboard + funnel. **Start: 1 city, 2–3 sellers.**
- **Phase 2 — Team control:** manager tooling · teams/territories · targets · leaderboard · tiered commission · split attribution · predefined flows · Nexta connector.
- **Phase 3 — Full customer ops:** onboarding handoff · renewal · upsell/cross-sell · post-sale satisfaction + referral.
- **Phase 4 — Intelligence:** next-best-offer · AI data-entry assist (voice→structured via Telegram) · NL query · lead scoring · at-risk detection. *(Human-in-the-loop.)*
- **Phase 5 — SaaS-ready:** tenant onboarding · billing · custom fields · configurable pipeline · branding · module mgmt · solo-seller entry tier · custom flow builder.
- **Phase 6 — Vertical apps:** clinic · salon · insurance · shop … built on-demand.

> **Money-lens sequencing:** Phases **0–1 are the ROI core** — everything to scale Mizro's sales lives there. **4–6 are the standalone-product future**, earned after Mizro proves it. **Do not build the vision before the loop.**

## 14. MVP scope (in / out)

- **In (Phase 1):** the core-loop list above.
- **Out / deferred:** gamification *levels* (simple leaderboard only) · playbook *module* (static doc first) · Nexta connector · split-commission · route optimization · AI · custom flow builder · tenant/billing/white-label · native app · microservices · any 2nd vertical.
- **Never in core:** accounting · payroll · inventory · HR · call-center/recording · checkout/payment/POS-till (those are Commerce OS / adjacent) · generic workflow/report builders.

## 15. Guardrails / non-goals

- **Guiding question for every feature:** *does it help the seller act better, the manager decide better, or increase sales + control?* If no → not in the core.
- **Sales-oriented, not record-oriented** — every screen pushes a sale forward.
- **Low-field but precise** · **mobile-first for sellers** (<2 min per visit).
- **Financial transparency + full audit** — sellers see how commission was computed; sensitive changes logged.
- **Forbidden data (core):** national ID · card numbers · OTP · home address · medical/family data · unconsented recordings · personal judgments. *(Vertical packages define their own privacy/consent regime — e.g. a clinic package holds medical data, isolated + encrypted, never in the core.)*
- **Don't become a heavy generic CRM** — specificity lives in the vertical apps; the core stays lean.

## 16. Architecture validation — 8 stress-tests (all held)

The structure was pressure-tested against 8 diverse scenarios and held; the two edge cases (medical, POS) drew its boundaries rather than breaking it.

| Scenario | Maps to | Note |
|---|---|---|
| Insurance | industry package + field-sales | on-demand vertical |
| Google-Maps seek | lead-source connector | pluggable source |
| Connect (Zarinpal/WA/SMS) | shared Connect layer | reuse E45; 3 consumers |
| Aradvision shop | lead-source + sales-source | forms=leads, purchases=sales |
| Nexta | bidirectional connector | separate product |
| AI Telegram voice / NL-query | AI module + channel | Phase 4 |
| Beauty-doctor | healthcare vertical | **surfaced the finance module**; medical data isolated in package |
| Light-POS + Customer-club | manual sale-source + loyalty module | brain-vs-hands boundary; per-tenant loyalty |

## 17. Success metrics

- **Usage:** % visits logged · % open leads with a next-action · avg visit-log time · daily active sellers.
- **Sales:** lead→opp & opp→sale conversion · avg cycle · revenue per seller · sales by source.
- **Management:** fewer forgotten leads · fewer commission disputes · better forecastability · **less founder time in the sales loop.**
- **Product:** capabilities built from real Mizro data · reusable by other verticals without CRM-specific forks.

## 18. For the CTO — start here

1. **Coordinate the shared foundation with Arad Commerce OS** (§3) — decide the topology (shared-packages repo / submodule / published packages / eventual Aradvision monorepo). **Do not duplicate auth · Connect · customer/identity · design-system · deploy.**
2. **Run Phase 0** — a short founder working session to lock the process (§13). No code until it's locked.
3. **Scope Phase 1 ruthlessly** — the core loop only, for Mizro, 1 city / 2–3 sellers. Build the **commission ledger with full rigor first**, tested against real payment events.
4. **Prove the motion before scaling** — consider running the pilot on a spreadsheet in parallel; set an explicit measure → scale/kill gate after ~4–6 weeks.
5. **Hold everything else as seams** — no 2nd vertical, no AI, no builder, until Mizro's loop is live and proven.
6. **Review the money doc + dev spec** (source materials, top of this file) and hand the **epic plan + technical architecture** back for a PO/architecture review — especially the permission model, the commission ledger, the shared-foundation boundary, and the event contract with Commerce OS + Mizro.
