// Commission plan rules (ADR-007). 🔒 Rules are a Zod DISCRIMINATED UNION —
// new rule kinds are additive variants the engine dispatches on, never a
// migration. Plan versions store `{ rules: Rule[] }` as immutable JSONB;
// percentages are BASIS POINTS (int, 10000 = 100%) — floats never touch money.

import { z } from 'zod';

const basisPoints = z.number().int().min(0).max(10_000);
const rialString = z.string().regex(/^[0-9]+$/, 'amount must be a digit string (Rial)');

// Split beneficiaries (dev spec §17: referrer/visitor/closer).
// @invariant-allow: local-enum engine-internal role vocabulary, not an API shape
export const shareRoleSchema = z.enum(['referrer', 'visitor', 'closer']);
export type ShareRole = z.infer<typeof shareRoleSchema>;

export const percentOfNetRule = z
  .object({
    type: z.literal('percent_of_net'),
    percent_bp: basisPoints,
  })
  .strict();

export const fixedPerSaleRule = z
  .object({
    type: z.literal('fixed_per_sale'),
    amount_rial: rialString,
  })
  .strict();

export const splitSharesRule = z
  .object({
    type: z.literal('split_shares'),
    percent_bp: basisPoints,
    shares: z.array(z.object({ role: shareRoleSchema, share_bp: basisPoints }).strict()).min(1),
  })
  .strict();

// Declared now, implemented when a plan needs it — engine throws
// UnsupportedRuleError, never silently ignores.
export const tieredRule = z
  .object({
    type: z.literal('tiered'),
    tiers: z
      .array(z.object({ up_to_rial: rialString.optional(), percent_bp: basisPoints }).strict())
      .min(1),
  })
  .strict();

// discriminatedUnion options must be plain objects (no ZodEffects), so
// cross-field checks like the split-sum invariant live on the union itself.
export const ruleSchema = z
  .discriminatedUnion('type', [percentOfNetRule, fixedPerSaleRule, splitSharesRule, tieredRule])
  .superRefine((rule, ctx) => {
    if (rule.type === 'split_shares') {
      const total = rule.shares.reduce((sum, s) => sum + s.share_bp, 0);
      if (total !== 10_000) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['shares'],
          message: `share_bp must sum to 10000, got ${total}`,
        });
      }
    }
  });
export type Rule = z.infer<typeof ruleSchema>;

export const planRulesSchema = z.object({ rules: z.array(ruleSchema).min(1) }).strict();
export type PlanRules = z.infer<typeof planRulesSchema>;
