// The account file's interaction timeline, as a service — the account, lead and
// opportunity detail screens all render the same history, and it is the
// activities module's table, so they read it through here instead of joining
// into it themselves (ADR-003 rule 2).

import { type Activity, type Commitment, activitySchema } from '@arad-crm/api-contracts';
import { accounts, activities, db, leads, orgScope, users } from '@arad-crm/db';
import { and, desc, eq, inArray, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import { startOfDayTehran } from '../../lib/tehran-time.js';

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

/**
 * When each of these accounts was last touched by anyone — the number behind
 * «۶ روز بی‌تماس». Other modules ask for it here rather than reading the
 * activity table themselves (ADR-003 rule 6).
 */
export const lastTouchByAccount = async (
  orgId: string,
  accountIds: string[],
): Promise<Map<string, string>> => {
  if (accountIds.length === 0) return new Map();
  const rows = await db
    .select({ accountId: activities.accountId, at: sql<string>`max(${activities.occurredAt})` })
    .from(activities)
    .where(
      and(orgScope(activities.organizationId, orgId), inArray(activities.accountId, accountIds)),
    )
    .groupBy(activities.accountId);
  return new Map(rows.map((r) => [r.accountId, new Date(r.at).toISOString()]));
};

/**
 * Every dated promise this seller is carrying, due at or before `until`.
 *
 * 🔒 A commitment lives in one of two places and the seller's day must contain
 * both: on the LEAD while the lead is still being worked, or on the seller's
 * latest ACTIVITY for the file otherwise. The second case is not an edge —
 * it covers the ＋'s «مشتری» (a file that never was a lead) AND every deal, because
 * opening an opportunity marks its lead `qualified` and the lead stops
 * carrying anything. Reading leads alone loses both, which is the "nothing
 * rots" invariant failing silently on the main path. `/today`, `/agenda` and
 * the dashboard's due banner all read through here so they cannot disagree
 * about what is owed.
 *
 * The standing activity-carried commitment is the one on the seller's LATEST
 * activity for that account: a newer visit supersedes what the last one
 * promised, and a visit that CLOSED the file carries no promise at all, so the
 * file falls off the list by itself. At most one per account, by construction.
 */
export const openCommitments = async (
  orgId: string,
  sellerId: string,
  until: Date,
): Promise<Commitment[]> => {
  const startOfToday = startOfDayTehran();

  const fromLeads = await db
    .select({ lead: leads, account: accounts })
    .from(leads)
    .innerJoin(accounts, eq(accounts.id, leads.accountId))
    .where(
      and(
        orgScope(leads.organizationId, orgId),
        eq(leads.assignedTo, sellerId),
        inArray(leads.status, ['assigned', 'in_progress']),
        isNotNull(leads.nextActionAt),
        lte(leads.nextActionAt, until),
      ),
    )
    .orderBy(leads.nextActionAt)
    .limit(200);

  const latestPerAccount = db
    .select({
      accountId: activities.accountId,
      at: sql<Date>`max(${activities.occurredAt})`.as('at'),
    })
    .from(activities)
    .where(and(orgScope(activities.organizationId, orgId), eq(activities.sellerId, sellerId)))
    .groupBy(activities.accountId)
    .as('latest_per_account');

  const fromActivities = await db
    .select({ activity: activities, account: accounts })
    .from(activities)
    .innerJoin(
      latestPerAccount,
      and(
        eq(activities.accountId, latestPerAccount.accountId),
        eq(activities.occurredAt, latestPerAccount.at),
      ),
    )
    .innerJoin(accounts, eq(accounts.id, activities.accountId))
    .where(
      and(
        orgScope(activities.organizationId, orgId),
        eq(activities.sellerId, sellerId),
        isNotNull(activities.nextActionAt),
        lte(activities.nextActionAt, until),
      ),
    )
    .orderBy(activities.nextActionAt)
    .limit(200);

  // An open lead already speaks for its file — the two rows carry the same
  // promise, and listing both would show the seller one commitment twice.
  const spokenFor = new Set(fromLeads.map((d) => d.account.id));

  return [
    ...fromLeads.map((d) => ({
      lead_id: d.lead.id,
      account_id: d.account.id,
      account_name: d.account.name,
      region_text: d.account.regionText,
      action_type: d.lead.nextActionType,
      due_at: d.lead.nextActionAt?.toISOString() ?? null,
      overdue: (d.lead.nextActionAt?.getTime() ?? 0) < startOfToday.getTime(),
    })),
    ...fromActivities
      .filter((s) => !spokenFor.has(s.account.id))
      .map((s) => ({
        lead_id: s.activity.leadId,
        account_id: s.account.id,
        account_name: s.account.name,
        region_text: s.account.regionText,
        action_type: s.activity.nextActionType,
        due_at: s.activity.nextActionAt?.toISOString() ?? null,
        overdue: (s.activity.nextActionAt?.getTime() ?? 0) < startOfToday.getTime(),
      })),
  ].sort((a, b) => (a.due_at ?? '').localeCompare(b.due_at ?? ''));
};

/**
 * The same commitments keyed by account, for list screens that need to say
 * «تماس امروز ۱۱:۰۰» or admit «بدون قدم بعدی» next to each row. Horizon-free:
 * a follow-up three weeks out still means the file is not rotting.
 */
export const commitmentsByAccount = async (
  orgId: string,
  sellerId: string,
  accountIds: string[],
): Promise<Map<string, Commitment>> => {
  if (accountIds.length === 0) return new Map();
  const far = new Date(Date.now() + 365 * 86_400_000);
  const all = await openCommitments(orgId, sellerId, far);
  const wanted = new Set(accountIds);
  const byAccount = new Map<string, Commitment>();
  // Sorted soonest-first, so the first hit per account is the one that matters.
  for (const commitment of all) {
    if (!wanted.has(commitment.account_id)) continue;
    if (!byAccount.has(commitment.account_id)) byAccount.set(commitment.account_id, commitment);
  }
  return byAccount;
};
