// Opportunities. 🔒 status='won' is NEVER settable through the API — a sale
// exists only when a payment event arrives (worker marks won). Lost requires a
// primary loss reason from the vertical taxonomy.

import {
  createOpportunityBodySchema,
  opportunityDetailSchema,
  updateOpportunityBodySchema,
} from '@arad-crm/api-contracts';
import { accounts, db, leads, opportunities, orgScope, users } from '@arad-crm/db';
import { isLossReason, isOpportunityStage } from '@arad-crm/vertical-mizro';
import { ForbiddenError, NotFoundError, ValidationError } from '@arad/errors';
import { type SQL, and, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { isSeller, requireActor, session } from '../../middleware/session.js';
import { accountView } from '../accounts/index.js';
import { accountTimeline } from '../activities/index.js';
import { leadView } from '../leads/index.js';
import { opportunityView } from './service.js';

export { opportunityView } from './service.js';

const toOpp = opportunityView;

export const opportunitiesRoutes = new Hono()
  .use('*', session())
  .get('/', async (c) => {
    const actor = requireActor(c);
    const view = c.req.query('view') ?? (isSeller(actor.role) ? 'mine' : 'all');
    const filters: SQL[] = [];
    if (view === 'mine' || isSeller(actor.role)) {
      // 🔒 sellers see only their own deals
      filters.push(eq(opportunities.ownerId, actor.userId));
    }
    const rows = await db
      .select({ opp: opportunities, accountName: accounts.name, ownerName: users.displayName })
      .from(opportunities)
      .innerJoin(accounts, eq(accounts.id, opportunities.accountId))
      .leftJoin(users, eq(users.id, opportunities.ownerId))
      .where(and(orgScope(opportunities.organizationId, actor.orgId), ...filters))
      .orderBy(desc(opportunities.createdAt))
      .limit(200);
    return c.json({ items: rows.map((r) => toOpp(r.opp, r.accountName, r.ownerName)) });
  })
  .post('/', async (c) => {
    const actor = requireActor(c);
    const body = createOpportunityBodySchema.parse(await c.req.json());
    if (!isOpportunityStage(body.stage)) {
      throw new ValidationError(`unknown stage: ${body.stage}`);
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

    return db.transaction(async (tx) => {
      const rows = await tx
        .insert(opportunities)
        .values({
          organizationId: actor.orgId,
          accountId: account.id,
          leadId: body.lead_id ?? null,
          ownerId: actor.userId,
          stage: body.stage,
          amountEstimateRial: body.amount_estimate_rial ? BigInt(body.amount_estimate_rial) : null,
        })
        .returning();
      const opp = rows[0];
      if (!opp) throw new ValidationError('opportunity insert failed');
      if (body.lead_id) {
        await tx
          .update(leads)
          .set({ status: 'qualified', updatedAt: new Date() })
          .where(and(orgScope(leads.organizationId, actor.orgId), eq(leads.id, body.lead_id)));
      }
      return c.json(toOpp(opp, account.name, null), 201);
    });
  })
  // The deal's page: the deal, its file, the lead it came from, and the history
  // behind it. 🔒 Sellers read only their own deals — the same rule the list
  // applies, restated here because an id is not an authorization.
  .get('/:id', async (c) => {
    const actor = requireActor(c);
    const id = c.req.param('id');
    const row = (
      await db
        .select({ opp: opportunities, account: accounts, ownerName: users.displayName })
        .from(opportunities)
        .innerJoin(accounts, eq(accounts.id, opportunities.accountId))
        .leftJoin(users, eq(users.id, opportunities.ownerId))
        .where(and(orgScope(opportunities.organizationId, actor.orgId), eq(opportunities.id, id)))
    )[0];
    if (!row) throw new NotFoundError('opportunity not found');
    if (isSeller(actor.role) && row.opp.ownerId !== actor.userId) {
      throw new ForbiddenError('این معامله متعلق به شما نیست');
    }

    const originLead = row.opp.leadId
      ? (
          await db
            .select({ lead: leads, assigneeName: users.displayName })
            .from(leads)
            .leftJoin(users, eq(users.id, leads.assignedTo))
            .where(and(orgScope(leads.organizationId, actor.orgId), eq(leads.id, row.opp.leadId)))
        )[0]
      : undefined;

    return c.json(
      opportunityDetailSchema.parse({
        opportunity: toOpp(row.opp, row.account.name, row.ownerName ?? null),
        account: accountView(row.account),
        lead: originLead
          ? leadView({
              lead: originLead.lead,
              account: row.account,
              assigneeName: originLead.assigneeName ?? null,
            })
          : null,
        timeline: await accountTimeline(actor.orgId, row.account.id),
      }),
    );
  })
  .patch('/:id', async (c) => {
    const actor = requireActor(c);
    const id = c.req.param('id');
    const body = updateOpportunityBodySchema.parse(await c.req.json());

    // 🔒 sale = real payment event, never a manual toggle
    if (body.status === 'won') {
      throw new ForbiddenError(
        'فروش فقط با رویداد پرداخت واقعی ثبت می‌شود — وضعیت «برنده» دستی نیست',
        { rule: 'sale_is_a_payment_event' },
      );
    }
    if (body.stage && !isOpportunityStage(body.stage)) {
      throw new ValidationError(`unknown stage: ${body.stage}`);
    }
    if (body.status === 'lost') {
      if (!body.loss_reason || !isLossReason(body.loss_reason)) {
        throw new ValidationError('دلیل از دست رفتن (از فهرست استاندارد) اجباری است', {
          rule: 'loss_reason_required',
        });
      }
    }

    const opp = (
      await db
        .select()
        .from(opportunities)
        .where(and(orgScope(opportunities.organizationId, actor.orgId), eq(opportunities.id, id)))
    )[0];
    if (!opp) throw new NotFoundError('opportunity not found');
    if (isSeller(actor.role) && opp.ownerId !== actor.userId) {
      throw new ForbiddenError('این معامله متعلق به شما نیست');
    }
    if (opp.status !== 'open') {
      throw new ValidationError('معاملهٔ بسته قابل ویرایش نیست');
    }

    await db
      .update(opportunities)
      .set({
        ...(body.stage ? { stage: body.stage } : {}),
        ...(body.status === 'lost'
          ? {
              status: 'lost' as const,
              lossReason: body.loss_reason ?? null,
              lossNote: body.loss_note ?? null,
              lostAt: new Date(),
            }
          : {}),
        updatedAt: new Date(),
      })
      .where(and(orgScope(opportunities.organizationId, actor.orgId), eq(opportunities.id, id)));
    return c.json({ ok: true });
  });
