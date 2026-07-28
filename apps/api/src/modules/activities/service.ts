// The account file's interaction timeline, as a service — the account, lead and
// opportunity detail screens all render the same history, and it is the
// activities module's table, so they read it through here instead of joining
// into it themselves (ADR-003 rule 2).

import { type Activity, activitySchema } from '@arad-crm/api-contracts';
import { activities, db, orgScope, users } from '@arad-crm/db';
import { and, desc, eq } from 'drizzle-orm';

export const accountTimeline = async (
  orgId: string,
  accountId: string,
  limit = 50,
): Promise<Activity[]> => {
  const rows = await db
    .select({ activity: activities, sellerName: users.displayName })
    .from(activities)
    .leftJoin(users, eq(users.id, activities.sellerId))
    .where(and(orgScope(activities.organizationId, orgId), eq(activities.accountId, accountId)))
    .orderBy(desc(activities.occurredAt))
    .limit(limit);

  return rows.map((t) =>
    activitySchema.parse({
      id: t.activity.id,
      account_id: t.activity.accountId,
      kind: t.activity.kind,
      outcome: t.activity.outcome,
      note: t.activity.note,
      findings: (t.activity.findings as Record<string, unknown> | null) ?? null,
      next_action_type: t.activity.nextActionType,
      next_action_at: t.activity.nextActionAt?.toISOString() ?? null,
      seller_id: t.activity.sellerId,
      seller_name: t.sellerName ?? null,
      occurred_at: t.activity.occurredAt.toISOString(),
    }),
  );
};
