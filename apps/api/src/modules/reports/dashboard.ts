// GET /v1/reports/dashboard — the seller's home screen in one round trip
// (prototype screen ۰۲). A read model over other modules' tables: nothing here
// is authoritative, everything is derived.
//
// 🔒 Own book only. Every query filters on the actor: their opportunities,
// their commission entries, their due actions, their territory. There is no
// role that widens it — the team view is `/team-performance`, which is
// role-gated. A seller must never read another seller's pipeline (README §5.5).
//
// 🔒 Money is summed as bigint in Postgres and leaves as a digit-string. The
// aggregate is never a JS number: 42_500_000_000 Rial is fine in a double, and
// the first sum that is not would be silently wrong.

import {
  type DashboardResponse,
  dashboardResponseSchema,
  rialAmountSchema,
} from '@arad-crm/api-contracts';
import {
  accounts,
  activities,
  commissionEntries,
  db,
  leads,
  opportunities,
  orgScope,
} from '@arad-crm/db';
import { OPPORTUNITY_STAGES } from '@arad-crm/vertical-mizro';
import { and, eq, gte, inArray, isNotNull, isNull, lte, ne, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { startOfDayTehran, startOfJalaliMonthTehran } from '../../lib/tehran-time.js';
import { isSeller, requireActor } from '../../middleware/session.js';

const faNum = new Intl.NumberFormat('fa-IR');
const fa = (n: number): string => faNum.format(n);

// Thresholds live here, not in the app: tuning "when does a deal look stale"
// is a sales decision, and it should not need a release.
const EXPIRING_WITHIN_DAYS = 14;
const STALE_AFTER_DAYS = 6;
const ATTENTION_LIMIT = 6;

const days = (n: number): number => n * 86_400_000;

type Attention = DashboardResponse['attention'][number];

export const dashboard = async (c: Context): Promise<Response> => {
  const actor = requireActor(c);
  const now = new Date();
  const startOfDay = startOfDayTehran(now);
  const endOfDay = new Date(startOfDay.getTime() + days(1) - 1);
  const monthStart = startOfJalaliMonthTehran(now);

  // ── KPI: open pipeline, by stage ────────────────────────────────────────
  const stageRows = await db
    .select({
      stage: opportunities.stage,
      count: sql<number>`count(*)::int`,
      value: sql<string>`coalesce(sum(${opportunities.amountEstimateRial}), 0)::text`,
    })
    .from(opportunities)
    .where(
      and(
        orgScope(opportunities.organizationId, actor.orgId),
        eq(opportunities.ownerId, actor.userId),
        eq(opportunities.status, 'open'),
      ),
    )
    .groupBy(opportunities.stage);

  const byStage = new Map(stageRows.map((r) => [r.stage, r]));
  // The vertical's stage list is the spine, so an empty stage still shows as a
  // gap in the funnel instead of vanishing from it.
  const stages = OPPORTUNITY_STAGES.map((s) => ({
    code: s.code,
    label: s.label,
    count: byStage.get(s.code)?.count ?? 0,
    value_rial: rialAmountSchema.parse(byStage.get(s.code)?.value ?? '0'),
  }));

  const pipelineValue = stageRows.reduce((sum, r) => sum + BigInt(r.value), 0n);
  const openDeals = stageRows.reduce((sum, r) => sum + r.count, 0);

  // ── KPI: conversion over the last 90 days ───────────────────────────────
  const [closed] = await db
    .select({
      won: sql<number>`count(*) filter (where ${opportunities.status} = 'won')::int`,
      lost: sql<number>`count(*) filter (where ${opportunities.status} = 'lost')::int`,
    })
    .from(opportunities)
    .where(
      and(
        orgScope(opportunities.organizationId, actor.orgId),
        eq(opportunities.ownerId, actor.userId),
        ne(opportunities.status, 'open'),
        gte(opportunities.createdAt, new Date(now.getTime() - days(90))),
      ),
    );
  const decided = (closed?.won ?? 0) + (closed?.lost ?? 0);
  const conversionPct = decided === 0 ? null : Math.round(((closed?.won ?? 0) / decided) * 100);

  // ── KPI: commission earned this Jalali month ────────────────────────────
  // Reversals are negative entries in the same append-only ledger, so summing
  // the whole month is the correct figure — never filter them out. 🔒
  const [commission] = await db
    .select({ total: sql<string>`coalesce(sum(${commissionEntries.amountRial}), 0)::text` })
    .from(commissionEntries)
    .where(
      and(
        orgScope(commissionEntries.organizationId, actor.orgId),
        eq(commissionEntries.beneficiaryUserId, actor.userId),
        gte(commissionEntries.createdAt, monthStart),
      ),
    );

  // ── due today / overdue (the banner) ────────────────────────────────────
  const dueRows = await db
    .select({ name: accounts.name, at: leads.nextActionAt })
    .from(leads)
    .innerJoin(accounts, eq(accounts.id, leads.accountId))
    .where(
      and(
        orgScope(leads.organizationId, actor.orgId),
        eq(leads.assignedTo, actor.userId),
        inArray(leads.status, ['assigned', 'in_progress']),
        isNotNull(leads.nextActionAt),
        lte(leads.nextActionAt, endOfDay),
      ),
    )
    .orderBy(leads.nextActionAt)
    .limit(100);

  const overdue = dueRows.filter((r) => (r.at?.getTime() ?? 0) < startOfDay.getTime());

  // ── «نیاز به توجه» ──────────────────────────────────────────────────────
  const attention: Attention[] = [];

  // 1. Subscriptions about to lapse — the renewal conversation has a deadline.
  const expiring = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      plan: accounts.mizroPlan,
      endsAt: accounts.mizroSubscriptionEndsAt,
    })
    .from(accounts)
    .where(
      and(
        orgScope(accounts.organizationId, actor.orgId),
        eq(accounts.status, 'customer'),
        isNotNull(accounts.mizroSubscriptionEndsAt),
        gte(accounts.mizroSubscriptionEndsAt, now),
        lte(accounts.mizroSubscriptionEndsAt, new Date(now.getTime() + days(EXPIRING_WITHIN_DAYS))),
        // 🔒 seller visibility: own territory only
        ...(isSeller(actor.role) && actor.territoryId
          ? [eq(accounts.territoryId, actor.territoryId)]
          : []),
      ),
    )
    .orderBy(accounts.mizroSubscriptionEndsAt)
    .limit(ATTENTION_LIMIT);

  for (const row of expiring) {
    if (isSeller(actor.role) && !actor.territoryId) break;
    const daysLeft = Math.max(
      0,
      Math.ceil(((row.endsAt?.getTime() ?? 0) - now.getTime()) / days(1)),
    );
    attention.push({
      kind: 'subscription_expiring',
      severity: daysLeft <= 7 ? 'warning' : 'info',
      account_id: row.id,
      lead_id: null,
      opportunity_id: null,
      title: row.name,
      detail: row.plan ? `اشتراک ${row.plan} · مشتری فعال` : 'مشتری فعال',
      badge: `${fa(daysLeft)} روز تا انقضا`,
    });
  }

  // 2. Open deals that have gone quiet. `max(occurred_at)` per opportunity's
  //    account, because a visit logged on the file counts as contact.
  const lastTouch = db
    .select({
      accountId: activities.accountId,
      at: sql<Date>`max(${activities.occurredAt})`.as('at'),
    })
    .from(activities)
    .where(orgScope(activities.organizationId, actor.orgId))
    .groupBy(activities.accountId)
    .as('last_touch');

  const stale = await db
    .select({
      id: opportunities.id,
      accountId: accounts.id,
      name: accounts.name,
      stage: opportunities.stage,
      lastAt: lastTouch.at,
      createdAt: opportunities.createdAt,
    })
    .from(opportunities)
    .innerJoin(accounts, eq(accounts.id, opportunities.accountId))
    .leftJoin(lastTouch, eq(lastTouch.accountId, opportunities.accountId))
    .where(
      and(
        orgScope(opportunities.organizationId, actor.orgId),
        eq(opportunities.ownerId, actor.userId),
        eq(opportunities.status, 'open'),
        sql`coalesce(${lastTouch.at}, ${opportunities.createdAt}) < ${new Date(now.getTime() - days(STALE_AFTER_DAYS))}`,
      ),
    )
    .orderBy(sql`coalesce(${lastTouch.at}, ${opportunities.createdAt})`)
    .limit(ATTENTION_LIMIT);

  const stageLabel = (code: string): string =>
    OPPORTUNITY_STAGES.find((s) => s.code === code)?.label ?? code;

  for (const row of stale) {
    const since = row.lastAt ?? row.createdAt;
    const quietDays = Math.floor((now.getTime() - new Date(since).getTime()) / days(1));
    attention.push({
      kind: 'stale_opportunity',
      severity: quietDays >= 14 ? 'danger' : 'warning',
      account_id: row.accountId,
      lead_id: null,
      opportunity_id: row.id,
      title: row.name,
      detail: `فرصت — مرحلهٔ ${stageLabel(row.stage)}`,
      badge: `${fa(quietDays)} روز بی‌تماس`,
    });
  }

  // 3. Leads nobody has picked up. For a seller this is their own territory —
  //    the same rule `GET /v1/leads?view=pickable` applies, so what shows here
  //    is exactly what they are allowed to claim.
  const pickable =
    isSeller(actor.role) && !actor.territoryId
      ? []
      : await db
          .select({
            id: leads.id,
            accountId: accounts.id,
            name: accounts.name,
            at: leads.createdAt,
          })
          .from(leads)
          .innerJoin(accounts, eq(accounts.id, leads.accountId))
          .where(
            and(
              orgScope(leads.organizationId, actor.orgId),
              isNull(leads.assignedTo),
              eq(leads.status, 'new'),
              ...(isSeller(actor.role) && actor.territoryId
                ? [eq(accounts.territoryId, actor.territoryId)]
                : []),
            ),
          )
          .orderBy(leads.createdAt)
          .limit(ATTENTION_LIMIT);

  for (const row of pickable) {
    attention.push({
      kind: 'unassigned_lead',
      severity: 'info',
      account_id: row.accountId,
      lead_id: row.id,
      opportunity_id: null,
      title: row.name,
      detail: 'سرنخ تازه — هنوز برداشته نشده',
      badge: 'تخصیص‌نیافته',
    });
  }

  const severityRank = { danger: 0, warning: 1, info: 2 } as const;

  return c.json(
    dashboardResponseSchema.parse({
      date: now.toISOString(),
      kpis: {
        pipeline_value_rial: pipelineValue.toString(),
        open_deals: openDeals,
        conversion_rate_pct: conversionPct,
        commission_month_rial: commission?.total ?? '0',
      },
      due: {
        today: dueRows.length,
        overdue: overdue.length,
        overdue_names: overdue.slice(0, 2).map((r) => r.name),
      },
      stages,
      attention: attention
        .sort((a, b) => severityRank[a.severity] - severityRank[b.severity])
        .slice(0, ATTENTION_LIMIT),
    }),
  );
};
