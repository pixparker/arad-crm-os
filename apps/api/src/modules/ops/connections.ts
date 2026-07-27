// Ops → connected apps (ADR-014 §3). The demo's "connect my sms.ir as a
// connected app" step.
//
// 🔒 Credentials are write-only: they arrive in a request body, go straight
// into @arad/connect (which encrypts them), and never come back out. Nothing
// in this file reads a credential, and no response shape here has a field one
// could travel in — rotation means re-entering.

import {
  connectionEventSchema,
  connectionSchema,
  connectionTemplateSchema,
  createConnectionBodySchema,
  createTemplateBodySchema,
  providerSchema,
  rotateCredsBodySchema,
  templateTestSendBodySchema,
  testConnectionBodySchema,
  testResultSchema,
  updateConnectionStatusBodySchema,
  updateTemplateBodySchema,
} from '@arad-crm/api-contracts';
import { connectionEvents, db } from '@arad-crm/db';
import {
  type Connection,
  type ConnectionTemplate,
  connectionsStore,
  listAdapters,
  templatesStore,
  testConnection,
} from '@arad/connect';
import { ValidationError } from '@arad/errors';
import { getSetting } from '@arad/platform-config';
import { desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { requireOpsRole } from '../../middleware/ops-session.js';
import { writeOpsAudit } from './audit.js';

const view = (connection: Connection) =>
  connectionSchema.parse({
    id: connection.id,
    type: connection.type,
    provider: connection.provider,
    label: connection.label,
    status: connection.status,
    capabilities: connection.capabilities,
    health: connection.health,
    cred_hint: connection.credHint,
    created_at: connection.createdAt.toISOString(),
    updated_at: connection.updatedAt.toISOString(),
  });

const templateView = (template: ConnectionTemplate) =>
  connectionTemplateSchema.parse({
    id: template.id,
    connection_id: template.connectionId,
    alias: template.alias,
    purpose: template.purpose,
    provider_template_ref: template.providerTemplateRef,
    code_var_name: template.codeVarName,
    is_active: template.isActive,
    created_at: template.createdAt.toISOString(),
  });

export const opsConnectionRoutes = new Hono()
  // The provider catalogue the ops "add connection" form renders itself from —
  // a new adapter ships its own credential fields, no UI change.
  .get('/providers', async (c) => {
    requireOpsRole(c);
    return c.json({
      items: listAdapters().map((a) =>
        providerSchema.parse({
          provider: a.provider,
          type: a.type,
          capabilities: a.capabilities,
          template_support: a.templateSupport,
          cred_fields: a.credFields,
        }),
      ),
    });
  })

  .get('/', async (c) => {
    requireOpsRole(c);
    const items = await connectionsStore.list({});
    return c.json({ items: items.map(view) });
  })

  .post('/', async (c) => {
    const actor = requireOpsRole(c);
    const body = createConnectionBodySchema.parse(await c.req.json());
    const connection = await connectionsStore.create(
      {
        type: body.type,
        provider: body.provider as Connection['provider'],
        label: body.label,
        creds: body.creds,
      },
      { opsUserId: actor.userId },
    );
    // @arad/connect writes its own connection_events row in the same
    // transaction; this is the platform-wide ops trail (ADR-014 §2). The
    // credential itself is never in either — only the masked hint.
    await writeOpsAudit(db, c, actor, {
      action: 'ops.connection.created',
      entityType: 'connection',
      entityId: connection.id,
      after: { provider: connection.provider, label: connection.label, hint: connection.credHint },
    });
    return c.json(view(connection), 201);
  })

  .post('/:id/rotate', async (c) => {
    const actor = requireOpsRole(c);
    const id = c.req.param('id');
    const body = rotateCredsBodySchema.parse(await c.req.json());
    await connectionsStore.rotateCreds(id, body.creds, { opsUserId: actor.userId });
    await writeOpsAudit(db, c, actor, {
      action: 'ops.connection.rotated',
      entityType: 'connection',
      entityId: id,
    });
    const connection = await connectionsStore.get(id);
    return c.json(connection ? view(connection) : { ok: true });
  })

  .patch('/:id/status', async (c) => {
    const actor = requireOpsRole(c);
    const id = c.req.param('id');
    const body = updateConnectionStatusBodySchema.parse(await c.req.json());
    await connectionsStore.updateStatus(id, body.status, { opsUserId: actor.userId });
    await writeOpsAudit(db, c, actor, {
      action: 'ops.connection.status_changed',
      entityType: 'connection',
      entityId: id,
      after: { status: body.status },
    });
    const connection = await connectionsStore.get(id);
    return c.json(connection ? view(connection) : { ok: true });
  })

  .delete('/:id', async (c) => {
    const actor = requireOpsRole(c);
    const id = c.req.param('id');
    await connectionsStore.softDelete(id, { opsUserId: actor.userId });
    await writeOpsAudit(db, c, actor, {
      action: 'ops.connection.deleted',
      entityType: 'connection',
      entityId: id,
    });
    return c.json({ ok: true });
  })

  // Real send against the operator-controlled test recipient — "does the phone
  // ring", not "does the API accept the key".
  .post('/:id/test', async (c) => {
    const actor = requireOpsRole(c);
    const id = c.req.param('id');
    const body = testConnectionBodySchema.parse(await c.req.json().catch(() => ({})));
    const to = body.to ?? (await getSetting<string>('connect.test_recipient_mobile'));
    if (!to) {
      throw new ValidationError(
        'شمارهٔ گیرندهٔ آزمایش تنظیم نشده است — connect.test_recipient_mobile را در تنظیمات پلتفرم وارد کنید',
      );
    }
    const result = await testConnection(id, { to }, { opsUserId: actor.userId });
    return c.json(
      testResultSchema.parse({
        ok: result.ok,
        latency_ms: result.latencyMs,
        ...(result.error ? { error: result.error } : {}),
        ...(result.info ? { info: result.info } : {}),
      }),
    );
  })

  .get('/:id/events', async (c) => {
    requireOpsRole(c);
    const id = c.req.param('id');
    const rows = await db
      .select()
      .from(connectionEvents)
      .where(eq(connectionEvents.connectionId, id))
      .orderBy(desc(connectionEvents.createdAt))
      .limit(100);
    return c.json({
      items: rows.map((r) =>
        connectionEventSchema.parse({
          id: r.id,
          connection_id: r.connectionId,
          event: r.event,
          actor_ops_user_id: r.actorOpsUserId,
          meta: r.meta,
          created_at: r.createdAt.toISOString(),
        }),
      ),
    });
  })

  // ── templates ─────────────────────────────────────────────────────────────
  .get('/:id/templates', async (c) => {
    requireOpsRole(c);
    const items = await templatesStore.list(c.req.param('id'), { includeInactive: true });
    return c.json({ items: items.map(templateView) });
  })

  .post('/:id/templates', async (c) => {
    const actor = requireOpsRole(c);
    const id = c.req.param('id');
    const body = createTemplateBodySchema.parse(await c.req.json());
    const template = await templatesStore.create(
      id,
      {
        alias: body.alias,
        purpose: body.purpose,
        providerTemplateRef: body.provider_template_ref,
        codeVarName: body.code_var_name ?? null,
      },
      { opsUserId: actor.userId },
    );
    await writeOpsAudit(db, c, actor, {
      action: 'ops.connection.template_created',
      entityType: 'connection_template',
      entityId: template.id,
      after: { connection_id: id, alias: template.alias },
    });
    return c.json(templateView(template), 201);
  })

  .patch('/templates/:templateId', async (c) => {
    const actor = requireOpsRole(c);
    const templateId = c.req.param('templateId');
    const body = updateTemplateBodySchema.parse(await c.req.json());
    const template = await templatesStore.update(
      templateId,
      {
        ...(body.alias !== undefined ? { alias: body.alias } : {}),
        ...(body.provider_template_ref !== undefined
          ? { providerTemplateRef: body.provider_template_ref }
          : {}),
        ...(body.code_var_name !== undefined ? { codeVarName: body.code_var_name } : {}),
        ...(body.is_active !== undefined ? { isActive: body.is_active } : {}),
      },
      { opsUserId: actor.userId },
    );
    await writeOpsAudit(db, c, actor, {
      action: 'ops.connection.template_updated',
      entityType: 'connection_template',
      entityId: templateId,
      after: { changed: Object.keys(body) },
    });
    return c.json(templateView(template));
  })

  .post('/templates/:templateId/test-send', async (c) => {
    const actor = requireOpsRole(c);
    const templateId = c.req.param('templateId');
    const body = templateTestSendBodySchema.parse(await c.req.json());
    const result = await templatesStore.testSend(templateId, body.to, {
      opsUserId: actor.userId,
    });
    return c.json(
      testResultSchema.parse({
        ok: result.ok,
        latency_ms: result.latencyMs,
        ...(result.error ? { error: result.error } : {}),
      }),
    );
  });
