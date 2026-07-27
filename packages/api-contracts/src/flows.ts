// Flows + guided next action (ADR-015). 🔒 E01 ships SUGGESTION ONLY — there
// is deliberately no step type with an effect here: no `wait`, no `condition`,
// no `send`. When automation arrives it adds step types to this vocabulary
// rather than replacing it.

import { z } from 'zod';

export const flowEntityKindSchema = z.enum(['lead', 'opportunity', 'account']);
export type FlowEntityKind = z.infer<typeof flowEntityKindSchema>;

export const flowStatusSchema = z.enum(['active', 'archived']);
export const flowEnrollmentStatusSchema = z.enum(['active', 'completed', 'cancelled']);
export const flowStepDecisionSchema = z.enum(['accepted', 'overridden', 'skipped']);

// One playbook step. `action_type` is vertical vocabulary (the Mizro pack's
// NEXT_ACTION_TYPES); `offset_days` is relative to the previous step landing,
// which is why nothing here carries a date.
export const flowStepSchema = z.object({
  order: z.number().int().min(1),
  action_type: z.string().min(2).max(40),
  offset_days: z.number().int().min(0).max(365),
  label: z.string().min(1).max(120),
});
export type FlowStep = z.infer<typeof flowStepSchema>;

export const flowStepsSchema = z.array(flowStepSchema).min(1).max(20);

export const flowDefinitionSchema = z.object({
  id: z.string(),
  key: z.string(),
  label: z.string(),
  entity_kind: flowEntityKindSchema,
  status: flowStatusSchema,
  version_no: z.number().int(),
  steps: flowStepsSchema,
  enrollment_count: z.number().int(),
  created_at: z.string().datetime(),
});
export type FlowDefinition = z.infer<typeof flowDefinitionSchema>;

export const createFlowBodySchema = z.object({
  key: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z][a-z0-9_]*$/, 'key must be lowercase snake_case'),
  label: z.string().min(2).max(120),
  entity_kind: flowEntityKindSchema,
  steps: flowStepsSchema,
});

// 🔒 Editing publishes a NEW version; live enrollments keep pointing at the
// version they started on (ADR-015 §1). There is no endpoint that mutates a
// published version in place.
export const publishFlowVersionBodySchema = z.object({
  steps: flowStepsSchema,
  label: z.string().min(2).max(120).optional(),
});

export const enrollFlowBodySchema = z.object({
  entity_kind: flowEntityKindSchema,
  entity_id: z.string().uuid(),
  flow_id: z.string().uuid(),
});

export const flowEnrollmentSchema = z.object({
  id: z.string(),
  entity_kind: flowEntityKindSchema,
  entity_id: z.string(),
  flow_id: z.string(),
  flow_key: z.string(),
  flow_label: z.string(),
  version_no: z.number().int(),
  current_step: z.number().int(),
  status: flowEnrollmentStatusSchema,
  enrolled_at: z.string().datetime(),
});

// What the ＋ flow and the entity screens read. `source` says where the
// suggestion came from, so the UI can be honest: a flow's default and a
// vertical outcome mapping are not the same claim.
export const nextActionSuggestionSchema = z.object({
  action_type: z.string(),
  suggested_at: z.string().datetime(),
  label: z.string(),
  source: z.enum(['flow', 'vertical_outcome', 'none']),
  flow_id: z.string().nullable(),
  flow_label: z.string().nullable(),
  step_order: z.number().int().nullable(),
});
export type NextActionSuggestion = z.infer<typeof nextActionSuggestionSchema>;

// 🔒 The suggestion is a default, not a mandate (ADR-015 §2): recording what
// was suggested versus what the seller chose is what makes a playbook
// falsifiable. The api derives `decision` — the client never asserts it.
export const recordStepDecisionBodySchema = z.object({
  chosen_action_type: z.string().min(2).max(40),
  chosen_at: z.string().datetime(),
});
