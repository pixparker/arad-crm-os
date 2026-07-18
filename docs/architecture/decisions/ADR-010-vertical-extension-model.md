# ADR-010 — Vertical & extension model

> **Status:** `approved` (founder, 2026-07-18) · **Owner:** CTO · **Date:** 2026-07-18
> 🔒 Locked upstream: horizontal core + vertical apps; core headless; modules/connectors built on-demand; **no plugin store/SDK upfront**; vertical-SaaS-factory positioning — specificity lives in verticals, core stays lean.

## Decision

1. **A vertical is a package**: `packages/verticals/<vertical>` (first: `mizro`). It contributes, via explicit registration points (plain TS, in-repo — not a dynamic plugin system):
   - **Entities:** its own tables, prefixed (`mizro_*`) — cafe profile, current-menu assessment, demo refs, onboarding checklist, upsell/branch opportunity extensions.
   - **Config presets:** pipeline stages, visit-outcome set, win/loss reasons, offer catalog binding (seeded from Phase-0 outputs).
   - **Vertical form fields** for the visit flow (rendered by web-seller from a typed field spec).
   - **Event handlers** (in-process, idempotent) reacting to core domain events.
   - **Connector clients** (the Mizro partner-command client lives with the vertical, on the `integrations` module's transport).
2. **FK rule 🔒 (from ADR-003):** vertical tables may FK to **core aggregate roots only** (account, contact, opportunity, activity); core never references vertical tables and never branches on a vertical's existence.
3. **Module registry:** `org_modules` table — which L3 modules/verticals are enabled per org. Phase 1 uses it trivially (one org, mizro on); it is *the* seam that later gates SaaS packaging, and it's how "installable modules" stay installable without a plugin runtime.
4. **Sensitive data stays in the package 🔒:** the core enforces the forbidden-data list (no national ID, card numbers, medical data, home address… — schema-level: those fields simply don't exist in core). A future regulated vertical (clinic) holds its own data **in its package's tables, encrypted at rest, linked by opaque contact reference** — its own consent/privacy regime, never widening the core.
5. **Custom fields: deferred to Phase 5.** Until then the only escape hatch is a `metadata jsonb` column on account/contact/lead, **validated by the owning vertical's Zod schema** — no free-form writes. `CustomFieldDefinition/Value` (dev spec) is the Phase-5 design, not built now.
6. **Connectors** (Google-Maps seek, Excel import, web forms…) follow the same shape: an L3 module registering a lead **source** + import pipeline. Phase 1 ships only manual/Excel import for the cafe list, with dedupe.

## Options rejected

- **Plugin SDK / dynamic loading / marketplace** — explicitly out upstream; in-repo packages with typed registration cover verticals #1–#4 with zero runtime magic.
- **EAV / custom-fields engine now** — classic premature-generalization trap; JSONB-with-schema covers the pilot.
- **Vertical logic braided into core modules** — the factory dies the day core knows about cafes. The FK rule + registry keep the boundary mechanical.

## Revisit triggers

Vertical #2 (clinic/salon) → prove the package boundary by building it without core edits; encryption-at-rest infra decided then. Phase 5 SaaS → custom-field engine + per-org pipeline configuration UI.
