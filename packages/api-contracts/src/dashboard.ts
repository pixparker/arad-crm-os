// The seller's home screen (prototype screen ۰۲ «داشبورد»), as one contract.
//
// It is a READ MODEL, not a new domain: every number here is derived from the
// leads, opportunities, activities and commission entries the other modules
// own. It exists because the home screen is the first thing a seller opens in
// the field, on a phone, on a slow connection — five parallel requests to
// assemble one screen is how that turns into a spinner.
//
// 🔒 Scope is always the ACTOR'S OWN BOOK: their opportunities, their
// commission, their due actions. A manager sees their own too — the team view
// is `/v1/reports/team-performance`, which is role-gated for a reason.

import { z } from 'zod';
import { rialAmountSchema } from './sales.js';

export const dashboardStageSchema = z.object({
  code: z.string(),
  label: z.string(),
  count: z.number().int(),
  // 🔒 money on the wire is a digit-string of Rial, never a JS number
  value_rial: rialAmountSchema,
});

// What the «نیاز به توجه» list surfaces. Each kind is a rule the seller cannot
// reasonably run in their head: a subscription about to lapse, a deal going
// quiet, a lead in their territory nobody has picked up.
export const dashboardAttentionKindSchema = z.enum([
  'subscription_expiring',
  'stale_opportunity',
  'unassigned_lead',
]);

export const dashboardAttentionSchema = z.object({
  kind: dashboardAttentionKindSchema,
  severity: z.enum(['info', 'warning', 'danger']),
  account_id: z.string().nullable(),
  lead_id: z.string().nullable(),
  opportunity_id: z.string().nullable(),
  title: z.string(),
  detail: z.string(),
  // Pre-formatted fa-IR badge ("۹ روز تا انقضا") — the rule that produced it
  // lives server-side, so tuning the thresholds does not need an app release.
  badge: z.string(),
});

export const dashboardResponseSchema = z.object({
  date: z.string().datetime(),
  kpis: z.object({
    pipeline_value_rial: rialAmountSchema,
    open_deals: z.number().int(),
    // null until there is at least one closed deal — a "0٪ conversion" on an
    // empty history is a lie about performance, not a measurement.
    conversion_rate_pct: z.number().int().nullable(),
    commission_month_rial: rialAmountSchema,
  }),
  due: z.object({
    today: z.number().int(),
    overdue: z.number().int(),
    // The two accounts behind the overdue banner, for its subtitle.
    overdue_names: z.array(z.string()),
  }),
  stages: z.array(dashboardStageSchema),
  attention: z.array(dashboardAttentionSchema),
});
export type DashboardResponse = z.infer<typeof dashboardResponseSchema>;
