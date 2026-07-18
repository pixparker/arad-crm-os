// Structured visit findings → account attributes (founder requirement:
// "cafe-abc is luxury → offer VIP; cafe-xyz traditional, bored with previous
// provider"). Stored on activities.findings (raw, per-visit) and merged into
// accounts.attributes (latest state), validated HERE (ADR-010: the JSONB
// escape hatch is always vertical-schema-validated, never free-form).

import { z } from 'zod';

// @invariant-allow: local-enum vertical findings vocabulary, not an API shape
const segment = z.enum(['luxury', 'modern', 'traditional', 'casual', 'other']);
// @invariant-allow: local-enum vertical findings vocabulary, not an API shape
const offerHint = z.enum(['vip', 'pro', 'standard', 'basic']);
// @invariant-allow: local-enum vertical findings vocabulary, not an API shape
const currentMenu = z.enum(['none', 'paper', 'competitor_digital', 'old_own', 'unknown']);

export const findingsSchema = z
  .object({
    segment: segment.optional(),
    offer_hint: offerHint.optional(),
    current_menu: currentMenu.optional(),
    main_problem: z.string().max(300).optional(),
    decision_maker: z
      .object({
        name: z.string().max(120).optional(),
        role: z.string().max(120).optional(),
        met: z.boolean().optional(),
      })
      .strict()
      .optional(),
    interest_level: z.number().int().min(1).max(5).optional(),
  })
  .strict();

export type Findings = z.infer<typeof findingsSchema>;

/** Merge new findings over existing account attributes (shallow; explicit
 *  undefineds are dropped — a visit only updates what it learned). */
export const mergeFindings = (
  current: Record<string, unknown>,
  incoming: Findings,
): Record<string, unknown> => {
  const clean = Object.fromEntries(Object.entries(incoming).filter(([, v]) => v !== undefined));
  return { ...current, ...clean };
};
