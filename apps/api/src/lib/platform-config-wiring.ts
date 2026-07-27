// Concrete infra for @arad/platform-config (ADR-014 §3): a drizzle store over
// `app_settings` and a Redis pub/sub invalidation bus. The package owns the
// registry, validation and cache; this file owns the two things it refuses to
// know about — Postgres and Redis.
//
// The bus subscriber connects lazily, so a process that never reads a setting
// opens no extra Redis connection.

import { config } from '@arad-crm/config';
import { appSettings, db } from '@arad-crm/db';
import { logger } from '@arad/logger';
import {
  type ConfigBus,
  type ConfigStore,
  type StoreRowMeta,
  initPlatformConfig,
  warmPlatformConfig,
} from '@arad/platform-config';
import { inArray, sql } from 'drizzle-orm';
import IORedis from 'ioredis';

const INVALIDATE_CHANNEL = 'arad-crm:config:invalidate';

export const configStore: ConfigStore = {
  async loadMany(keys) {
    if (keys.length === 0) return new Map();
    const rows = await db
      .select({ key: appSettings.key, value: appSettings.value })
      .from(appSettings)
      .where(inArray(appSettings.key, keys));
    return new Map(rows.map((r) => [r.key, r.value]));
  },

  async loadOne(key) {
    const rows = await db
      .select({ value: appSettings.value })
      .from(appSettings)
      .where(inArray(appSettings.key, [key]))
      .limit(1);
    return rows[0]?.value;
  },

  async upsert(key, value, updatedBy) {
    await db
      .insert(appSettings)
      .values({ key, value, updatedBy })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value, updatedBy, updatedAt: sql`now()` },
      });
  },

  async remove(key) {
    await db.delete(appSettings).where(inArray(appSettings.key, [key]));
  },

  async describe(keys) {
    if (keys.length === 0) return new Map<string, StoreRowMeta>();
    const rows = await db
      .select({
        key: appSettings.key,
        value: appSettings.value,
        description: appSettings.description,
        updatedAt: appSettings.updatedAt,
        updatedBy: appSettings.updatedBy,
      })
      .from(appSettings)
      .where(inArray(appSettings.key, keys));
    return new Map<string, StoreRowMeta>(
      rows.map((r) => [
        r.key,
        {
          value: r.value,
          description: r.description,
          updatedAt: r.updatedAt,
          updatedBy: r.updatedBy,
        },
      ]),
    );
  },
};

const createBus = (): ConfigBus => {
  let publisher: IORedis | null = null;
  let subscriber: IORedis | null = null;
  let handler: ((key: string) => void) | null = null;
  let lastMessageAt: number | null = null;

  return {
    publishInvalidate(key) {
      // Fire-and-forget by contract: a config write must not fail because the
      // bus is down — the local cache is already dropped, and other replicas
      // recover within the TTL.
      try {
        publisher ??= new IORedis(config.REDIS_URL, { maxRetriesPerRequest: null });
        void publisher.publish(INVALIDATE_CHANNEL, key);
      } catch (err) {
        logger.warn({ err, key }, 'config bus: publish failed');
      }
    },
    onInvalidate(next) {
      handler = next;
    },
    ensureSubscribed() {
      if (subscriber) return;
      subscriber = new IORedis(config.REDIS_URL, { maxRetriesPerRequest: null });
      subscriber.on('error', (err) => logger.warn({ err }, 'config bus: subscriber error'));
      subscriber.on('message', (_channel, key) => {
        lastMessageAt = Date.now();
        handler?.(key);
      });
      void subscriber.subscribe(INVALIDATE_CHANNEL);
    },
    status() {
      return { connected: subscriber?.status === 'ready', lastMessageAt };
    },
  };
};

let started = false;

/**
 * Wire the config runtime and warm the cache. Idempotent so both the api boot
 * path and a test harness can call it.
 */
export const startPlatformConfig = async (): Promise<void> => {
  if (started) return;
  started = true;
  initPlatformConfig({ store: configStore, bus: createBus(), logger });
  await warmPlatformConfig();
};
