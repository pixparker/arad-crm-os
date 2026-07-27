// 🔒 ADR-014 §2: every mutating ops action writes an `audit_log` row in the
// same transaction as the change. Ops crosses tenant boundaries by definition,
// so the audit trail is the only control that survives a mistake.
//
// `organizationId` is null for platform-scoped actions (connections, platform
// settings, ops-role grants) and set for anything that happened to a specific
// business — which is what makes the audit screen filterable by business.

import { type Db, auditLog } from '@arad-crm/db';
import type { Context } from 'hono';
import type { OpsActor } from '../../middleware/ops-session.js';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface OpsAuditInput {
  organizationId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
}

export const writeOpsAudit = async (
  tx: Tx | Db,
  c: Context,
  actor: OpsActor,
  input: OpsAuditInput,
): Promise<void> => {
  await tx.insert(auditLog).values({
    organizationId: input.organizationId ?? null,
    actorUserId: actor.userId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    before: input.before ?? null,
    after: input.after ?? null,
    reason: input.reason ?? null,
    correlationId: c.get('correlationId'),
  });
};
