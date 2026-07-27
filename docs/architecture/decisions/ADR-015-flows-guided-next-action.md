# ADR-015 — Flows & the guided next action

> **Status:** `approved` (founder via demo-01, 2026-07-27) · **Owner:** CTO · **Date:** 2026-07-27
> **Driver:** [demo-01-mizro](../../founder/demos/demo-01-mizro.md) §"make things easier" — per-lead flows (cold campaign for product X, active upsell), each with defined next steps; the system suggests the flow's next step unless the seller picks another.
> Relates to: product description §10 (staged flows, *never* a generic builder in MVP) · §15 guardrails · founder framework §14 (automation model) · business architecture §11 rule 12 (*the system must guide the user to the next action*).

## Context

Two things in the product are easy to confuse and must not be built as one:

1. **Guidance** — "given where this lead is, what should I do next, and when?" Deterministic, read-only, no side effects.
2. **Automation** — "wait 3 days, check a condition, send an SMS, record the delivery result, branch." Stateful, time-driven, has side effects and a provider dependency.

The founder's description contains both, but demo-01 only *needs* the first. Product description §10 explicitly defers the second ("never a generic builder in MVP"), and §15's guardrail is that every screen must push a sale forward — which is guidance, not orchestration.

Building the automation engine now would also front-run Connect (ADR-014 §3) and the `communication` package, neither of which exists.

## Decision

### 1. A flow is a playbook, not a workflow engine 🔒

**E01 ships suggestion only. No sending, no waits, no conditions, no branching, no scheduler.**

A flow is a **named, ordered list of steps** attached to a lead, opportunity, or account. Each step declares a next-action type and a day offset. When an entity is enrolled, the system computes *one* thing: the suggested next action. The seller accepts it or overrides it. Nothing runs on a timer; nothing sends anything.

```
flow_definitions   org-scoped, versioned  { key, label, entity_kind, steps[] }
                                          steps[] = { order, action_type, offset_days, label }
flow_enrollments   org-scoped             { entity_kind, entity_id, flow_version_id,
                                            current_step, status, enrolled_by, enrolled_at }
```

🔒 **Versioned like commission plans** (ADR-007): editing a flow creates a new version; live enrollments keep pointing at the version they started on. A playbook edit must never silently rewrite what a seller was told to do yesterday.

### 2. Suggestion never overrides the human 🔒

The flow's step is a **default, not a mandate**. The seller may always set a different next action; doing so records an override on the enrollment (which step was suggested, what was chosen). That record is the input for later judging whether a playbook is any good — without it, flows are unfalsifiable.

The 🔒 open-item invariant is unchanged and takes precedence: **every open lead and opportunity carries a dated next action or a close reason.** A flow supplies a good default for that field; it never satisfies the invariant on its own, and an entity with no flow is exactly as valid as one with a flow.

### 3. Flows are configuration, not code

`flow_definitions` rows are **data, per organization** — not TypeScript constants. A vertical package may *seed* default playbooks; a tenant may edit them without a deploy. This is the first subsystem built the way the business architecture doc §9 requires of everything ("customization via settings and the Vertical Pack, never a core change per customer"), and it is deliberately the template for migrating the vertical presets later.

### 4. Where it lives

Module `apps/api/src/modules/flows/` (sales-core, industry-agnostic). It **reads** leads/opportunities/accounts through their service APIs and **writes** only its own tables — no cross-module writes (ADR-003 rule 2). The suggested next action is returned alongside the entity; the flows module never mutates `leads.next_action_*` itself.

### 5. The automation seam

When automation does arrive, it is a **separate module consuming the same `flow_definitions`**, extended with step types that have effects (`wait`, `condition`, `send`). Today's step type is `suggest`. That keeps one vocabulary for the founder and one migration path, without building the engine now.

**Trigger to build it:** Connect is live (ADR-014 §3), *and* the pilot shows sellers actually following suggested steps. Automating a playbook nobody follows just sends unwanted messages faster.

## Options rejected

- **Full Trigger→Wait→Condition→Action engine now** (founder framework §14) — explicitly deferred by product description §10; depends on Connect; and it is the classic premature-generalization trap this repo has avoided twice already (custom fields, plugin SDK).
- **Flows as vertical-package code** — makes every playbook edit a deploy, and re-commits the mistake the vertical presets already made.
- **Auto-applying the flow's next action without seller confirmation** — breaks the "seller decides, system assists" posture and would corrupt the next-action field that the whole daily plan reads from.
- **Unversioned flow definitions** — an edit would retroactively change in-flight guidance and make performance comparison between playbooks meaningless.
- **Enrolment limited to leads** — the founder's own examples include an upsell flow on an existing *customer*, so `entity_kind` is polymorphic from the start.

## Revisit triggers

- Connect live + measured step-follow rate → build the automation module (§5).
- Sellers overriding a playbook's step >50% of the time → the playbook is wrong, or guidance is the wrong mechanism; inspect the override records before adding features.
- A vertical needing branching guidance (insurance renewal vs. claim) → revisit whether `condition` steps belong in the suggestion tier.
