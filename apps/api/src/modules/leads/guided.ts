// E01-F08 — the guided post-create step. Saving a lead does not dead-end: the
// api hands back what to do next (open an opportunity, schedule the next
// action, optionally enrol a playbook), and one follow-up call commits it.
//
// 🔒 This is where the open-item invariant is enforced for the UI as well as
// the API: a lead that is not being closed cannot leave this call without a
// dated next action. The contract's refine() catches the missing field; this
// file catches the vocabulary and writes the two rows atomically.

import {
  guidedFollowupBodySchema,
  guidedFollowupResponseSchema,
  postCreateGuidanceSchema,
} from '@arad-crm/api-contracts';
import { accounts, db, leads, opportunities, orgScope } from '@arad-crm/db';
import {
  LOSS_REASONS,
  NEXT_ACTION_OFFSETS,
  NEXT_ACTION_TYPES,
  OPPORTUNITY_STAGES,
  isLossReason,
  isNextActionType,
  isOpportunityStage,
} from '@arad-crm/vertical-mizro';
import { NotFoundError, ValidationError } from '@arad/errors';
import { and, eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { writeAudit } from '../../lib/tenant-audit.js';
import { requireActor } from '../../middleware/session.js';
import { availableFlows, enroll, recordDecision, suggestNextAction } from '../flows/index.js';

// Extracted handlers lose Hono's path-param typing, so the id is asserted
// once here rather than non-null-asserted at each call site.
const leadIdOf = (c: Context): string => {
  const id = c.req.param('id');
  if (!id) throw new ValidationError('lead id is required');
  return id;
};

const loadLead = async (orgId: string, leadId: string) => {
  const row = (
    await db
      .select({ lead: leads, account: accounts })
      .from(leads)
      .innerJoin(accounts, eq(accounts.id, leads.accountId))
      .where(and(orgScope(leads.organizationId, orgId), eq(leads.id, leadId)))
  )[0];
  if (!row) throw new NotFoundError('lead not found');
  return row;
};

/** GET /v1/leads/:id/guidance — what the post-save sheet renders. */
export const leadGuidance = async (c: Context): Promise<Response> => {
  const actor = requireActor(c);
  const leadId = leadIdOf(c);
  const { lead, account } = await loadLead(actor.orgId, leadId);

  const flowSuggestion = await suggestNextAction(actor.orgId, 'lead', leadId);
  const flows = await availableFlows(actor.orgId, 'lead');

  return c.json(
    postCreateGuidanceSchema.parse({
      lead_id: lead.id,
      account_id: account.id,
      account_name: account.name,
      // An opportunity is worth offering only while the lead is still open and
      // has no conversion yet — suggesting one on a lost lead is noise.
      suggest_opportunity: lead.status !== 'lost' && lead.status !== 'qualified',
      opportunity_stages: OPPORTUNITY_STAGES.map((s) => ({ code: s.code, label: s.label })),
      next_action_types: NEXT_ACTION_TYPES.map((t) => ({ code: t.code, label: t.label })),
      next_action_offsets: NEXT_ACTION_OFFSETS,
      suggested_next_action: flowSuggestion
        ? {
            action_type: flowSuggestion.action_type,
            label: flowSuggestion.label,
            in_days: Math.max(
              0,
              Math.round(
                (new Date(flowSuggestion.suggested_at).getTime() - Date.now()) / 86_400_000,
              ),
            ),
            source: 'flow' as const,
          }
        : // No playbook: a freshly-captured lead's honest default is a first
          // visit. `source: 'none'` says so rather than dressing it up as
          // guidance the system actually reasoned about.
          {
            action_type: 'visit',
            label: 'بازدید حضوری',
            in_days: 2,
            source: 'none' as const,
          },
      available_flows: flows,
    }),
  );
};

/** POST /v1/leads/:id/guided-followup — the demo's step 8, in one request. */
export const leadGuidedFollowup = async (c: Context): Promise<Response> => {
  const actor = requireActor(c);
  const leadId = leadIdOf(c);
  const body = guidedFollowupBodySchema.parse(await c.req.json());

  if (body.next_action_type && !isNextActionType(body.next_action_type)) {
    throw new ValidationError(`نوع اقدام ناشناخته: ${body.next_action_type}`);
  }
  if (body.close_reason && !isLossReason(body.close_reason)) {
    throw new ValidationError(`دلیل بستن ناشناخته: ${body.close_reason}`, {
      allowed: LOSS_REASONS.map((r) => r.code),
    });
  }
  if (body.opportunity && !isOpportunityStage(body.opportunity.stage)) {
    throw new ValidationError(`مرحلهٔ ناشناخته: ${body.opportunity.stage}`);
  }

  const { lead, account } = await loadLead(actor.orgId, leadId);

  return db.transaction(async (tx) => {
    let opportunityId: string | null = null;

    if (body.opportunity) {
      const inserted = await tx
        .insert(opportunities)
        .values({
          organizationId: actor.orgId,
          accountId: account.id,
          leadId: lead.id,
          // The seller who captured it owns it until a manager reassigns.
          ownerId: lead.assignedTo ?? actor.userId,
          stage: body.opportunity.stage,
          status: 'open',
          ...(body.opportunity.amount_estimate_rial
            ? { amountEstimateRial: BigInt(body.opportunity.amount_estimate_rial) }
            : {}),
        })
        .returning({ id: opportunities.id });
      opportunityId = inserted[0]?.id ?? null;
      if (!opportunityId) throw new ValidationError('opportunity insert failed');
    }

    const nextActionAt = body.next_action_at ? new Date(body.next_action_at) : null;
    await tx
      .update(leads)
      .set({
        // Converting to an opportunity qualifies the lead; a close reason
        // closes it; otherwise it is simply being worked.
        status: body.close_reason ? 'lost' : opportunityId ? 'qualified' : 'in_progress',
        nextActionType: body.close_reason ? null : (body.next_action_type ?? null),
        nextActionAt: body.close_reason ? null : nextActionAt,
        closeReason: body.close_reason ?? null,
        assignedTo: lead.assignedTo ?? actor.userId,
        updatedAt: new Date(),
      })
      .where(eq(leads.id, lead.id));

    if (opportunityId) {
      await tx
        .update(accounts)
        .set({ status: 'in_funnel', updatedAt: new Date() })
        .where(eq(accounts.id, account.id));
    }

    let enrolledFlowId: string | null = null;
    if (body.flow_id) {
      const enrollment = await enroll(
        actor.orgId,
        { entityKind: 'lead', entityId: lead.id, flowId: body.flow_id },
        actor.userId,
        tx,
      );
      enrolledFlowId = enrollment.flowId;
    }

    // 🔒 Record the seller's choice against whatever the playbook suggested —
    // accepted or overridden is derived, never asserted by the client. Runs
    // after enrolment so enrolling and choosing in the same step still lands
    // a decision row for step 1.
    if (body.next_action_type && nextActionAt) {
      await recordDecision(
        actor.orgId,
        {
          entityKind: 'lead',
          entityId: lead.id,
          chosenActionType: body.next_action_type,
          chosenAt: nextActionAt,
        },
        actor.userId,
        tx,
      );
    }

    await writeAudit(tx, c, actor, {
      action: 'lead.guided_followup',
      entityType: 'lead',
      entityId: lead.id,
      after: {
        opportunity_id: opportunityId,
        next_action_type: body.next_action_type ?? null,
        next_action_at: body.next_action_at ?? null,
        close_reason: body.close_reason ?? null,
        flow_id: enrolledFlowId,
      },
    });

    return c.json(
      guidedFollowupResponseSchema.parse({
        lead_id: lead.id,
        opportunity_id: opportunityId,
        next_action_type: body.close_reason ? null : (body.next_action_type ?? null),
        next_action_at: body.close_reason ? null : (nextActionAt?.toISOString() ?? null),
        enrolled_flow_id: enrolledFlowId,
      }),
    );
  });
};
