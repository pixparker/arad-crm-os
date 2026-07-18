# ADR-009 — Frontend architecture & design system

> **Status:** `approved` (founder, 2026-07-18) · **Owner:** CTO · **Date:** 2026-07-18
> Guidance sources: **`ux-best-practices` repo** (primary — wired into both apps' dev docs) · `mizro-design/docs` theming contract + brand-token *pattern* · `digital-menu/docs/ui/00-ui-conventions.md`.

## Two apps, two archetypes

| | `apps/web-seller` | `apps/web-admin` |
|---|---|---|
| Archetype (`ux-best-practices`) | **consumer-mobile-app** | **ops-admin-panel** |
| User & posture | seller in the field, phone, one hand, sunlight | manager/owner at a desk, dense data |
| Home | **«امروز من»** — today's plan | funnel + team overview + action queue |
| Signature constraints 🔒 | visit flow **< 2 min**, mostly standard-option selects; bottom-nav thumb-zone; big touch targets | dense tables, keyboard support, bulk actions, responsive-tables-on-mobile |
| Tech | Next 15 + PWA (`@serwist/next`); installable; Capacitor shell = later seam | Next 15; `@tanstack/react-query` |

**Native app is OUT of MVP** (dev spec §28) — PWA covers it; Mizro's Capacitor pattern is the later path.

**Offline:** no offline requirement in the spec. Tactic only (not architecture): visit-form **draft persistence to localStorage + retry queue** on submit, riding the Idempotency-Key guarantee (ADR-008) — a dropped connection never loses a filled form or double-logs a visit.

## Language, dates, numbers

- **fa-IR primary, RTL root** (`<html lang="fa" dir="rtl">`); minimal `@arad/i18n` catalog; 🔒 fa/en key parity invariant (Mizro rule).
- **Vazirmatn** self-hosted (foundation font assets); Persian numerals via `Intl`.
- Dates: display via `Intl` fa-IR (Jalali rendering for free, Mizro pattern) + **luxon** for math. Gap flagged in foundation: no Jalali *picker/conversion* lib yet — special-events offsets (−۱ ماه…) and date pickers will need one; evaluate `date-fns-jalali` vs a picker-bundled option at build time inside `@arad-crm/ui` so the choice stays swappable. Storage is always `timestamptz` UTC.

## Design system & brand

- **CRM brand is greenfield (name TBD)** — do NOT inherit Mizro's teal identity. Adopt mizro-design's **mechanism**: CSS-variable tokens + `[data-theme]` overrides, 8px spacing base, radii/shadow token sets, WCAG 2.1 AA, perf budgets (mid-range Android on 3G-ish for web-seller).
- `@arad-crm/ui` package: tokens + primitives shared by both apps (Tailwind 3.4 preset consuming the CSS vars). Ship with a **neutral placeholder theme**; brand lands as a token swap, not a refactor. Radix primitives with `dir="rtl"` handling (Mizro precedent).
- `@arad-crm/web-shared` package: the non-visual glue both apps need once — session/auth hooks, query-client setup, error boundaries, correlation-id propagation, app-shell layout primitives. Kills the two-app duplication tax (requirements-fit #1) without merging the apps.
- Forms: **react-hook-form + Zod resolvers** reusing `@arad-crm/api-contracts` schemas — one validation source client+server.
- Both apps wire Sentry + the `ux-best-practices` checklists (empty states, skeletons, inline validation, optimistic UI, back-friendly modals) into their PR checklist.

## Options rejected

- **One combined web app** — audiences/archetypes diverge hard (thumb-zone PWA vs dense desktop); Mizro convention is app-per-audience; bundles stay lean.
- **Adopting `@mizro/ui` wholesale** — it's Mizro-branded and menu-surface-oriented; we take the token *contract*, not the skin.
- **Full offline-first (service-worker data sync)** — no requirement; huge complexity tax on a Phase-1 pilot.
