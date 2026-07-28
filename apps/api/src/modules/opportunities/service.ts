// The opportunities module's service surface: the wire projection, shared with
// the lead detail screen (which lists the deals a lead produced), plus the two
// questions other modules ask about deals — "is there money open on this file,
// and how much" (ADR-003 rule 6: nobody else joins into this table).

import { type Opportunity, opportunitySchema } from '@arad-crm/api-contracts';
import { db, opportunities, orgScope } from '@arad-crm/db';
import { type Column, and, eq, exists, inArray, sql } from 'drizzle-orm';

export const opportunityView = (
  o: typeof opportunities.$inferSelect,
  accountName: string,
  ownerName: string | null,
): Opportunity =>
  opportunitySchema.parse({
    id: o.id,
    account_id: o.accountId,
    account_name: accountName,
    owner_id: o.ownerId,
    owner_name: ownerName,
    stage: o.stage,
    status: o.status,
    amount_estimate_rial: o.amountEstimateRial?.toString() ?? null,
    win_reason: o.winReason,
    loss_reason: o.lossReason,
    won_at: o.wonAt?.toISOString() ?? null,
    stage_entered_at: o.stageEnteredAt.toISOString(),
    created_at: o.createdAt.toISOString(),
  });

/**
 * A predicate for "this account has an open deal", to be composed into another
 * module's WHERE clause — the «فرصت» segment of the account list, without that
 * module knowing the shape of this table.
 */
export const hasOpenDeal = (accountIdColumn: Column, orgId: string) =>
  exists(
    db
      .select({ one: sql`1` })
      .from(opportunities)
      .where(
        and(
          orgScope(opportunities.organizationId, orgId),
          eq(opportunities.accountId, accountIdColumn),
          eq(opportunities.status, 'open'),
        ),
      ),
  );

/** Open deal count and total estimate per account, for list rows. */
export const openDealsByAccount = async (
  orgId: string,
  accountIds: string[],
): Promise<Map<string, { count: number; valueRial: string }>> => {
  if (accountIds.length === 0) return new Map();
  const rows = await db
    .select({
      accountId: opportunities.accountId,
      count: sql<number>`count(*)::int`,
      // 🔒 summed as bigint in Postgres, out as a digit-string — never a JS number
      value: sql<string>`coalesce(sum(${opportunities.amountEstimateRial}), 0)::text`,
    })
    .from(opportunities)
    .where(
      and(
        orgScope(opportunities.organizationId, orgId),
        inArray(opportunities.accountId, accountIds),
        eq(opportunities.status, 'open'),
      ),
    )
    .groupBy(opportunities.accountId);
  return new Map(rows.map((r) => [r.accountId, { count: r.count, valueRial: r.value }]));
};
