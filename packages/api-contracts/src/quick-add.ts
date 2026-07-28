// The unified ＋ quick-add (E01-F07) and the guided post-create step (F08).
//
// The ＋ menu is driven by a typed registry the api serves, not by a hardcoded
// list in the app: a vertical adds or hides an entry without a redesign, and
// «سفارش» (orders) can be added later by appending one registry entry — see
// the epic's out-of-scope note.

import { z } from 'zod';
import { rialAmountSchema } from './sales.js';

export const quickAddKindSchema = z.enum([
  'lead', // سرنخ — a new business to work
  'customer', // مشتری — a known account, no funnel yet
  'opportunity', // فرصت — confirmed need + fit on an existing account
  'touch', // تماس/بازدید — a call, visit or message that happened
  'info', // اطلاعات — a note or fact about an account
]);
export type QuickAddKind = z.infer<typeof quickAddKindSchema>;

// The sheet lays out two blocks: «ثبت جدید» as tiles, «ثبت فعالیت روی یک
// پرونده» as rows. Which block an entry belongs to is a property of the entry,
// not of the layout — otherwise adding one means editing the app.
export const quickAddGroupSchema = z.enum(['create', 'activity']);

// Icon *keys*, not markup: the app owns the drawing, the registry owns which
// one. A new entry with an unknown key renders with the neutral icon rather
// than breaking the sheet.
export const quickAddIconSchema = z.enum([
  'lead',
  'customer',
  'opportunity',
  'note',
  'call',
  'visit',
]);

export const quickAddEntrySchema = z.object({
  // Stable identifier — unique per entry, because two entries can share a
  // `kind` (a call and a visit are both `touch`).
  key: z.string(),
  kind: quickAddKindSchema,
  group: quickAddGroupSchema,
  icon: quickAddIconSchema,
  label: z.string(),
  hint: z.string(),
  // Where the client POSTs this entry's form.
  endpoint: z.string(),
  // Fields the form starts with — how one endpoint serves several entries
  // (`{ kind: 'call' }` vs `{ kind: 'visit' }` on /v1/activities).
  defaults: z.record(z.string()),
  // False when the actor's role may not create this kind — the entry still
  // ships so the menu is stable, and the UI greys it rather than hiding it.
  enabled: z.boolean(),
});

export const quickAddRegistrySchema = z.object({
  entries: z.array(quickAddEntrySchema),
});
export type QuickAddRegistry = z.infer<typeof quickAddRegistrySchema>;

// ─── F08 — guided post-create ───────────────────────────────────────────────

// Offsets the UI renders as chips ("۲ هفتهٔ دیگر", "شنبه"). Server-supplied so
// a vertical can tune them without an app release.
export const nextActionOffsetSchema = z.object({
  key: z.string(),
  label: z.string(),
  days: z.number().int().min(0).max(365),
});

// What the api returns after a lead is created: the suggested opportunity and
// the next-action choices, so saving never dead-ends.
export const postCreateGuidanceSchema = z.object({
  lead_id: z.string(),
  account_id: z.string(),
  account_name: z.string(),
  suggest_opportunity: z.boolean(),
  // Vertical stage vocabulary for the opportunity the seller may open now.
  opportunity_stages: z.array(z.object({ code: z.string(), label: z.string() })),
  next_action_types: z.array(z.object({ code: z.string(), label: z.string() })),
  next_action_offsets: z.array(nextActionOffsetSchema),
  // Non-null when a flow is enrolled or a vertical mapping applies.
  suggested_next_action: z
    .object({
      action_type: z.string(),
      label: z.string(),
      in_days: z.number().int(),
      source: z.enum(['flow', 'vertical_outcome', 'none']),
    })
    .nullable(),
  // Playbooks that may be enrolled on this lead right now.
  available_flows: z.array(z.object({ id: z.string(), key: z.string(), label: z.string() })),
});
export type PostCreateGuidance = z.infer<typeof postCreateGuidanceSchema>;

// 🔒 One request completes the guided step: it opens the opportunity (or not)
// AND sets the dated next action. The open-lead invariant is enforced here —
// a lead that is not being closed must leave this call with a dated next
// action, so the UI cannot save a rotting lead.
export const guidedFollowupBodySchema = z
  .object({
    opportunity: z
      .object({
        stage: z.string().min(2).max(40),
        amount_estimate_rial: rialAmountSchema.optional(),
      })
      .optional(),
    next_action_type: z.string().min(2).max(40).optional(),
    next_action_at: z.string().datetime().optional(),
    close_reason: z.string().min(2).max(40).optional(),
    // Enroll the lead in this playbook as part of the same step.
    flow_id: z.string().uuid().optional(),
  })
  .refine(
    (v) => Boolean(v.close_reason) || (Boolean(v.next_action_type) && Boolean(v.next_action_at)),
    { message: 'اقدام بعدی با تاریخ، یا دلیل بستن، الزامی است' },
  );

export const guidedFollowupResponseSchema = z.object({
  lead_id: z.string(),
  opportunity_id: z.string().nullable(),
  next_action_type: z.string().nullable(),
  next_action_at: z.string().datetime().nullable(),
  enrolled_flow_id: z.string().nullable(),
});
