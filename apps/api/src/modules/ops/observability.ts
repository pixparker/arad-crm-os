// Ops → audit trail + integration inbox (ADR-014 §2). Read-only surfaces, plus
// the one write worth having here: replaying a failed producer event.
//
// The audit list is the payoff for the same-transaction audit rule — it spans
// tenants, which is exactly why the reads carry the escape hatch.

import { auditEntrySchema, inboxEventSchema } from '@arad-crm/api-contracts';
import { auditLog, db, integrationEventsInbox, organizations, users } from '@arad-crm/db';
import { NotFoundError, ValidationError } from '@arad/errors';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { requireOpsRole } from '../../middleware/ops-session.js';
import { writeOpsAudit } from './audit.js';

export const opsObservabilityRoutes = new Hono()
  .get('/audit', async (c) => {
    requireOpsRole(c, 'support', 'finance', 'onboarding_agent');
    const orgFilter = c.req.query('organization_id');
    const actorFilter = c.req.query('actor_user_id');
    const filters = [];
    if (orgFilter) filters.push(eq(auditLog.organizationId, orgFilter));
    if (actorFilter) filters.push(eq(auditLog.actorUserId, actorFilter));

    // @invariant-allow: orgScope-cross-tenant the ops audit screen spans every tenant by design
    const rows = await db
      .select({
        entry: auditLog,
        organizationName: organizations.name,
        actorPhone: users.phone,
      })
      .from(auditLog)
      .leftJoin(organizations, eq(organizations.id, auditLog.organizationId))
      .leftJoin(users, eq(users.id, auditLog.actorUserId))
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(auditLog.createdAt))
      .limit(200);

    return c.json({
      items: rows.map((r) =>
        auditEntrySchema.parse({
          id: r.entry.id,
          organization_id: r.entry.organizationId,
          organization_name: r.organizationName,
          actor_user_id: r.entry.actorUserId,
          actor_phone: r.actorPhone,
          action: r.entry.action,
          entity_type: r.entry.entityType,
          entity_id: r.entry.entityId,
          before: r.entry.before,
          after: r.entry.after,
          reason: r.entry.reason,
          correlation_id: r.entry.correlationId,
          created_at: r.entry.createdAt.toISOString(),
        }),
      ),
    });
  })

  .get('/inbox', async (c) => {
    requireOpsRole(c, 'support', 'finance');
    const status = c.req.query('status');
    const rows = await db
      .select()
      .from(integrationEventsInbox)
      .where(
        status
          ? eq(
              integrationEventsInbox.status,
              status as (typeof integrationEventsInbox.$inferSelect)['status'],
            )
          : undefined,
      )
      .orderBy(desc(integrationEventsInbox.receivedAt))
      .limit(200);
    return c.json({
      items: rows.map((r) =>
        inboxEventSchema.parse({
          id: r.id,
          producer: r.producer,
          event_id: r.eventId,
          type: r.type,
          version: r.version,
          status: r.status,
          attempts: r.attempts,
          error: r.error,
          received_at: r.receivedAt.toISOString(),
          processed_at: r.processedAt?.toISOString() ?? null,
        }),
      ),
    });
  })

  // Replay = hand the row back to the worker's sweep by resetting it to
  // pending. Safe to press twice: every handler is idempotent (ADR-006), and
  // the commission ledger's uniqueness is what actually prevents a double
  // payout — not this button's discipline.
  .post('/inbox/:id/replay', async (c) => {
    const actor = requireOpsRole(c, 'support');
    const id = c.req.param('id');
    return db.transaction(async (tx) => {
      const row = (
        await tx.select().from(integrationEventsInbox).where(eq(integrationEventsInbox.id, id))
      )[0];
      if (!row) throw new NotFoundError('inbox event not found');
      if (!(['failed', 'dead', 'skipped'] as string[]).includes(row.status)) {
        throw new ValidationError(`رویداد در وضعیت ${row.status} قابل پخش مجدد نیست`);
      }
      await tx
        .update(integrationEventsInbox)
        .set({ status: 'pending', attempts: 0, error: null })
        .where(eq(integrationEventsInbox.id, id));
      await writeOpsAudit(tx, c, actor, {
        action: 'ops.inbox.replayed',
        entityType: 'integration_event',
        entityId: id,
        before: { status: row.status, attempts: row.attempts },
      });
      return c.json({ ok: true });
    });
  })

  // Bulk replay of everything currently failed — the realistic shape of "the
  // producer was down for an hour".
  .post('/inbox/replay-failed', async (c) => {
    const actor = requireOpsRole(c, 'support');
    return db.transaction(async (tx) => {
      const replayed = await tx
        .update(integrationEventsInbox)
        .set({ status: 'pending', attempts: 0, error: null })
        .where(inArray(integrationEventsInbox.status, ['failed', 'dead']))
        .returning({ id: integrationEventsInbox.id });
      await writeOpsAudit(tx, c, actor, {
        action: 'ops.inbox.replayed_bulk',
        entityType: 'integration_event',
        entityId: 'bulk',
        after: { count: replayed.length },
      });
      return c.json({ replayed: replayed.length });
    });
  });
