// Flows module (ADR-015) — named playbooks that SUGGEST the next action.
// 🔒 E01 ships suggestion only: nothing here sends, waits, or branches, and no
// scheduler touches these tables. When automation arrives it is a separate
// module consuming the same `flow_definitions`.
//
// Playbooks are configuration per organization, not TypeScript constants — a
// tenant edits one without a deploy (ADR-015 §3).

import {
  createFlowBodySchema,
  enrollFlowBodySchema,
  flowDefinitionSchema,
  flowEnrollmentSchema,
  flowEntityKindSchema,
  nextActionSuggestionSchema,
  publishFlowVersionBodySchema,
  recordStepDecisionBodySchema,
} from '@arad-crm/api-contracts';
import { db, flowDefinitions, flowEnrollments, flowVersions, orgScope } from '@arad-crm/db';
import { isNextActionType } from '@arad-crm/vertical-mizro';
import { ConflictError, NotFoundError, ValidationError } from '@arad/errors';
import { and, count, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { requireActor, requireRole, session } from '../../middleware/session.js';
import {
  type FlowEntityKind,
  activeEnrollment,
  availableFlows,
  enroll,
  publishVersion,
  recordDecision,
  suggestNextAction,
} from './service.js';

// Re-exported service API — the ONLY way other modules touch flows (ADR-003).
export {
  activeEnrollment,
  availableFlows,
  enroll,
  recordDecision,
  suggestNextAction,
  type FlowEntityKind,
} from './service.js';

const entityKindParam = (raw: string | undefined): FlowEntityKind =>
  flowEntityKindSchema.parse(raw);

export const flowsRoutes = new Hono()
  .use('*', session())

  .get('/', async (c) => {
    const actor = requireActor(c);
    const rows = await db
      .select({
        definition: flowDefinitions,
        version: flowVersions,
      })
      .from(flowDefinitions)
      .leftJoin(flowVersions, eq(flowVersions.id, flowDefinitions.currentVersionId))
      .where(orgScope(flowDefinitions.organizationId, actor.orgId))
      .orderBy(desc(flowDefinitions.createdAt));

    const counts = await db
      .select({ versionId: flowEnrollments.flowVersionId, n: count(flowEnrollments.id) })
      .from(flowEnrollments)
      .where(
        and(
          orgScope(flowEnrollments.organizationId, actor.orgId),
          eq(flowEnrollments.status, 'active'),
        ),
      )
      .groupBy(flowEnrollments.flowVersionId);
    const byVersion = new Map(counts.map((r) => [r.versionId, r.n]));

    return c.json({
      items: rows
        .filter((r) => r.version !== null)
        .map((r) =>
          flowDefinitionSchema.parse({
            id: r.definition.id,
            key: r.definition.key,
            label: r.definition.label,
            entity_kind: r.definition.entityKind,
            status: r.definition.status,
            version_no: r.version?.versionNo ?? 0,
            steps: r.version?.steps ?? [],
            enrollment_count: r.version ? (byVersion.get(r.version.id) ?? 0) : 0,
            created_at: r.definition.createdAt.toISOString(),
          }),
        ),
    });
  })

  .post('/', async (c) => {
    const actor = requireRole(c, 'sales_manager', 'owner_admin');
    const body = createFlowBodySchema.parse(await c.req.json());
    for (const step of body.steps) {
      if (!isNextActionType(step.action_type)) {
        throw new ValidationError(`نوع اقدام ناشناخته: ${step.action_type}`);
      }
    }
    const clash = (
      await db
        .select()
        .from(flowDefinitions)
        .where(
          and(
            orgScope(flowDefinitions.organizationId, actor.orgId),
            eq(flowDefinitions.key, body.key),
          ),
        )
    )[0];
    if (clash) throw new ConflictError('فلویی با این شناسه از قبل وجود دارد', { key: body.key });

    return db.transaction(async (tx) => {
      const inserted = await tx
        .insert(flowDefinitions)
        .values({
          organizationId: actor.orgId,
          key: body.key,
          label: body.label,
          entityKind: body.entity_kind,
          createdBy: actor.userId,
        })
        .returning();
      const definition = inserted[0];
      if (!definition) throw new ValidationError('flow insert failed');
      const version = await publishVersion(
        actor.orgId,
        definition.id,
        body.steps,
        actor.userId,
        tx,
      );
      return c.json(
        flowDefinitionSchema.parse({
          id: definition.id,
          key: definition.key,
          label: definition.label,
          entity_kind: definition.entityKind,
          status: definition.status,
          version_no: version.versionNo,
          steps: body.steps,
          enrollment_count: 0,
          created_at: definition.createdAt.toISOString(),
        }),
        201,
      );
    });
  })

  // 🔒 Editing publishes a NEW version. Live enrollments keep pointing at the
  // version they started on, so yesterday's guidance is never rewritten.
  .post('/:id/versions', async (c) => {
    const actor = requireRole(c, 'sales_manager', 'owner_admin');
    const id = c.req.param('id');
    const body = publishFlowVersionBodySchema.parse(await c.req.json());
    for (const step of body.steps) {
      if (!isNextActionType(step.action_type)) {
        throw new ValidationError(`نوع اقدام ناشناخته: ${step.action_type}`);
      }
    }
    const definition = (
      await db
        .select()
        .from(flowDefinitions)
        .where(
          and(orgScope(flowDefinitions.organizationId, actor.orgId), eq(flowDefinitions.id, id)),
        )
    )[0];
    if (!definition) throw new NotFoundError('flow not found');

    return db.transaction(async (tx) => {
      if (body.label) {
        await tx
          .update(flowDefinitions)
          .set({ label: body.label, updatedAt: new Date() })
          .where(eq(flowDefinitions.id, id));
      }
      const version = await publishVersion(actor.orgId, id, body.steps, actor.userId, tx);
      return c.json({ flow_id: id, version_no: version.versionNo, steps: body.steps }, 201);
    });
  })

  .post('/enroll', async (c) => {
    const actor = requireActor(c);
    const body = enrollFlowBodySchema.parse(await c.req.json());
    const enrollment = await enroll(
      actor.orgId,
      { entityKind: body.entity_kind, entityId: body.entity_id, flowId: body.flow_id },
      actor.userId,
    );
    return c.json(
      flowEnrollmentSchema.parse({
        id: enrollment.enrollmentId,
        entity_kind: body.entity_kind,
        entity_id: body.entity_id,
        flow_id: enrollment.flowId,
        flow_key: enrollment.flowKey,
        flow_label: enrollment.flowLabel,
        version_no: enrollment.versionNo,
        current_step: enrollment.currentStep,
        status: 'active',
        enrolled_at: new Date().toISOString(),
      }),
      201,
    );
  })

  .get('/suggestion', async (c) => {
    const actor = requireActor(c);
    const entityKind = entityKindParam(c.req.query('entity_kind'));
    const entityId = c.req.query('entity_id');
    if (!entityId) throw new ValidationError('entity_id is required');
    const suggestion = await suggestNextAction(actor.orgId, entityKind, entityId);
    return c.json(suggestion ? nextActionSuggestionSchema.parse(suggestion) : null);
  })

  // The seller's choice, recorded against what was suggested (ADR-015 §2).
  .post('/decision', async (c) => {
    const actor = requireActor(c);
    const entityKind = entityKindParam(c.req.query('entity_kind'));
    const entityId = c.req.query('entity_id');
    if (!entityId) throw new ValidationError('entity_id is required');
    const body = recordStepDecisionBodySchema.parse(await c.req.json());
    const result = await recordDecision(
      actor.orgId,
      {
        entityKind,
        entityId,
        chosenActionType: body.chosen_action_type,
        chosenAt: new Date(body.chosen_at),
      },
      actor.userId,
    );
    if (!result) throw new NotFoundError('no active enrollment for this entity');
    return c.json(result);
  })

  .delete('/enrollments/:id', async (c) => {
    const actor = requireActor(c);
    const id = c.req.param('id');
    const updated = await db
      .update(flowEnrollments)
      .set({ status: 'cancelled', completedAt: new Date() })
      .where(and(orgScope(flowEnrollments.organizationId, actor.orgId), eq(flowEnrollments.id, id)))
      .returning({ id: flowEnrollments.id });
    if (updated.length === 0) throw new NotFoundError('enrollment not found');
    return c.json({ ok: true });
  });
