// Golden scenarios + invariants for the pure engine (ADR-007). The db-tier
// suite (idempotent append, reversal symmetry, status machine) lands with the
// persistence layer.

import { describe, expect, it } from 'vitest';
import { type CommissionEventInput, UnsupportedRuleError, computeEntries } from '../engine.js';
import { planRulesSchema } from '../rules.js';

const event = (net: bigint): CommissionEventInput => ({
  sourceEventId: 'evt-1',
  organizationId: 'org-1',
  trigger: 'new_payment',
  netAmountRial: net,
  beneficiaries: { closer: 'seller-close', visitor: 'seller-visit', referrer: 'seller-ref' },
});

describe('percent_of_net', () => {
  it('golden: 7% of 13,500,000 Rial = 945,000 Rial to the closer', () => {
    const plan = planRulesSchema.parse({ rules: [{ type: 'percent_of_net', percent_bp: 700 }] });
    const drafts = computeEntries(plan, event(13_500_000n));
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.amountRial).toBe(945_000n);
    expect(drafts[0]?.beneficiaryUserId).toBe('seller-close');
    expect(drafts[0]?.basis.percentBp).toBe(700);
  });

  it('truncates toward zero — never mints fractional Rial', () => {
    const plan = planRulesSchema.parse({ rules: [{ type: 'percent_of_net', percent_bp: 333 }] });
    const drafts = computeEntries(plan, event(1_000n));
    expect(drafts[0]?.amountRial).toBe(33n); // 33.3 → 33
  });
});

describe('fixed_per_sale', () => {
  it('golden: flat 500,000 Rial per sale', () => {
    const plan = planRulesSchema.parse({
      rules: [{ type: 'fixed_per_sale', amount_rial: '500000' }],
    });
    expect(computeEntries(plan, event(13_500_000n))[0]?.amountRial).toBe(500_000n);
  });
});

describe('split_shares', () => {
  const plan = planRulesSchema.parse({
    rules: [
      {
        type: 'split_shares',
        percent_bp: 1_000, // 10% pot
        shares: [
          { role: 'visitor', share_bp: 5_000 },
          { role: 'closer', share_bp: 3_000 },
          { role: 'referrer', share_bp: 2_000 },
        ],
      },
    ],
  });

  it('golden: 10% pot of 13,500,000 = 1,350,000 split 50/30/20', () => {
    const drafts = computeEntries(plan, event(13_500_000n));
    expect(drafts.map((d) => [d.role, d.amountRial])).toEqual([
      ['visitor', 675_000n],
      ['closer', 405_000n],
      ['referrer', 270_000n],
    ]);
  });

  it('🔒 invariant: shares sum EXACTLY to the pot across awkward amounts', () => {
    for (const net of [1n, 7n, 999n, 1_001n, 33_333n, 123_456_789n, 999_999_999_999n]) {
      const drafts = computeEntries(plan, event(net));
      const pot = (net * 1_000n) / 10_000n;
      const sum = drafts.reduce((acc, d) => acc + d.amountRial, 0n);
      expect(sum).toBe(pot);
    }
  });

  it('rejects a plan whose shares do not sum to 10000bp', () => {
    expect(() =>
      planRulesSchema.parse({
        rules: [
          {
            type: 'split_shares',
            percent_bp: 1_000,
            shares: [
              { role: 'visitor', share_bp: 5_000 },
              { role: 'closer', share_bp: 4_999 },
            ],
          },
        ],
      }),
    ).toThrow();
  });
});

describe('safety rails', () => {
  it('unimplemented rule types throw loudly, never silently skip', () => {
    const plan = planRulesSchema.parse({
      rules: [{ type: 'tiered', tiers: [{ percent_bp: 500 }] }],
    });
    expect(() => computeEntries(plan, event(1_000n))).toThrow(UnsupportedRuleError);
  });

  it('missing beneficiary for a role is a loud config error', () => {
    const plan = planRulesSchema.parse({ rules: [{ type: 'percent_of_net', percent_bp: 700 }] });
    const bad = { ...event(1_000n), beneficiaries: {} };
    expect(() => computeEntries(plan, bad)).toThrow(/no beneficiary resolved/);
  });
});
