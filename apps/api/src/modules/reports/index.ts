// Reports (founder req #5): per-seller efficiency — who is profitable, who
// isn't, normalized by activity; funnel for the manager. Pilot scale = live
// SQL; rollups are the named perf seam (requirements-fit #4).

import { funnelResponseSchema, teamPerformanceResponseSchema } from '@arad-crm/api-contracts';
import {
  accounts,
  activities,
  attributionClaims,
  commissionEntries,
  db,
  leads,
  opportunities,
  orgMembers,
  orgScope,
  territories,
  users,
} from '@arad-crm/db';
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { requireRole, session } from '../../middleware/session.js';

export const reportsRoutes = new Hono()
  .use('*', session())
  .get('/team-performance', async (c) => {
    const actor = requireRole(c, 'sales_manager', 'owner_admin', 'finance');
    const since30d = new Date(Date.now() - 30 * 24 * 3600 * 1000);

    const sellers = await db
      .select({
        userId: users.id,
        displayName: users.displayName,
        contractType: orgMembers.contractType,
        territoryName: territories.name,
      })
      .from(orgMembers)
      .innerJoin(users, eq(users.id, orgMembers.userId))
      .leftJoin(territories, eq(territories.id, orgMembers.territoryId))
      .where(
        and(
          orgScope(orgMembers.organizationId, actor.orgId),
          inArray(orgMembers.role, ['visitor_seller', 'followup_seller']),
        ),
      );

    const rows = [];
    for (const s of sellers) {
      const [acts] = await db
        .select({
          visits: sql<number>`count(*) filter (where ${activities.kind} = 'visit')::int`,
          calls: sql<number>`count(*) filter (where ${activities.kind} = 'call')::int`,
          all30d: sql<number>`count(*) filter (where ${activities.occurredAt} >= ${since30d})::int`,
        })
        .from(activities)
        .where(
          and(
            orgScope(activities.organizationId, actor.orgId),
            eq(activities.sellerId, s.userId),
            gte(activities.occurredAt, since30d),
          ),
        );
      const [opps] = await db
        .select({
          open: sql<number>`count(*) filter (where ${opportunities.status} = 'open')::int`,
          won: sql<number>`count(*) filter (where ${opportunities.status} = 'won')::int`,
          lost: sql<number>`count(*) filter (where ${opportunities.status} = 'lost')::int`,
        })
        .from(opportunities)
        .where(
          and(
            orgScope(opportunities.organizationId, actor.orgId),
            eq(opportunities.ownerId, s.userId),
          ),
        );
      const [leadsOpen] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(leads)
        .where(
          and(
            orgScope(leads.organizationId, actor.orgId),
            eq(leads.assignedTo, s.userId),
            inArray(leads.status, ['assigned', 'in_progress']),
          ),
        );
      const [money] = await db
        .select({
          commission: sql<string>`coalesce(sum(${commissionEntries.amountRial}), 0)::text`,
          netRevenue: sql<string>`coalesce(sum((${commissionEntries.basis}->>'netAmountRial')::numeric) filter (where ${commissionEntries.entryType} = 'earn'), 0)::text`,
        })
        .from(commissionEntries)
        .where(
          and(
            orgScope(commissionEntries.organizationId, actor.orgId),
            eq(commissionEntries.beneficiaryUserId, s.userId),
          ),
        );
      const [customers] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(attributionClaims)
        .innerJoin(accounts, eq(accounts.id, attributionClaims.accountId))
        .where(
          and(
            orgScope(attributionClaims.organizationId, actor.orgId),
            eq(attributionClaims.sellerId, s.userId),
            eq(accounts.status, 'customer'),
          ),
        );

      const won = opps?.won ?? 0;
      const lost = opps?.lost ?? 0;
      const open = opps?.open ?? 0;
      const denominator = won + lost + open;
      const activityCount = acts?.all30d ?? 0;
      const netRevenue = BigInt((money?.netRevenue ?? '0').split('.')[0] ?? '0');

      rows.push({
        seller_id: s.userId,
        display_name: s.displayName,
        contract_type: s.contractType,
        territory_name: s.territoryName ?? null,
        visits_30d: acts?.visits ?? 0,
        calls_30d: acts?.calls ?? 0,
        leads_assigned_open: leadsOpen?.n ?? 0,
        opps_open: open,
        opps_won_total: won,
        conversion_pct: denominator > 0 ? Math.round((won / denominator) * 100) : 0,
        attributed_net_revenue_rial: netRevenue.toString(),
        commission_earned_rial: BigInt(money?.commission ?? '0').toString(),
        revenue_per_activity_rial:
          activityCount > 0 ? (netRevenue / BigInt(activityCount)).toString() : '0',
        active_customers: customers?.n ?? 0,
      });
    }
    rows.sort((a, b) =>
      BigInt(b.attributed_net_revenue_rial) > BigInt(a.attributed_net_revenue_rial) ? 1 : -1,
    );
    return c.json(teamPerformanceResponseSchema.parse({ rows }));
  })
  .get('/funnel', async (c) => {
    const actor = requireRole(c, 'sales_manager', 'owner_admin', 'finance');
    const stageRows = await db
      .select({
        stage: opportunities.stage,
        count: sql<number>`count(*)::int`,
        value: sql<string>`coalesce(sum(${opportunities.amountEstimateRial}), 0)::text`,
      })
      .from(opportunities)
      .where(
        and(orgScope(opportunities.organizationId, actor.orgId), eq(opportunities.status, 'open')),
      )
      .groupBy(opportunities.stage);
    const [closed] = await db
      .select({
        won: sql<number>`count(*) filter (where ${opportunities.status} = 'won')::int`,
        lost: sql<number>`count(*) filter (where ${opportunities.status} = 'lost')::int`,
      })
      .from(opportunities)
      .where(orgScope(opportunities.organizationId, actor.orgId));
    const [leadCounts] = await db
      .select({
        newN: sql<number>`count(*) filter (where ${leads.status} = 'new')::int`,
        assigned: sql<number>`count(*) filter (where ${leads.status} in ('assigned','in_progress'))::int`,
      })
      .from(leads)
      .where(orgScope(leads.organizationId, actor.orgId));

    return c.json(
      funnelResponseSchema.parse({
        stages: stageRows.map((s) => ({ stage: s.stage, count: s.count, value_rial: s.value })),
        won_count: closed?.won ?? 0,
        lost_count: closed?.lost ?? 0,
        leads_new: leadCounts?.newN ?? 0,
        leads_assigned: leadCounts?.assigned ?? 0,
      }),
    );
  });
