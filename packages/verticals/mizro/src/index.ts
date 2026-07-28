// Mizro cafe vertical — vertical #1 (ADR-010).

export interface VerticalManifest {
  key: string;
  label: string;
  version: number;
}

export const mizroVertical: VerticalManifest = {
  key: 'mizro',
  label: 'میزرو',
  version: 1,
};

export {
  LEAD_SOURCES,
  LOSS_REASONS,
  NEXT_ACTION_OFFSETS,
  NEXT_ACTION_TYPES,
  REQUESTED_PRODUCTS,
  OPPORTUNITY_STAGES,
  VISIT_OUTCOMES,
  WIN_REASONS,
  isLeadSource,
  isLossReason,
  isNextActionType,
  isOpportunityStage,
  isOutcome,
  isRequestedProduct,
  isWinReason,
  type OutcomeDef,
} from './presets.js';
export { findingsSchema, mergeFindings, type Findings } from './findings.js';
