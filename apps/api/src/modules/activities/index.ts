// Activities — the <2-minute field truth (mock: ثبت سریع بازدید/تماس).
// 🔒 Invariant: recording against an open lead REQUIRES a dated next action
// OR a close reason — nothing rots. Findings are vertical-validated and merge
// into the account file (founder: "cafe-abc is luxury → offer VIP").

import {
  agendaResponseSchema,
  logActivityBodySchema,
  todayResponseSchema,
} from '@arad-crm/api-contracts';
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
import { and, eq, gte, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { endOfDayTehran, startOfDayTehran } from '../../lib/tehran-time.js';
import { requireActor, session } from '../../middleware/session.js';
import { openCommitments } from './service.js';

// The module's service surface — how other modules read this history 🔒
export {
  accountTimeline,
  commitmentsByAccount,
  lastTouchByAccount,
  openCommitments,
} from './service.js';

const DAY_MS = 86_400_000;

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
          // 🔒 Whoever works the lead owns it. An UNASSIGNED lead moved to
          // `in_progress` is orphaned: it is no longer `new`, so it drops out
          // of «سرنخ‌های قابل برداشت», and it belongs to nobody, so it appears
          // on no seller's day — a dated promise nothing surfaces. That is the
          // "nothing rots" invariant failing silently, and it happens on the
          // ordinary path where a manager captures the lead and then calls.
          const owner = lead.assignedTo ?? actor.userId;
          await tx
            .update(leads)
            .set(
              closes
                ? {
                    assignedTo: owner,
                    status: 'lost',
                    closeReason: body.close_reason ?? body.outcome ?? 'closed',
                    nextActionType: null,
                    nextActionAt: null,
                    updatedAt: new Date(),
                  }
                : {
                    assignedTo: owner,
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
    // 🔒 Tehran's day, not the server's — see lib/tehran-time.ts. In a UTC
    // container `setHours(0,…)` starts "today" at 03:30 Tehran.
    const startOfDay = startOfDayTehran();
    const endOfDay = endOfDayTehran();

    const due = await openCommitments(actor.orgId, actor.userId, endOfDay);

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
        due_actions: due,
        open_opportunities: openOpps?.n ?? 0,
        picked_today: pickedToday?.n ?? 0,
      }),
    );
  })
  // «کارها و یادآورها» — the day screen widened to a horizon (prototype ۰۷).
  // Overdue is its own bucket rather than a badge on today: a promise broken
  // yesterday is a different kind of work from one due at 11:00, and folding
  // the two together is how overdue items quietly become invisible.
  .get('/agenda', async (c) => {
    const actor = requireActor(c);
    const requested = Number(c.req.query('days') ?? '7');
    const horizon = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), 30) : 7;

    const startOfToday = startOfDayTehran();
    const endOfHorizon = new Date(startOfToday.getTime() + horizon * DAY_MS - 1);

    const all = await openCommitments(actor.orgId, actor.userId, endOfHorizon);

    // Tehran calendar day of an instant — the bucket key. Formatting in en-CA
    // yields YYYY-MM-DD, which sorts and compares as a plain string.
    const tehranDay = (at: Date): string =>
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(at);

    const buckets = new Map<string, typeof all>();
    for (let i = 0; i < horizon; i++) {
      buckets.set(tehranDay(new Date(startOfToday.getTime() + i * DAY_MS)), []);
    }

    const overdue: typeof all = [];
    for (const item of all) {
      if (item.overdue || !item.due_at) {
        overdue.push(item);
        continue;
      }
      // A commitment inside the horizon always lands in a bucket; the guard is
      // for the boundary instant, which belongs to the day after the last one.
      buckets.get(tehranDay(new Date(item.due_at)))?.push(item);
    }

    return c.json(
      agendaResponseSchema.parse({
        generated_at: new Date().toISOString(),
        today: tehranDay(startOfToday),
        overdue,
        days: [...buckets.entries()].map(([date, items], i) => ({
          date,
          starts_at: new Date(startOfToday.getTime() + i * DAY_MS).toISOString(),
          items,
        })),
      }),
    );
  });
