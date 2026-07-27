// The ConnectStore port implementation (ADR-014 §3) — the ONLY place in this
// repo allowed to query `connections`, `connection_events` or
// `connection_templates`, and the only place that names the four encrypted
// columns. Everything else goes through @arad/connect's exported API.
//
// 🔒 Every mutating method writes its audit event in the SAME transaction as
// the change. The port's signatures make that structural: each one takes the
// event row it must be atomic with, so there is no shape of call that skips it.
//
// These tables are platform-scoped (no organization_id), so orgScope() does
// not apply — see the schema comment on `connections`.

import { config } from '@arad-crm/config';
import { type Db, connectionEvents, connectionTemplates, connections, db } from '@arad-crm/db';
import {
  type ConnectStore,
  type Connection,
  type ConnectionEventRow,
  type ConnectionTemplate,
  type ConnectionWithSecrets,
  initConnect,
} from '@arad/connect';
import { logger } from '@arad/logger';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

// The public projection. Encrypted columns are structurally absent, so no
// query built on it can ship ciphertext to a caller.
const publicColumns = {
  id: connections.id,
  type: connections.type,
  provider: connections.provider,
  label: connections.label,
  status: connections.status,
  capabilities: connections.capabilities,
  health: connections.health,
  credHint: connections.credHint,
  kekVersion: connections.kekVersion,
  createdAt: connections.createdAt,
  updatedAt: connections.updatedAt,
  createdByOpsUserId: connections.createdByOpsUserId,
  updatedByOpsUserId: connections.updatedByOpsUserId,
  deletedAt: connections.deletedAt,
};

// The db columns are `text` (the vocabulary is owned by @arad/connect's adapter
// registry, not by a pg enum that a new provider would have to migrate).
const asConnection = (row: Record<string, unknown>): Connection => row as unknown as Connection;

const asTemplate = (row: typeof connectionTemplates.$inferSelect): ConnectionTemplate => ({
  id: row.id,
  connectionId: row.connectionId,
  alias: row.alias,
  purpose: row.purpose as ConnectionTemplate['purpose'],
  providerTemplateRef: row.providerTemplateRef,
  codeVarName: row.codeVarName,
  isActive: row.isActive,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  createdBy: row.createdBy,
});

const insertEvent = (tx: Tx, event: ConnectionEventRow): Promise<unknown> =>
  tx.insert(connectionEvents).values({
    connectionId: event.connectionId,
    event: event.event,
    actorOpsUserId: event.actorOpsUserId,
    meta: event.meta,
  });

export const connectStore: ConnectStore = {
  async insertConnection(row, event) {
    return db.transaction(async (tx) => {
      const inserted = await tx
        .insert(connections)
        .values({
          type: row.type,
          provider: row.provider,
          label: row.label,
          capabilities: row.capabilities,
          credHint: row.credHint,
          encryptedDek: row.encryptedDek,
          dekNonce: row.dekNonce,
          encryptedCreds: row.encryptedCreds,
          credsNonce: row.credsNonce,
          createdByOpsUserId: row.createdByOpsUserId,
          updatedByOpsUserId: row.createdByOpsUserId,
        })
        .returning(publicColumns);
      const created = inserted[0];
      if (!created) throw new Error('connection insert returned no row');
      await insertEvent(tx, { ...event, connectionId: created.id });
      return asConnection(created);
    });
  },

  async findConnection(id) {
    const row = (await db.select(publicColumns).from(connections).where(eq(connections.id, id)))[0];
    return row ? asConnection(row) : null;
  },

  async findConnectionWithSecrets(id) {
    const row = (
      await db
        .select()
        .from(connections)
        .where(and(eq(connections.id, id), isNull(connections.deletedAt)))
    )[0];
    return row ? (row as unknown as ConnectionWithSecrets) : null;
  },

  async listConnections(filter) {
    const conds = [];
    if (!filter.includeDeleted) conds.push(isNull(connections.deletedAt));
    if (filter.type) conds.push(eq(connections.type, filter.type));
    if (filter.status) conds.push(eq(connections.status, filter.status));
    if (filter.capability) {
      conds.push(sql`${connections.capabilities} @> ARRAY[${filter.capability}]::text[]`);
    }
    const rows = await db
      .select(publicColumns)
      .from(connections)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(connections.createdAt));
    return rows.map(asConnection);
  },

  async updateConnectionCreds(id, envelope, credHint, actorOpsUserId, event) {
    await db.transaction(async (tx) => {
      await tx
        .update(connections)
        .set({
          encryptedDek: envelope.encryptedDek,
          dekNonce: envelope.dekNonce,
          encryptedCreds: envelope.encryptedCreds,
          credsNonce: envelope.credsNonce,
          credHint,
          updatedAt: new Date(),
          updatedByOpsUserId: actorOpsUserId,
        })
        .where(eq(connections.id, id));
      await insertEvent(tx, event);
    });
  },

  async updateConnectionStatus(id, status, actorOpsUserId, event) {
    await db.transaction(async (tx) => {
      await tx
        .update(connections)
        .set({ status, updatedAt: new Date(), updatedByOpsUserId: actorOpsUserId })
        .where(eq(connections.id, id));
      await insertEvent(tx, event);
    });
  },

  async softDeleteConnection(id, actorOpsUserId, event) {
    await db.transaction(async (tx) => {
      await tx
        .update(connections)
        .set({ deletedAt: new Date(), updatedAt: new Date(), updatedByOpsUserId: actorOpsUserId })
        .where(eq(connections.id, id));
      await insertEvent(tx, event);
    });
  },

  async updateConnectionHealth(id, health, event) {
    await db.transaction(async (tx) => {
      await tx
        .update(connections)
        .set({ health, updatedAt: new Date() })
        .where(eq(connections.id, id));
      if (event) await insertEvent(tx, event);
    });
  },

  async insertConnectionEvent(event) {
    await db.insert(connectionEvents).values({
      connectionId: event.connectionId,
      event: event.event,
      actorOpsUserId: event.actorOpsUserId,
      meta: event.meta,
    });
  },

  async listTemplates(connectionId, filter) {
    const conds = [eq(connectionTemplates.connectionId, connectionId)];
    if (filter.purpose) conds.push(eq(connectionTemplates.purpose, filter.purpose));
    if (!filter.includeInactive) conds.push(eq(connectionTemplates.isActive, true));
    const rows = await db
      .select()
      .from(connectionTemplates)
      .where(and(...conds))
      .orderBy(connectionTemplates.createdAt);
    return rows.map(asTemplate);
  },

  async getTemplate(id) {
    const row = (
      await db.select().from(connectionTemplates).where(eq(connectionTemplates.id, id))
    )[0];
    return row ? asTemplate(row) : null;
  },

  async insertTemplate(row, event) {
    return db.transaction(async (tx) => {
      const inserted = await tx
        .insert(connectionTemplates)
        .values({
          connectionId: row.connectionId,
          alias: row.alias,
          purpose: row.purpose,
          providerTemplateRef: row.providerTemplateRef,
          codeVarName: row.codeVarName,
          createdBy: row.createdBy,
        })
        .returning();
      const created = inserted[0];
      if (!created) throw new Error('template insert returned no row');
      await insertEvent(tx, event);
      return asTemplate(created);
    });
  },

  async updateTemplate(id, patch, event) {
    return db.transaction(async (tx) => {
      const updated = await tx
        .update(connectionTemplates)
        .set({
          ...(patch.alias !== undefined ? { alias: patch.alias } : {}),
          ...(patch.providerTemplateRef !== undefined
            ? { providerTemplateRef: patch.providerTemplateRef }
            : {}),
          ...(patch.codeVarName !== undefined ? { codeVarName: patch.codeVarName } : {}),
          ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
          updatedAt: new Date(),
        })
        .where(eq(connectionTemplates.id, id))
        .returning();
      const row = updated[0];
      if (!row) throw new Error('template not found');
      const template = asTemplate(row);
      await insertEvent(tx, event(template));
      return template;
    });
  },
};

let started = false;

/**
 * Boot Connect. 🔒 A throw here is fatal by design: a missing or invalid master
 * key means credential storage is dead, and we never silently fall back to a
 * fake sender — that is how an OTP outage hides. Returns false only when the
 * deployment has deliberately opted out (SMS_PROVIDER=fake in dev).
 */
export const startConnect = async (): Promise<boolean> => {
  if (config.SMS_PROVIDER === 'fake') {
    logger.warn(
      { provider: config.SMS_PROVIDER },
      'connect: disabled (SMS_PROVIDER=fake) — OTP codes go to stdout',
    );
    return false;
  }
  if (started) return true;
  await initConnect({ store: connectStore, logger });
  started = true;
  logger.info({}, 'connect: initialized');
  return true;
};
