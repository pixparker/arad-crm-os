// Commission + reporting wire shapes (ADR-007 🔒 explainable ledger).

import { z } from 'zod';
import { contractTypeSchema } from './auth.js';
import { rialAmountSchema } from './sales.js';

export const commissionEntryStatusSchema = z.enum([
  'estimated',
  'pending_finalization',
  'earned',
  'approved',
  'payable',
  'paid',
  'reversed',
  'disputed',
]);

export const commissionEntrySchema = z.object({
  id: z.string(),
  created_at: z.string(),
  account_id: z.string().nullable(),
  account_name: z.string().nullable(),
  entry_type: z.enum(['earn', 'reversal', 'adjustment']),
  amount_rial: rialAmountSchema, // signed; reversals negative (کلاوبک)
  status: commissionEntryStatusSchema,
  // 🔒 the formula the money panel shows: rule type + inputs snapshot
  basis: z.record(z.unknown()),
  payment_ref: z.string().nullable(),
  reason: z.string().nullable(),
});

export const myCommissionResponseSchema = z.object({
  totals: z.object({
    earned_total_rial: rialAmountSchema, // net of reversals
    paid_rial: rialAmountSchema,
    pending_rial: rialAmountSchema,
    reversed_rial: rialAmountSchema, // negative (کلاوبک)
  }),
  entries: z.array(commissionEntrySchema),
});

export const approveEntryBodySchema = z.object({
  reason: z.string().max(300).optional(),
});

// ── manager reports (founder req #5: efficiency, keep/cut decisions) ────────

export const teamPerformanceRowSchema = z.object({
  seller_id: z.string(),
  display_name: z.string(),
  contract_type: contractTypeSchema,
  territory_name: z.string().nullable(),
  visits_30d: z.number().int(),
  calls_30d: z.number().int(),
  leads_assigned_open: z.number().int(),
  opps_open: z.number().int(),
  opps_won_total: z.number().int(),
  // conversion: won opps / (won + lost + open) — funnel effectiveness
  conversion_pct: z.number(),
  attributed_net_revenue_rial: rialAmountSchema,
  commission_earned_rial: rialAmountSchema,
  // efficiency: net revenue per field activity — profitable vs not
  revenue_per_activity_rial: rialAmountSchema,
  active_customers: z.number().int(),
});

export const teamPerformanceResponseSchema = z.object({
  rows: z.array(teamPerformanceRowSchema),
});

export const funnelResponseSchema = z.object({
  stages: z.array(
    z.object({
      stage: z.string(),
      count: z.number().int(),
      value_rial: rialAmountSchema,
    }),
  ),
  won_count: z.number().int(),
  lost_count: z.number().int(),
  leads_new: z.number().int(),
  leads_assigned: z.number().int(),
});
