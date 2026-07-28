// 🔒 The tenant-side twin of `ops/audit.ts` (business-architecture §11 rule 11):
// a change to who owns a lead, what stage a deal is in, or which Mizro business
// an account is bound to must leave a row saying who did it and what it was
// before. Ops writes have been audited since ADR-014; these are the tenant
// writes that reach the same three things — ownership, pipeline state, and the
// attribution bridge that decides whose commission it is.
//
// Deliberately NOT audited: activity logging (activities ARE the log, and
// duplicating them doubles the write for nothing) and account attribute edits
// that carry no ownership or money consequence.
//
// Same transaction as the change, always — the audit row and the change are
// one fact, and a helper that takes the `tx` is what keeps them that way.

import { type Db, auditLog } from '@arad-crm/db';
import type { Context } from 'hono';
import type { Actor } from '../middleware/session.js';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface TenantAuditInput {
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
}

export const writeAudit = async (
  tx: Tx | Db,
  c: Context,
  actor: Actor,
  input: TenantAuditInput,
): Promise<void> => {
  await tx.insert(auditLog).values({
    organizationId: actor.orgId,
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
