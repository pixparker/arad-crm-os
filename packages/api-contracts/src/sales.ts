// Sales-core wire shapes. Vertical vocabularies (outcome codes, stages,
// reasons, findings) are open strings here — the HEADLESS core stays
// vertical-agnostic (ADR-010); the service layer validates membership against
// the active vertical's presets.

import { z } from 'zod';
import { contractTypeSchema, roleSchema } from './auth.js';

// ── shared ──────────────────────────────────────────────────────────────────

export const accountStatusSchema = z.enum(['prospect', 'in_funnel', 'customer', 'inactive']);
export const leadStatusSchema = z.enum([
  'new',
  'assigned',
  'in_progress',
  'qualified',
  'lost',
  'future_followup',
]);
export const opportunityStatusSchema = z.enum(['open', 'won', 'lost']);
export const activityKindSchema = z.enum(['visit', 'call', 'sms', 'note', 'system']);

export const rialAmountSchema = z.string().regex(/^-?[0-9]+$/); // bigint on the wire

// ── territories / team ──────────────────────────────────────────────────────

export const territorySchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(['city', 'region', 'neighborhood', 'custom']),
});

export const createTerritoryBodySchema = z.object({
  name: z.string().min(1).max(120),
  kind: territorySchema.shape.kind.default('city'),
});

export const teamMemberSchema = z.object({
  user_id: z.string(),
  display_name: z.string(),
  phone: z.string(),
  role: roleSchema,
  contract_type: contractTypeSchema,
  territory_id: z.string().nullable(),
  territory_name: z.string().nullable(),
  status: z.enum(['invited', 'active', 'disabled']),
});

export const createMemberBodySchema = z.object({
  phone: z.string().min(5).max(20),
  display_name: z.string().min(1).max(120),
  role: roleSchema,
  contract_type: contractTypeSchema.default('full_time'),
  territory_id: z.string().optional(),
});

// ── accounts («پرونده‌ها») ──────────────────────────────────────────────────

export const accountSchema = z.object({
  id: z.string(),
  name: z.string(),
  business_type: z.string().nullable(),
  phone: z.string().nullable(),
  contact_name: z.string().nullable(),
  contact_role: z.string().nullable(),
  instagram: z.string().nullable(),
  address_text: z.string().nullable(),
  region_text: z.string().nullable(),
  territory_id: z.string().nullable(),
  source: z.string(),
  external_rating: z.string().nullable(),
  status: accountStatusSchema,
  attributes: z.record(z.unknown()),
  mizro: z.object({
    business_ref: z.string().nullable(),
    plan: z.string().nullable(),
    subscription_status: z.string().nullable(),
    subscription_ends_at: z.string().nullable(),
    total_paid_rial: rialAmountSchema,
  }),
  created_at: z.string(),
});
export type Account = z.infer<typeof accountSchema>;

// ＋ «مشتری» — a file for a business the seller already knows, created without
// going through the lead pipeline (E01-F07's registry points this entry here).
// 🔒 `status` is deliberately NOT in the body: `customer` means a detected
// payment event and is written by the worker alone. A manually created file
// starts in the funnel and is promoted by a real sale, never by a form.
export const createAccountBodySchema = z.object({
  business_name: z.string().min(2).max(160),
  phone: z.string().min(5).max(20).optional(),
  region_text: z.string().max(120).optional(),
  territory_id: z.string().optional(),
  business_type: z.string().max(60).optional(),
  contact_name: z.string().max(120).optional(),
  contact_role: z.string().max(120).optional(),
  instagram: z.string().max(120).optional(),
  address_text: z.string().max(300).optional(),
  source: z.string().max(40).default('manual'),
  // merged through the vertical findings schema — invalid keys rejected
  attributes: z.record(z.unknown()).optional(),
});
export type CreateAccountBody = z.infer<typeof createAccountBodySchema>;

// A row in «سرنخ‌ها و مشتریان». The account plus the three things the list
// screen judges it by: is there a next step, when was it last touched, and is
// there money on the table. Derived per-actor (the commitment is the ACTOR's,
// not the file's), which is why it is a list shape and not part of `account`.
export const accountListItemSchema = accountSchema.extend({
  next_action_type: z.string().nullable(),
  next_action_at: z.string().nullable(),
  last_activity_at: z.string().nullable(),
  open_opportunities: z.number().int(),
  open_value_rial: rialAmountSchema,
});
export type AccountListItem = z.infer<typeof accountListItemSchema>;

export const accountListResponseSchema = z.object({ items: z.array(accountListItemSchema) });

// Pre-create duplicate check for the ＋ sheet. 🔒 A file the actor may not read
// is reported as taken WITHOUT its contents: the seller learns "already
// registered, not yours" and can ask a manager, instead of either creating a
// duplicate or being handed another territory's file.
export const accountLookupResponseSchema = z.object({
  found: z.boolean(),
  visible_to_me: z.boolean(),
  account_id: z.string().nullable(),
  name: z.string().nullable(),
  status: accountStatusSchema.nullable(),
  region_text: z.string().nullable(),
  message: z.string().nullable(),
});
export type AccountLookupResponse = z.infer<typeof accountLookupResponseSchema>;

export const updateAccountBodySchema = z.object({
  contact_name: z.string().max(120).optional(),
  contact_role: z.string().max(120).optional(),
  instagram: z.string().max(120).optional(),
  address_text: z.string().max(300).optional(),
  // merged through the vertical findings schema — invalid keys rejected
  attributes: z.record(z.unknown()).optional(),
});

// Link a CRM account to its Mizro business id, so payment events for that
// business match this (seller-worked) account instead of minting a bare one —
// the attribution bridge for manually-onboarded businesses (no demo-link ?ref).
export const linkMizroBusinessBodySchema = z.object({
  mizro_business_ref: z.string().trim().min(1).max(200),
});
export type LinkMizroBusinessBody = z.infer<typeof linkMizroBusinessBodySchema>;

// ── leads ───────────────────────────────────────────────────────────────────

export const leadSchema = z.object({
  id: z.string(),
  account_id: z.string(),
  account_name: z.string(),
  account_phone: z.string().nullable(),
  region_text: z.string().nullable(),
  territory_id: z.string().nullable(),
  status: leadStatusSchema,
  source: z.string(),
  assigned_to: z.string().nullable(),
  assigned_to_name: z.string().nullable(),
  next_action_type: z.string().nullable(),
  next_action_at: z.string().nullable(),
  close_reason: z.string().nullable(),
  requested_features: z.array(z.string()).nullable(),
  created_at: z.string(),
});
export type Lead = z.infer<typeof leadSchema>;

// «سرنخ جدید» — کم‌فیلد اما دقیق (mock): 3 starred fields are enough
export const createLeadBodySchema = z.object({
  business_name: z.string().min(2).max(160),
  phone: z.string().min(5).max(20),
  region_text: z.string().min(1).max(120),
  territory_id: z.string().optional(),
  contact_name: z.string().max(120).optional(),
  business_type: z.string().max(60).optional(),
  source: z.string().max(40).default('manual'),
  // What the café asked for — vertical product codes, validated against the
  // vertical's list in the route. Free text here would be a field no report
  // can ever group by.
  requested_features: z.array(z.string().max(40)).max(10).optional(),
});

export const importLeadsBodySchema = z.object({
  source: z.string().max(40).default('csv_import'),
  default_territory_id: z.string().optional(),
  rows: z
    .array(
      z.object({
        business_name: z.string().min(2).max(160),
        phone: z.string().max(20).optional(),
        region_text: z.string().max(120).optional(),
        address_text: z.string().max(300).optional(),
        business_type: z.string().max(60).optional(),
        external_rating: z.string().max(20).optional(),
      }),
    )
    .min(1)
    .max(2000),
});

export const importLeadsResponseSchema = z.object({
  imported: z.number().int(),
  duplicates: z.array(
    z.object({ row_index: z.number().int(), reason: z.string(), existing_account_id: z.string() }),
  ),
});

export const assignLeadBodySchema = z.object({
  seller_id: z.string(),
  // manager override for cross-territory assignment (audited)
  override_territory: z.boolean().default(false),
});

// ── activities (visit/call log — the <2min flow 🔒) ─────────────────────────

export const logActivityBodySchema = z.object({
  account_id: z.string(),
  lead_id: z.string().optional(),
  opportunity_id: z.string().optional(),
  kind: activityKindSchema,
  outcome: z.string().max(60).optional(),
  note: z.string().max(2000).optional(),
  findings: z.record(z.unknown()).optional(),
  // 🔒 mandatory next action unless the outcome closes the lead
  next_action_type: z.string().max(60).optional(),
  next_action_at: z.string().datetime({ offset: true }).optional(),
  close_reason: z.string().max(60).optional(),
  occurred_at: z.string().datetime({ offset: true }).optional(),
});

export const activitySchema = z.object({
  id: z.string(),
  account_id: z.string(),
  kind: activityKindSchema,
  outcome: z.string().nullable(),
  note: z.string().nullable(),
  findings: z.record(z.unknown()).nullable(),
  next_action_type: z.string().nullable(),
  next_action_at: z.string().nullable(),
  seller_id: z.string().nullable(),
  seller_name: z.string().nullable(),
  occurred_at: z.string(),
});
export type Activity = z.infer<typeof activitySchema>;

// A promise the seller made, with a date on it. It lives either on the lead
// (pipeline work) or on the latest activity for a file that never was a lead —
// one shape either way, because the seller's day does not care which table the
// commitment happens to sit in.
export const commitmentSchema = z.object({
  lead_id: z.string().nullable(),
  account_id: z.string(),
  account_name: z.string(),
  region_text: z.string().nullable(),
  action_type: z.string().nullable(),
  due_at: z.string().nullable(),
  overdue: z.boolean(),
});
export type Commitment = z.infer<typeof commitmentSchema>;

// «امروز من» — the seller's day
export const todayResponseSchema = z.object({
  date: z.string(),
  due_actions: z.array(commitmentSchema),
  open_opportunities: z.number().int(),
  picked_today: z.number().int(),
});

// «کارها و یادآورها» — the same commitments over a horizon, bucketed by Tehran
// calendar day. Buckets are emitted even when empty so the day strip can show
// a free day as free instead of hiding it.
export const agendaResponseSchema = z.object({
  generated_at: z.string(),
  // Gregorian YYYY-MM-DD of Tehran's today — the anchor for the day strip.
  today: z.string(),
  overdue: z.array(commitmentSchema),
  days: z.array(
    z.object({
      date: z.string(), // Tehran calendar day, YYYY-MM-DD
      starts_at: z.string(), // the instant that day began, for formatting
      items: z.array(commitmentSchema),
    }),
  ),
});
export type AgendaResponse = z.infer<typeof agendaResponseSchema>;

// ── opportunities ───────────────────────────────────────────────────────────

export const opportunitySchema = z.object({
  id: z.string(),
  account_id: z.string(),
  account_name: z.string(),
  owner_id: z.string(),
  owner_name: z.string().nullable(),
  stage: z.string(),
  status: opportunityStatusSchema,
  amount_estimate_rial: rialAmountSchema.nullable(),
  win_reason: z.string().nullable(),
  loss_reason: z.string().nullable(),
  won_at: z.string().nullable(),
  // When the deal entered the stage it is in now — «۶ روز در این مرحله». A deal
  // that has sat in «مذاکره» for three weeks is the pipeline's loudest signal,
  // and `updated_at` cannot say it: any edit resets it.
  stage_entered_at: z.string(),
  created_at: z.string(),
});
export type Opportunity = z.infer<typeof opportunitySchema>;

// A card in «پایپلاین». The deal plus the commitment standing on its file, so
// the card can say «تماس امروز ۱۱:۰۰» or admit «قدم بعدی تعیین نشده».
export const pipelineItemSchema = opportunitySchema.extend({
  region_text: z.string().nullable(),
  next_action_type: z.string().nullable(),
  next_action_at: z.string().nullable(),
});
export type PipelineItem = z.infer<typeof pipelineItemSchema>;

export const pipelineResponseSchema = z.object({ items: z.array(pipelineItemSchema) });

export const createOpportunityBodySchema = z.object({
  account_id: z.string(),
  lead_id: z.string().optional(),
  stage: z.string().min(1).max(60),
  amount_estimate_rial: rialAmountSchema.optional(),
});

export const updateOpportunityBodySchema = z.object({
  stage: z.string().min(1).max(60).optional(),
  status: opportunityStatusSchema.optional(),
  win_reason: z.string().max(60).optional(),
  loss_reason: z.string().max(60).optional(),
  loss_note: z.string().max(500).optional(),
});

// ── detail views ────────────────────────────────────────────────────────────
// One entity + everything a screen needs to render it, in one round trip. The
// list endpoints answer "what should I work on"; these answer "what is the
// story of this one" — the timeline is the CRM's actual product.

export const attributionClaimSchema = z.object({
  seller_id: z.string(),
  seller_name: z.string(),
  first_touch_at: z.string(),
});

export const accountDetailSchema = z.object({
  account: accountSchema,
  timeline: z.array(activitySchema),
  // ★ معرِّف — 🔒 immutable first touch
  attribution: attributionClaimSchema.nullable(),
});

export const leadDetailSchema = z.object({
  lead: leadSchema,
  account: accountSchema,
  timeline: z.array(activitySchema),
  opportunities: z.array(opportunitySchema),
});

export const opportunityDetailSchema = z.object({
  opportunity: opportunitySchema,
  account: accountSchema,
  lead: leadSchema.nullable(),
  timeline: z.array(activitySchema),
});

// ── attribution ─────────────────────────────────────────────────────────────

export const myAttributionLinkResponseSchema = z.object({
  token: z.string(),
  demo_url: z.string(),
});
