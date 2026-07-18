// Commission ledger persistence (ADR-007) — THE single writer. 🔒 Rules:
// entries are append-only (amounts immutable forever); replays dedupe via the
// (org, source_event_id, beneficiary, entry_type) unique; clawback appends
// reversal entries; status moves ONLY through transition() and every move is
// audited append-only. The ledger-integrity CI guard bans update/delete on
// these tables anywhere outside this file.

import { type Db, commissionEntries, commissionEntryStatusAudit, orgScope } from '@arad-crm/db';
import { AradError, InvalidTransitionError } from '@arad/errors';
import { and, eq, isNull } from 'drizzle-orm';
import type { EntryDraft } from './engine.js';

export type EntryStatus =
  | 'estimated'
  | 'pending_finalization'
  | 'earned'
  | 'approved'
  | 'payable'
  | 'paid'
  | 'reversed'
  | 'disputed';

const TRANSITIONS: Record<EntryStatus, readonly EntryStatus[]> = {
  estimated: ['pending_finalization', 'earned', 'reversed', 'disputed'],
  pending_finalization: ['earned', 'reversed', 'disputed'],
  earned: ['approved', 'disputed', 'reversed'],
  approved: ['payable', 'paid', 'disputed'],
  payable: ['paid', 'disputed'],
  paid: ['disputed', 'reversed'],
  disputed: ['earned', 'approved', 'reversed'],
  reversed: [],
};

export interface AppendEarnInput {
  organizationId: string;
  sourceEventId: string;
  paymentRef: string;
  drafts: EntryDraft[];
  planVersionId: string;
  accountId?: string;
  opportunityId?: string;
  initialStatus?: Extract<EntryStatus, 'estimated' | 'earned'>;
}

export interface AppendResult {
  inserted: (typeof commissionEntries.$inferSelect)[];
  dedupedCount: number;
}

/** Append earn entries for one payment event. Idempotent: a replayed event
 *  inserts nothing and reports dedupedCount — never an error, never double
 *  money. Audit rows (NULL → status) ride the same transaction. */
export const appendEarnEntries = async (db: Db, input: AppendEarnInput): Promise<AppendResult> => {
  const status: EntryStatus = input.initialStatus ?? 'earned';
  return db.transaction(async (tx) => {
    const inserted: (typeof commissionEntries.$inferSelect)[] = [];
    for (const draft of input.drafts) {
      const rows = await tx
        .insert(commissionEntries)
        .values({
          organizationId: input.organizationId,
          sourceEventId: input.sourceEventId,
          paymentRef: input.paymentRef,
          beneficiaryUserId: draft.beneficiaryUserId,
          role: draft.role,
          entryType: 'earn',
          amountRial: draft.amountRial,
          planVersionId: input.planVersionId,
          ...(input.accountId ? { accountId: input.accountId } : {}),
          ...(input.opportunityId ? { opportunityId: input.opportunityId } : {}),
          status,
          basis: {
            ruleType: draft.basis.ruleType,
            netAmountRial: draft.basis.netAmountRial.toString(),
            percentBp: draft.basis.percentBp ?? null,
            shareBp: draft.basis.shareBp ?? null,
          },
        })
        .onConflictDoNothing({
          target: [
            commissionEntries.organizationId,
            commissionEntries.sourceEventId,
            commissionEntries.beneficiaryUserId,
            commissionEntries.entryType,
          ],
        })
        .returning();
      const row = rows[0];
      if (row) {
        inserted.push(row);
        await tx.insert(commissionEntryStatusAudit).values({
          organizationId: input.organizationId,
          entryId: row.id,
          fromStatus: null,
          toStatus: status,
          reason: `earn:${input.sourceEventId}`,
        });
      }
    }
    return { inserted, dedupedCount: input.drafts.length - inserted.length };
  });
};

export interface ReverseInput {
  organizationId: string;
  refundEventId: string; // the payment.refunded envelope id (idempotency root)
  paymentRef: string; // original payment id whose earns get clawed back
  reason: string;
}

/** Clawback 🔒: append a negative reversal entry per original earn and move the
 *  original to `reversed`. Idempotent via (org, refundEventId, beneficiary,
 *  'reversal'). Never mutates amounts. */
export const reverseForPayment = async (
  db: Db,
  input: ReverseInput,
): Promise<{ reversedCount: number; dedupedCount: number }> => {
  return db.transaction(async (tx) => {
    const earns = await tx
      .select()
      .from(commissionEntries)
      .where(
        and(
          orgScope(commissionEntries.organizationId, input.organizationId),
          eq(commissionEntries.paymentRef, input.paymentRef),
          eq(commissionEntries.entryType, 'earn'),
        ),
      );
    let reversedCount = 0;
    let dedupedCount = 0;
    for (const earn of earns) {
      const rows = await tx
        .insert(commissionEntries)
        .values({
          organizationId: input.organizationId,
          sourceEventId: input.refundEventId,
          paymentRef: input.paymentRef,
          beneficiaryUserId: earn.beneficiaryUserId,
          role: earn.role,
          entryType: 'reversal',
          amountRial: -earn.amountRial,
          planVersionId: earn.planVersionId,
          accountId: earn.accountId,
          opportunityId: earn.opportunityId,
          status: 'reversed',
          basis: { reversalOf: earn.id, reason: input.reason },
          reversesEntryId: earn.id,
          reason: input.reason,
        })
        .onConflictDoNothing({
          target: [
            commissionEntries.organizationId,
            commissionEntries.sourceEventId,
            commissionEntries.beneficiaryUserId,
            commissionEntries.entryType,
          ],
        })
        .returning();
      const row = rows[0];
      if (!row) {
        dedupedCount++;
        continue;
      }
      reversedCount++;
      await tx.insert(commissionEntryStatusAudit).values({
        organizationId: input.organizationId,
        entryId: row.id,
        fromStatus: null,
        toStatus: 'reversed',
        reason: input.reason,
      });
      if (earn.status !== 'reversed') {
        // the ONLY status write outside transition() — same append-audit rules
        await tx
          .update(commissionEntries)
          .set({ status: 'reversed' })
          .where(eq(commissionEntries.id, earn.id));
        await tx.insert(commissionEntryStatusAudit).values({
          organizationId: input.organizationId,
          entryId: earn.id,
          fromStatus: earn.status,
          toStatus: 'reversed',
          reason: input.reason,
        });
      }
    }
    return { reversedCount, dedupedCount };
  });
};

export interface TransitionInput {
  organizationId: string;
  entryId: string;
  to: EntryStatus;
  actorUserId?: string;
  reason?: string;
}

/** 🔒 The only legal status mutation. Validates the machine, audits the move. */
export const transitionEntry = async (
  db: Db,
  input: TransitionInput,
): Promise<typeof commissionEntries.$inferSelect> => {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(commissionEntries)
      .where(
        and(
          orgScope(commissionEntries.organizationId, input.organizationId),
          eq(commissionEntries.id, input.entryId),
          isNull(commissionEntries.reversesEntryId),
        ),
      );
    const entry = rows[0];
    if (!entry) throw new AradError('not_found', 'commission entry not found', 404);
    const from = entry.status as EntryStatus;
    if (!TRANSITIONS[from].includes(input.to)) {
      throw new InvalidTransitionError(`commission entry ${from} → ${input.to} is not allowed`, {
        entryId: input.entryId,
      });
    }
    const updated = await tx
      .update(commissionEntries)
      .set({ status: input.to })
      .where(eq(commissionEntries.id, input.entryId))
      .returning();
    await tx.insert(commissionEntryStatusAudit).values({
      organizationId: input.organizationId,
      entryId: input.entryId,
      fromStatus: from,
      toStatus: input.to,
      ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
      ...(input.reason ? { reason: input.reason } : {}),
    });
    const row = updated[0];
    if (!row) throw new AradError('internal_error', 'transition lost the entry', 500);
    return row;
  });
};

/** Derived seller totals — balances are never stored 🔒. */
export const sellerTotals = (
  entries: readonly { amountRial: bigint; status: string; entryType: string }[],
) => {
  let earnedTotal = 0n;
  let paid = 0n;
  let pending = 0n;
  let reversed = 0n;
  for (const e of entries) {
    if (e.entryType === 'reversal') {
      reversed += e.amountRial; // negative
      continue;
    }
    earnedTotal += e.amountRial;
    if (e.status === 'paid') paid += e.amountRial;
    else if (e.status !== 'reversed' && e.status !== 'disputed') pending += e.amountRial;
  }
  return { earnedTotal: earnedTotal + reversed, paid, pending, reversed };
};
