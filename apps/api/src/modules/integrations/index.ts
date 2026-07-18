// Integrations (ADR-006): the producer → CRM event door. 🔒 HMAC-signed,
// idempotent inbox (UNIQUE producer+event_id — duplicates ack as no-ops),
// processing happens in the worker sweep. Unsigned/unconfigured ⇒ refused.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '@arad-crm/config';
import { db, integrationEventsInbox } from '@arad-crm/db';
import { AradError, UnauthorizedError } from '@arad/errors';
import { InvalidEventError, UnknownEventError, parseEvent } from '@arad/platform-events';
import { and, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { requireRole, session } from '../../middleware/session.js';

const MAX_SKEW_SECONDS = 300;

const verifySignature = (raw: string, timestamp: string, signature: string): boolean => {
  const secret = config.MIZRO_WEBHOOK_SECRET;
  if (!secret) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}.${raw}`).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
};

export const integrationsRoutes = new Hono()
  .post('/events', async (c) => {
    if (!config.MIZRO_WEBHOOK_SECRET) {
      throw new AradError('config_invariant', 'integration secret not configured', 503);
    }
    const timestamp = c.req.header('x-arad-timestamp') ?? '';
    const signature = c.req.header('x-arad-signature') ?? '';
    const raw = await c.req.text();

    const skew = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (!timestamp || Number.isNaN(skew) || skew > MAX_SKEW_SECONDS) {
      throw new UnauthorizedError('stale or missing timestamp');
    }
    if (!signature || !verifySignature(raw, timestamp, signature)) {
      throw new UnauthorizedError('bad signature');
    }

    let parsed: ReturnType<typeof parseEvent>;
    try {
      parsed = parseEvent(JSON.parse(raw));
    } catch (err) {
      if (err instanceof InvalidEventError || err instanceof UnknownEventError) {
        throw new AradError('validation_error', err.message, 400, {
          issues: err instanceof InvalidEventError ? err.issues : undefined,
        });
      }
      throw err;
    }

    const inserted = await db
      .insert(integrationEventsInbox)
      .values({
        producer: parsed.envelope.producer,
        eventId: parsed.envelope.id,
        type: parsed.envelope.type,
        version: parsed.envelope.version,
        payload: parsed.envelope,
      })
      .onConflictDoNothing({
        target: [integrationEventsInbox.producer, integrationEventsInbox.eventId],
      })
      .returning({ id: integrationEventsInbox.id });

    return c.json({ accepted: true, deduped: inserted.length === 0 });
  })
  // ops replay for failed/dead rows (ADR-006 DLQ path)
  .post('/inbox/:id/replay', session(), async (c) => {
    requireRole(c, 'sales_manager', 'owner_admin', 'deployment_ops');
    const rows = await db
      .update(integrationEventsInbox)
      .set({ status: 'pending', error: null })
      .where(
        and(
          eq(integrationEventsInbox.id, c.req.param('id')),
          inArray(integrationEventsInbox.status, ['failed', 'dead', 'skipped']),
        ),
      )
      .returning({ id: integrationEventsInbox.id });
    return c.json({ ok: rows.length === 1 });
  });
