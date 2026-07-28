// Activities — the <2-minute field truth (mock: ثبت سریع بازدید/تماس).
// 🔒 Invariant: recording against an open lead REQUIRES a dated next action
// OR a close reason — nothing rots. Findings are vertical-validated and merge
// into the account file (founder: "cafe-abc is luxury → offer VIP").

import { logActivityBodySchema, todayResponseSchema } from '@arad-crm/api-contracts';
import { accounts, activities, db, leads, opportunities, orgScope } from '@arad-crm/db';
import {
  VISIT_OUTCOMES,
  findingsSchema,
  isLossReason,
  isNextActionType,
  isOutcome,
  mergeFindings,
} from '@arad-crm/vertical-mizro';
import { NotFoundError, ValidationError } from '@arad/errors';
import { and, desc, eq, gte, inArray, isNotNull, lte, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { isSeller, requireActor, session } from '../../middleware/session.js';

// The module's service surface — how other modules read this history 🔒
export { accountTimeline } from './service.js';

export const activitiesRoutes = new Hono()
  .use('*', session())
  .post('/', async (c) => {
    const actor = requireActor(c);
    const body = logActivityBodySchema.parse(await c.req.json());

    if (body.outcome && !isOutcome(body.outcome)) {
      throw new ValidationError(`unknown outcome code: ${body.outcome}`);
    }
    if (body.next_action_type && !isNextActionType(body.next_action_type)) {
      throw new ValidationError(`unknown next-action type: ${body.next_action_type}`);
    }
    if (body.close_reason && !isLossReason(body.close_reason)) {
      throw new ValidationError(`unknown close reason: ${body.close_reason}`);
    }

    const account = (
      await db
        .select()
        .from(accounts)
        .where(
          and(orgScope(accounts.organizationId, actor.orgId), eq(accounts.id, body.account_id)),
        )
    )[0];
    if (!account) throw new NotFoundError('account not found');

    const outcomeDef = body.outcome
      ? VISIT_OUTCOMES.find((o) => o.code === body.outcome)
      : undefined;
    const closes = Boolean(body.close_reason) || Boolean(outcomeDef?.closes);

    // 🔒 mandatory next action on field interactions unless closing
    if ((body.kind === 'visit' || body.kind === 'call') && !closes) {
      if (!body.next_action_type || !body.next_action_at) {
        throw new ValidationError('اقدام بعدی اجباری است — نوع و تاریخ اقدام بعدی را ثبت کنید', {
          rule: 'next_action_required',
          suggested: outcomeDef?.suggestedNext ?? null,
        });
      }
    }

    let findings: Record<string, unknown> | undefined;
    if (body.findings) {
      const parsed = findingsSchema.safeParse(body.findings);
      if (!parsed.success) {
        throw new ValidationError('invalid findings', { issues: parsed.error.issues });
      }
      findings = parsed.data;
    }

    return db.transaction(async (tx) => {
      const rows = await tx
        .insert(activities)
        .values({
          organizationId: actor.orgId,
          accountId: account.id,
          leadId: body.lead_id ?? null,
          opportunityId: body.opportunity_id ?? null,
          sellerId: actor.userId,
          kind: body.kind,
          outcome: body.outcome ?? null,
          note: body.note ?? null,
          findings: findings ?? null,
          nextActionType: body.next_action_type ?? null,
          nextActionAt: body.next_action_at ? new Date(body.next_action_at) : null,
          occurredAt: body.occurred_at ? new Date(body.occurred_at) : new Date(),
        })
        .returning();
      const activity = rows[0];
      if (!activity) throw new ValidationError('activity insert failed');

      // findings → account file (latest state)
      if (findings) {
        await tx
          .update(accounts)
          .set({
            attributes: mergeFindings(account.attributes as Record<string, unknown>, findings),
            ...(account.status === 'prospect' ? { status: 'in_funnel' as const } : {}),
            updatedAt: new Date(),
          })
          .where(and(orgScope(accounts.organizationId, actor.orgId), eq(accounts.id, account.id)));
      } else if (account.status === 'prospect') {
        await tx
          .update(accounts)
          .set({ status: 'in_funnel', updatedAt: new Date() })
          .where(and(orgScope(accounts.organizationId, actor.orgId), eq(accounts.id, account.id)));
      }

      // lead bookkeeping: carry the next action / close 🔒
      if (body.lead_id) {
        const lead = (
          await tx
            .select()
            .from(leads)
            .where(and(orgScope(leads.organizationId, actor.orgId), eq(leads.id, body.lead_id)))
        )[0];
        if (lead && lead.status !== 'qualified' && lead.status !== 'lost') {
          await tx
            .update(leads)
            .set(
              closes
                ? {
                    status: 'lost',
                    closeReason: body.close_reason ?? body.outcome ?? 'closed',
                    nextActionType: null,
                    nextActionAt: null,
                    updatedAt: new Date(),
                  }
                : {
                    status: 'in_progress',
                    nextActionType: body.next_action_type ?? lead.nextActionType,
                    nextActionAt: body.next_action_at
                      ? new Date(body.next_action_at)
                      : lead.nextActionAt,
                    updatedAt: new Date(),
                  },
            )
            .where(eq(leads.id, body.lead_id));
        }
      }
      return c.json({ ok: true, activity_id: activity.id }, 201);
    });
  })
  // «امروز من» — the seller's day (product doc §7)
  .get('/today', async (c) => {
    const actor = requireActor(c);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const due = await db
      .select({ lead: leads, account: accounts })
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
      .limit(50);

    const pickedToday = (
      await db
        .select({ n: sql<number>`count(*)::int` })
        .from(leads)
        .where(
          and(
            orgScope(leads.organizationId, actor.orgId),
            eq(leads.assignedTo, actor.userId),
            gte(leads.updatedAt, startOfDay),
          ),
        )
    )[0];

    const openOpps = (
      await db
        .select({ n: sql<number>`count(*)::int` })
        .from(opportunities)
        .where(
          and(
            orgScope(opportunities.organizationId, actor.orgId),
            eq(opportunities.ownerId, actor.userId),
            eq(opportunities.status, 'open'),
          ),
        )
    )[0];

    return c.json(
      todayResponseSchema.parse({
        date: new Date().toISOString(),
        due_actions: due.map((d) => ({
          lead_id: d.lead.id,
          account_id: d.account.id,
          account_name: d.account.name,
          region_text: d.account.regionText,
          action_type: d.lead.nextActionType,
          due_at: d.lead.nextActionAt?.toISOString() ?? null,
          overdue: (d.lead.nextActionAt?.getTime() ?? 0) < startOfDay.getTime(),
        })),
        open_opportunities: openOpps?.n ?? 0,
        picked_today: pickedToday?.n ?? 0,
      }),
    );
  });
