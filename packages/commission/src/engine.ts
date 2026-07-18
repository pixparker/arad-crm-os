// Pure commission calculation engine (ADR-007): plan rules × commission event
// → entry drafts. Zero I/O — persistence (append-only ledger, idempotency,
// status machine) wraps this in the commission module. All money is bigint
// Rial; splits distribute remainders deterministically (first listed share
// takes the remainder) so drafts ALWAYS sum exactly to the rule output.

import { AradError } from '@arad/errors';
import type { PlanRules, Rule, ShareRole } from './rules.js';

export class UnsupportedRuleError extends AradError {
  constructor(type: string) {
    super('config_invariant', `commission rule type not implemented: ${type}`, 500);
  }
}

export type CommissionTrigger = 'new_payment' | 'renewal' | 'upgrade';

export interface CommissionEventInput {
  /** Producer event id (payment.received envelope id) — idempotency root. */
  sourceEventId: string;
  organizationId: string;
  trigger: CommissionTrigger;
  /** 🔒 Calc base: net collected Rial from the producer, never re-derived. */
  netAmountRial: bigint;
  /** Resolved beneficiaries by role; single-seller plans map everything to 'closer'. */
  beneficiaries: Partial<Record<ShareRole, string>>;
}

export interface EntryDraft {
  beneficiaryUserId: string;
  role: ShareRole;
  amountRial: bigint;
  /** Inputs snapshot for the money-panel explainability requirement 🔒. */
  basis: {
    ruleType: Rule['type'];
    netAmountRial: bigint;
    shareBp?: number;
    percentBp?: number;
  };
}

const bp = (amount: bigint, basisPoints: number): bigint =>
  (amount * BigInt(basisPoints)) / 10_000n;

const requireBeneficiary = (event: CommissionEventInput, role: ShareRole): string => {
  const id = event.beneficiaries[role];
  if (!id) {
    throw new AradError('config_invariant', `no beneficiary resolved for role: ${role}`, 500, {
      sourceEventId: event.sourceEventId,
    });
  }
  return id;
};

const applyRule = (rule: Rule, event: CommissionEventInput): EntryDraft[] => {
  switch (rule.type) {
    case 'percent_of_net': {
      const amount = bp(event.netAmountRial, rule.percent_bp);
      return [
        {
          beneficiaryUserId: requireBeneficiary(event, 'closer'),
          role: 'closer',
          amountRial: amount,
          basis: {
            ruleType: rule.type,
            netAmountRial: event.netAmountRial,
            percentBp: rule.percent_bp,
          },
        },
      ];
    }
    case 'fixed_per_sale': {
      return [
        {
          beneficiaryUserId: requireBeneficiary(event, 'closer'),
          role: 'closer',
          amountRial: BigInt(rule.amount_rial),
          basis: { ruleType: rule.type, netAmountRial: event.netAmountRial },
        },
      ];
    }
    case 'split_shares': {
      const pot = bp(event.netAmountRial, rule.percent_bp);
      const drafts: EntryDraft[] = rule.shares.map((share) => ({
        beneficiaryUserId: requireBeneficiary(event, share.role),
        role: share.role,
        amountRial: bp(pot, share.share_bp),
        basis: {
          ruleType: rule.type,
          netAmountRial: event.netAmountRial,
          percentBp: rule.percent_bp,
          shareBp: share.share_bp,
        },
      }));
      // 🔒 invariant: drafts sum exactly to the pot — first share absorbs
      // integer-division remainder deterministically.
      const distributed = drafts.reduce((sum, d) => sum + d.amountRial, 0n);
      const first = drafts[0];
      if (first) first.amountRial += pot - distributed;
      return drafts;
    }
    case 'tiered':
      throw new UnsupportedRuleError(rule.type);
  }
};

/** Compute all entry drafts for one commission event under one plan version. */
export const computeEntries = (plan: PlanRules, event: CommissionEventInput): EntryDraft[] =>
  plan.rules.flatMap((rule) => applyRule(rule, event));
