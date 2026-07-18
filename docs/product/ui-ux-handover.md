# UI/UX Handover — Arad CRM-OS (mock → visual build)

> **To:** the dev building the visual UI for `arad-crm-os`.
> **From:** PO/design (interactive mock author). **Date:** 2026-07-18.
> **TL;DR:** an interactive, RTL-Persian mock of the CRM's key screens + flows already exists — **continue from it, don't restart.** Read `product-description.md` first (it defines *what* the product is); this doc covers *how it should look and behave*.

---

## 1. What you're picking up

- **Mock source (continue this):** [`docs/product/mock/crm-mock.html`](./mock/crm-mock.html) — a single self-contained HTML file (RTL, light/dark, clickable).
- **Live preview:** https://claude.ai/code/artifact/ee1354e2-1801-47d3-9300-da1f4903c642
- **The product it serves:** [`product-description.md`](./product-description.md) — read §5 (locked decisions), §7 (core loop), §9 (two axes), §13 (roadmap). **Build the screens the product needs, in the pilot order (§13, §18).**

The mock is a **design + interaction reference**, not production code. Rebuild it properly in the real stack — reuse the *look, tokens, IA, and flows*, not the throwaway HTML/JS.

## 2. What the mock demonstrates (screens + flows)

- **داشبورد / «امروز من»** — the seller's home: today's tasks/next-touches, KPI cards (pipeline value, deals, commission, conversion), commission sparkline, monthly-target bar, the "Mizro bridge" integration panel.
- **پایپلاین فروش** — **vertical funnel (default)** with hover→detail tooltip and click→drill-into-stage, conversion % + drop-off between stages, overall-conversion header, "lost/leaked" bar; **+ Kanban board** via a view-toggle.
- **پرونده مشتری** (customer detail) — interaction **timeline**, **معرِّف (attribution) lock**, live "status in Mizro" panel, log-call/visit/SMS actions.
- **کمیسیون من** — the append-only **commission ledger** (one row per payment, clawback row), accrued/paid/pending/clawback KPIs.
- **رتبه‌بندی و عملکرد** — manager leaderboard (sales · conversion · **retention**).
- **لیست بازدید** (prospects) — map-import source chips + allocate + dedupe/claim.
- **سرنخ‌های ورودی** — website leads + routing; **تخصیص سرنخ** (manager allocation).
- **تیم فروش** — the org tree (multi-level hierarchy).
- **Role switch** (top bar): فروشنده ↔ مدیر فروش — flips identity + reveals manager-only sections.

## 3. Design language (reuse as the starting point)

The mock uses a coherent token system — carry it forward:
- **RTL, Persian-first** (Vazirmatn stack, system fallback); `direction: rtl`, logical CSS properties (`inset-inline`, `padding-inline`), `font-variant-numeric: tabular-nums`, Persian numerals in UI.
- **Light + dark**, driven by CSS custom properties on `:root` + `@media (prefers-color-scheme)` + `:root[data-theme=…]`.
- **Palette:** primary `#6d5ae6`; grounds/surfaces/borders; semantic success/warning/danger; **multi-hue pipeline-stage colors** (new/contact/demo/nego/won/lost) — colour encodes stage/state.
- **Card-based, generous spacing, soft shadows**, rounded (`--r:14px`).

## 4. Design principles — must honor

- **Mobile-first for sellers.** «امروز من» + visit-logging are used on a phone, in the field. The seller flow (open plan → visit → log outcome → next-action) must complete in **under 2 minutes** on mobile. Desktop is the *manager's* surface.
- **Sales-oriented, not record-oriented** — every screen pushes a sale forward (a next-action, a KPI, an offer), never just displays data.
- **Simple UI** — no decorative blobs, no double-frames around logos; **purposeful multi-hue accents, not monochrome**.
- **State in form, not just number** — pills/chips/severity stripes so what needs attention reads at a glance (the mock's stage chips + funnel colours do this).
- **RTL correctness** everywhere; test on mobile widths (tables/kanban scroll inside their own container).

## 5. ⚠️ Design-system is SHARED — do NOT fork it

Per `product-description.md` §3, the **design-system is part of the shared Aradvision foundation** (used by Arad Commerce OS too). So:
- The mock's tokens are a **reference/direction**, not a private design system to fork.
- **Coordinate with the Commerce OS design-system** — align tokens, components, and theming at the **Aradvision level**, not a CRM-only copy.
- The mock's `#6d5ae6` came from Mizro's brand; the CRM is broader (vertical-SaaS). Treat the *approach* (token-driven, RTL, light/dark, multi-hue-by-state) as settled; the *final brand palette* is an Aradvision-level decision to confirm before you harden it.

## 6. Settled vs open

- **Settled (validated with the founder — don't redesign without checking):** the **information architecture**, the **screen set**, and the **flows** (seller daily-loop, funnel-first pipeline, attribution→commission, role-based views).
- **Open (your craft — polish freely):** visual refinement, component detailing, motion, empty/loading/error states, responsive breakpoints, accessibility. The founder explicitly said UI/UX polish comes later — so *refine* the visuals, but keep the IA/flows.

## 7. Priority order (match the pilot — Phase 1 first)

Build in the roadmap's order (`product-description.md` §13/§18), not all at once:
1. **Seller daily loop (the heart):** «امروز من» → visit/call quick-log (standard outcome + mandatory next-action) → pipeline (funnel) → **seller commission panel**. Mobile-first.
2. **Manager pilot views:** funnel (team), leaderboard, lead allocation, prospects/import.
3. **Later phases:** loyalty/lifecycle timeline, automation-flow UI, next-best-offer surfacing, vertical-app UIs — **hold until their phase.**

## 8. What NOT to do

- Don't restart the design from scratch — continue the mock.
- Don't over-build — this is a **pilot MVP UI** (1 city, 2–3 sellers); ship the daily loop, not the whole vision.
- Don't fork the design-system (§5) or add screens outside the product scope (§14 non-goals in the product description).
- Don't bury the seller's next-action — it's the one thing that must always be obvious.

## 9. Mock v2 changelog (2026-07-18, UI/UX pass — flows & forms)

The mock was extended so the founder can approve **flows and forms**, not just screens. Added:

- **Visit/call quick-log sheet** (the core-loop interaction): customer → interaction type → **standard outcome taxonomy** (7 outcomes) → **mandatory next-action** (type + date chips). The save button stays disabled until the rule is satisfied; a status note flips from warning to ✓. Reachable from: dashboard task rows («ثبت نتیجه»), customer detail (ثبت تماس/بازدید), prospects (ثبت بازدید), and the mobile **＋ FAB**.
- **The two flow rules made visible:** outcome «دمو ارائه شد» reveals the **seller's demo-QR attribution block** (scan = permanent معرِّف lock); outcome «رد کرد» requires a **lost-reason** and disables next-action ("closed with reason" — every lead ends with a dated next-action *or* a close reason, never neither).
- **New-lead form** — 3 required fields only (low-field-but-precise), source chips, dedupe note.
- **Mobile seller surface** (≤760px): sidebar is replaced by a bottom nav (امروز من · پایپلاین · ＋ · کمیسیون · پرونده‌ها); the quick-log opens as a bottom sheet. This demonstrates the "<2 min on a phone" loop.
- **Commission transparency:** clicking a ledger row shows the computation formula (payment × % · plan version · source event).
- **Funnel guard-notes:** the «برنده» stage states it is entered **only via a real payment event** (no manual "sold" toggle); «از دست رفته» states every exit carries a standard reason.
- Logging a visit from the customer page **prepends a live timeline entry** so the founder sees the write-path.

Still intentionally *not* in the mock (post-approval / build-time): real date-picker, customer search picker on the FAB, edit/undo of a logged interaction, manager approval flows, empty/loading/error states.

## 10. Pointers

- Product: [`product-description.md`](./product-description.md)
- Mock source: [`mock/crm-mock.html`](./mock/crm-mock.html) · Live: the artifact URL (§1)
- Deeper requirement/source: `digital-menu/docs/money/sales-os-crm.md` (the money-lens conclusion + 8-scenario validation)
- Sibling design-system to align with: `arad-commerce-os` (shared Aradvision foundation)
