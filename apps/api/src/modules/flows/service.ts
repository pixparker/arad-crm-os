// Flows service API (ADR-015 §4). Other modules reach flows ONLY through
// here (re-exported from ./index.ts) — never by querying flow tables.
//
// 🔒 This module reads leads/opportunities/accounts through their own service
// APIs and writes only its own tables. It never touches `leads.next_action_*`:
// it returns a suggestion, and the leads module decides what to persist. That
// separation is what keeps "the system suggested X" and "the seller chose Y"
// two different facts.

import type { FlowStep, NextActionSuggestion } from '@arad-crm/api-contracts';
import { flowStepsSchema } from '@arad-crm/api-contracts';
import {
  type Db,
  db,
  flowDefinitions,
  flowEnrollments,
  flowStepDecisions,
  flowVersions,
  orgScope,
} from '@arad-crm/db';
import { NEXT_ACTION_TYPES } from '@arad-crm/vertical-mizro';
import { NotFoundError, ValidationError } from '@arad/errors';
import { and, desc, eq } from 'drizzle-orm';

export type FlowEntityKind = 'lead' | 'opportunity' | 'account';

// Every helper accepts either the pool or an open transaction, so a caller
// that must be atomic with its own writes (leads' guided post-create) can hand
// its tx straight in.
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type Executor = Db | Tx;

const actionLabel = (code: string): string =>
  NEXT_ACTION_TYPES.find((t) => t.code === code)?.label ?? code;

const parseSteps = (raw: unknown): FlowStep[] => flowStepsSchema.parse(raw);

export interface EnrollmentWithFlow {
  enrollmentId: string;
  flowId: string;
  flowKey: string;
  flowLabel: string;
  versionNo: number;
  currentStep: number;
  steps: FlowStep[];
}

/** The active enrollment for an entity, with its (frozen) version's steps. */
export const activeEnrollment = async (
  orgId: string,
  entityKind: FlowEntityKind,
  entityId: string,
  dbOrTx: Executor = db,
): Promise<EnrollmentWithFlow | null> => {
  const row = (
    await dbOrTx
      .select({
        enrollment: flowEnrollments,
        version: flowVersions,
        definition: flowDefinitions,
      })
      .from(flowEnrollments)
      .innerJoin(flowVersions, eq(flowVersions.id, flowEnrollments.flowVersionId))
      .innerJoin(flowDefinitions, eq(flowDefinitions.id, flowVersions.definitionId))
      .where(
        and(
          orgScope(flowEnrollments.organizationId, orgId),
          eq(flowEnrollments.entityKind, entityKind),
          eq(flowEnrollments.entityId, entityId),
          eq(flowEnrollments.status, 'active'),
        ),
      )
      .limit(1)
  )[0];
  if (!row) return null;
  return {
    enrollmentId: row.enrollment.id,
    flowId: row.definition.id,
    flowKey: row.definition.key,
    flowLabel: row.definition.label,
    versionNo: row.version.versionNo,
    currentStep: row.enrollment.currentStep,
    steps: parseSteps(row.version.steps),
  };
};

/**
 * The one thing flows compute: what should happen next on this entity.
 * 🔒 A default, not a mandate — the caller may ignore it entirely, and an
 * entity with no flow is exactly as valid as one with a flow (ADR-015 §2).
 */
export const suggestNextAction = async (
  orgId: string,
  entityKind: FlowEntityKind,
  entityId: string,
): Promise<NextActionSuggestion | null> => {
  const enrollment = await activeEnrollment(orgId, entityKind, entityId);
  if (!enrollment) return null;
  const step = enrollment.steps.find((s) => s.order === enrollment.currentStep);
  if (!step) return null;
  return {
    action_type: step.action_type,
    suggested_at: new Date(Date.now() + step.offset_days * 86_400_000).toISOString(),
    label: step.label,
    source: 'flow',
    flow_id: enrollment.flowId,
    flow_label: enrollment.flowLabel,
    step_order: step.order,
  };
};

/** Playbooks that may be enrolled on an entity of this kind, right now. */
export const availableFlows = async (
  orgId: string,
  entityKind: FlowEntityKind,
): Promise<{ id: string; key: string; label: string }[]> => {
  const rows = await db
    .select({ id: flowDefinitions.id, key: flowDefinitions.key, label: flowDefinitions.label })
    .from(flowDefinitions)
    .where(
      and(
        orgScope(flowDefinitions.organizationId, orgId),
        eq(flowDefinitions.entityKind, entityKind),
        eq(flowDefinitions.status, 'active'),
      ),
    )
    .orderBy(flowDefinitions.label);
  return rows;
};

/**
 * Enroll an entity in a flow's CURRENT version. Re-enrolling the same entity
 * replaces the enrollment (one active playbook per entity — two would make
 * "the" suggested next step ambiguous).
 */
export const enroll = async (
  orgId: string,
  input: { entityKind: FlowEntityKind; entityId: string; flowId: string },
  actorUserId: string,
  dbOrTx: Executor = db,
): Promise<EnrollmentWithFlow> => {
  const definition = (
    await dbOrTx
      .select()
      .from(flowDefinitions)
      .where(
        and(orgScope(flowDefinitions.organizationId, orgId), eq(flowDefinitions.id, input.flowId)),
      )
  )[0];
  if (!definition) throw new NotFoundError('flow not found');
  if (definition.status !== 'active') throw new ValidationError('این فلو غیرفعال است');
  if (definition.entityKind !== input.entityKind) {
    throw new ValidationError(`این فلو برای ${definition.entityKind} است، نه ${input.entityKind}`);
  }
  if (!definition.currentVersionId) throw new ValidationError('این فلو هنوز نسخه‌ای ندارد');

  const version = (
    await dbOrTx
      .select()
      .from(flowVersions)
      .where(
        and(
          orgScope(flowVersions.organizationId, orgId),
          eq(flowVersions.id, definition.currentVersionId),
        ),
      )
  )[0];
  if (!version) throw new NotFoundError('flow version not found');

  await dbOrTx
    .insert(flowEnrollments)
    .values({
      organizationId: orgId,
      entityKind: input.entityKind,
      entityId: input.entityId,
      flowVersionId: version.id,
      currentStep: 1,
      status: 'active',
      enrolledBy: actorUserId,
    })
    .onConflictDoUpdate({
      target: [
        flowEnrollments.organizationId,
        flowEnrollments.entityKind,
        flowEnrollments.entityId,
      ],
      set: {
        flowVersionId: version.id,
        currentStep: 1,
        status: 'active',
        enrolledBy: actorUserId,
        completedAt: null,
      },
    });

  const enrolled = await activeEnrollment(orgId, input.entityKind, input.entityId, dbOrTx);
  if (!enrolled) throw new ValidationError('enrollment failed');
  return enrolled;
};

/**
 * Record what the seller actually chose against what the flow suggested, and
 * advance the enrollment. 🔒 The decision is DERIVED here (accepted when the
 * chosen action equals the suggestion) — a client cannot assert that it
 * followed the playbook when it did not.
 */
export const recordDecision = async (
  orgId: string,
  input: {
    entityKind: FlowEntityKind;
    entityId: string;
    chosenActionType: string;
    chosenAt: Date;
  },
  actorUserId: string,
  dbOrTx: Executor = db,
): Promise<{ decision: 'accepted' | 'overridden'; nextStep: number | null } | null> => {
  const enrollment = await activeEnrollment(orgId, input.entityKind, input.entityId, dbOrTx);
  if (!enrollment) return null;
  const step = enrollment.steps.find((s) => s.order === enrollment.currentStep);
  if (!step) return null;

  const decision = step.action_type === input.chosenActionType ? 'accepted' : 'overridden';
  await dbOrTx.insert(flowStepDecisions).values({
    organizationId: orgId,
    enrollmentId: enrollment.enrollmentId,
    stepOrder: step.order,
    suggestedActionType: step.action_type,
    suggestedAt: new Date(),
    chosenActionType: input.chosenActionType,
    chosenAt: input.chosenAt,
    decision,
    actorUserId,
  });

  const nextStep = enrollment.currentStep + 1;
  const done = nextStep > enrollment.steps.length;
  await dbOrTx
    .update(flowEnrollments)
    .set({
      currentStep: nextStep,
      ...(done ? { status: 'completed' as const, completedAt: new Date() } : {}),
    })
    .where(
      and(
        orgScope(flowEnrollments.organizationId, orgId),
        eq(flowEnrollments.id, enrollment.enrollmentId),
      ),
    );

  return { decision, nextStep: done ? null : nextStep };
};

/** Publish a new immutable version and point the definition at it. */
export const publishVersion = async (
  orgId: string,
  definitionId: string,
  steps: FlowStep[],
  actorUserId: string,
  dbOrTx: Executor = db,
): Promise<{ versionId: string; versionNo: number }> => {
  const latest = (
    await dbOrTx
      .select({ versionNo: flowVersions.versionNo })
      .from(flowVersions)
      .where(
        and(
          orgScope(flowVersions.organizationId, orgId),
          eq(flowVersions.definitionId, definitionId),
        ),
      )
      .orderBy(desc(flowVersions.versionNo))
      .limit(1)
  )[0];
  const versionNo = (latest?.versionNo ?? 0) + 1;
  const inserted = await dbOrTx
    .insert(flowVersions)
    .values({
      organizationId: orgId,
      definitionId,
      versionNo,
      steps,
      createdBy: actorUserId,
    })
    .returning({ id: flowVersions.id });
  const version = inserted[0];
  if (!version) throw new ValidationError('flow version insert failed');
  await dbOrTx
    .update(flowDefinitions)
    .set({ currentVersionId: version.id, updatedAt: new Date() })
    .where(
      and(orgScope(flowDefinitions.organizationId, orgId), eq(flowDefinitions.id, definitionId)),
    );
  return { versionId: version.id, versionNo };
};

export const actionTypeLabel = actionLabel;
