// Opportunities. 🔒 status='won' is NEVER settable through the API — a sale
// exists only when a payment event arrives (worker marks won). Lost requires a
// primary loss reason from the vertical taxonomy.

import {
  createOpportunityBodySchema,
  opportunityDetailSchema,
  pipelineResponseSchema,
  updateOpportunityBodySchema,
} from '@arad-crm/api-contracts';
import { accounts, db, leads, opportunities, orgScope, users } from '@arad-crm/db';
import { isLossReason, isOpportunityStage } from '@arad-crm/vertical-mizro';
import { ForbiddenError, NotFoundError, ValidationError } from '@arad/errors';
import { type SQL, and, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { writeAudit } from '../../lib/tenant-audit.js';
import { isSeller, requireActor, session } from '../../middleware/session.js';
import { accountView } from '../accounts/index.js';
import { accountTimeline, commitmentsByAccount } from '../activities/index.js';
import { leadView } from '../leads/index.js';
import { opportunityView } from './service.js';

export { hasOpenDeal, openDealsByAccount, opportunityView } from './service.js';

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
      .select({
        opp: opportunities,
        accountName: accounts.name,
        regionText: accounts.regionText,
        ownerName: users.displayName,
      })
      .from(opportunities)
      .innerJoin(accounts, eq(accounts.id, opportunities.accountId))
      .leftJoin(users, eq(users.id, opportunities.ownerId))
      .where(and(orgScope(opportunities.organizationId, actor.orgId), ...filters))
      .orderBy(desc(opportunities.createdAt))
      .limit(200);

    // The card in «پایپلاین» has to answer "and what happens next?" — a deal
    // with no dated next step is the one thing the screen must not hide.
    // Commitments belong to the actor, so this is only meaningful for one's own
    // book; a manager reading the whole org gets deals without the annotation
    // rather than someone else's promises mislabelled as theirs.
    const own = view === 'mine' || isSeller(actor.role);
    const commitments = own
      ? await commitmentsByAccount(
          actor.orgId,
          actor.userId,
          rows.filter((r) => r.opp.status === 'open').map((r) => r.opp.accountId),
        )
      : new Map();

    return c.json(
      pipelineResponseSchema.parse({
        items: rows.map((r) => {
          const commitment = commitments.get(r.opp.accountId);
          return {
            ...toOpp(r.opp, r.accountName, r.ownerName),
            region_text: r.regionText,
            next_action_type: commitment?.action_type ?? null,
            next_action_at: commitment?.due_at ?? null,
          };
        }),
      }),
    );
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

    // 🔒 Stage and status are pipeline truth — what a forecast is built from and
    // what a lost deal is explained by. The change and the row that says who
    // made it are one fact, so they share one transaction
    // (business-architecture §11 rule 11).
    await db.transaction(async (tx) => {
      await tx
        .update(opportunities)
        .set({
          // A stage change restarts the stage clock; anything else leaves it
          // alone, so «۶ روز در این مرحله» keeps counting from the move.
          ...(body.stage && body.stage !== opp.stage
            ? { stage: body.stage, stageEnteredAt: new Date() }
            : {}),
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

      await writeAudit(tx, c, actor, {
        action: body.status === 'lost' ? 'opportunity.lost' : 'opportunity.stage_changed',
        entityType: 'opportunity',
        entityId: id,
        before: { stage: opp.stage, status: opp.status },
        after: {
          stage: body.stage ?? opp.stage,
          status: body.status ?? opp.status,
          loss_reason: body.loss_reason ?? null,
        },
        ...(body.loss_note ? { reason: body.loss_note } : {}),
      });
    });
    return c.json({ ok: true });
  });
