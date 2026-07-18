# ADR-012 — UI surface & theming strategy across verticals

> **Status:** `approved` (founder, 2026-07-18) · **Owner:** CTO · **Date:** 2026-07-18
> Extends **[ADR-009](ADR-009-frontend-design-system.md)** (design-system mechanism) and **[ADR-010](ADR-010-vertical-extension-model.md)** (vertical model). Answers the founder question: *are verticals (doctor-CRM, insurance-CRM, online-shop-CRM…) forced onto one UI, or can each look different — and when is UI/UX polish affordable?*

## The core rule 🔒 — "UI" is three decoupled layers

A vertical is **not** forced into one look. UI splits into three layers that vary independently:

| Layer | What | Ownership | Cost to change |
|---|---|---|---|
| **Theme** — tokens | colors, shadows, radii, type (`packages/ui/styles/tokens.css`) | **Per-vertical** — each gets its own token set | Trivial: a token swap, never a refactor (the ADR-009 invariant) |
| **Component kit** — primitives | buttons, cards, fields, chips, nav, tables (`@arad-crm/ui`) + non-visual glue (`@arad-crm/web-shared`) | **Shared** across all verticals | Medium — and it lifts every vertical at once |
| **Screens & flows** — IA | which screens exist, which fields, the workflow | **Per-vertical** — genuinely different | Per-vertical build (its own app/routes + vertical package) |

**One chassis, different bodies.** Verticals reuse the expensive, invisible parts (auth, money/commission, data layer, primitive kit, API patterns) and differ where they must (theme + screens). A doctor-CRM (patients/appointments/treatment plans), an insurance-mobile-CRM (policies/renewals/claims) and Mizro's field-sales flow share the kit, each wearing its own theme.

## Mechanism (how a vertical gets its own look)

1. **Theme = a token block, selected at the root.** Each vertical ships `--ac-*` overrides under a `[data-vertical="<name>"]` (or a `tokens.<vertical>.css`) alongside `[data-theme="dark"]`. The app root sets `data-vertical`; the whole surface re-skins with **zero component edits**. (Same swap proved on 2026-07-18 when the neutral placeholder → the mock's violet theme.)
2. **Screens = per-vertical apps.** Each vertical owns its `apps/<vertical>-*` surfaces (mobile-first PWA or dense desktop as the audience needs — the kit already supports both: `web-seller` PWA + `web-admin` desktop). They consume `@arad-crm/ui` + `@arad-crm/web-shared` + the vertical's own `packages/verticals/<vertical>` (presets, field specs, entities — ADR-010).
3. **Split to its own repo only on real divergence.** Default is one monorepo; a vertical graduates to its own repo only when its team/roadmap genuinely diverges — not for cosmetics.

## When is UI/UX improvement affordable? — any phase, incremental

Because quality lives in tokens + components, it is a **dial, not a phase-gated rewrite**:

- **Any time, low effort:** per-vertical theme tuning, per-screen polish, token refinement.
- **Once, before vertical #2 (the high-leverage spend):** harden `@arad-crm/ui` into a real design system — a11y states, more primitives, seeded from a **design source** (designer / Figma→tokens pipeline / shadcn-style baseline). It compounds: every later vertical starts polished and it retroactively lifts Mizro.
- **Not done:** bespoke UI per vertical.

## Options rejected

- **Bespoke, separate UI per vertical** — throws away the kit + glue reuse (the requirements-fit #1 win); only justified if a vertical's segment is design-obsessed and the shared kit actively blocks it. Don't pay preemptively.
- **One config-driven UI for all verticals (same screens, data-driven)** — forces divergent domains (cafes vs clinics vs policies) into one IA; the vertical-factory dies when every vertical must fit one screen set.
- **Forking `@arad-crm/ui` per vertical** — duplicates the maintenance tax the shared kit exists to kill; theming already gives per-vertical distinctiveness without a fork.

## Revisit triggers

- **Vertical #2 build** — prove per-vertical theming (a new `data-vertical` block, no component edits) at the same time ADR-010's package boundary is proven. Do the design-system hardening pass here.
- **A design-sensitive vertical** (consumer-facing brand) — re-evaluate the "no bespoke UI" line for that one vertical only.
- **Phase 5 SaaS** — per-org (not just per-vertical) theming/white-label becomes a product feature; the `[data-vertical]` mechanism generalizes to per-tenant tokens.
