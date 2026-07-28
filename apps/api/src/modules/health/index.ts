// Two different questions, two routes:
//
//   /v1/health        liveness — is the process up? No I/O, always 200. This is
//                     what a process supervisor restarts on.
//   /v1/health/ready  readiness — can it actually serve? Postgres and Redis are
//                     checked for real. This is what the deploy smoke check and
//                     the reverse proxy should ask, because a 200 from a
//                     process that cannot reach its database is exactly the
//                     kind of green light that makes a bad deploy look fine.
//
// 🔒 The response never carries a driver error. Postgres and Redis failure
// messages routinely include the connection string (password and all), and this
// endpoint is unauthenticated by necessity. Callers get a fixed vocabulary;
// the real error goes to the log.

import {
  type ReadinessResponse,
  healthResponseSchema,
  readinessResponseSchema,
} from '@arad-crm/api-contracts';
import { config } from '@arad-crm/config';
import { db } from '@arad-crm/db';
import { isConnectInitialized } from '@arad/connect';
import { logger } from '@arad/logger';
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { sql } from 'drizzle-orm';
import IORedis from 'ioredis';

type Check = ReadinessResponse['checks'][number];

// One lazily-created client, reused across probes — readiness is polled, and a
// fresh connection per poll is its own small outage generator.
let probe: IORedis | null = null;
const redisProbe = (): IORedis => {
  probe ??= new IORedis(config.REDIS_URL, {
    maxRetriesPerRequest: 1,
    lazyConnect: true,
    connectTimeout: 2000,
    // A readiness probe that hangs is worse than one that says "down": the
    // deploy script would wait on it instead of failing the smoke check.
    commandTimeout: 2000,
  });
  probe.on('error', (err) => logger.debug({ err }, 'health: redis probe error'));
  return probe;
};

const timed = async (name: string, required: boolean, run: () => Promise<void>): Promise<Check> => {
  const startedAt = Date.now();
  try {
    await run();
    return { name, status: 'ok', required, latency_ms: Date.now() - startedAt, detail: null };
  } catch (err) {
    logger.error({ err, check: name }, 'health: readiness check failed');
    return {
      name,
      status: 'down',
      required,
      latency_ms: Date.now() - startedAt,
      detail: 'unreachable',
    };
  }
};

const liveness = createRoute({
  method: 'get',
  path: '/',
  responses: {
    200: {
      description: 'Service liveness',
      content: { 'application/json': { schema: healthResponseSchema } },
    },
  },
});

const readiness = createRoute({
  method: 'get',
  path: '/ready',
  responses: {
    200: {
      description: 'Every required dependency reachable',
      content: { 'application/json': { schema: readinessResponseSchema } },
    },
    503: {
      description: 'A required dependency is unreachable',
      content: { 'application/json': { schema: readinessResponseSchema } },
    },
  },
});

export const healthRoutes = new OpenAPIHono()
  .openapi(liveness, (c) =>
    c.json(
      { status: 'ok' as const, service: 'arad-crm-api' as const, time: new Date().toISOString() },
      200,
    ),
  )
  .openapi(readiness, async (c) => {
    const checks: Check[] = [
      await timed('database', true, async () => {
        await db.execute(sql`select 1`);
      }),
      await timed('redis', true, async () => {
        const client = redisProbe();
        // 'wait' is where lazyConnect leaves it before the first probe.
        if (client.status === 'wait' || client.status === 'end' || client.status === 'close') {
          await client.connect();
        }
        await client.ping();
      }),
      // Informational: with SMS_PROVIDER=connect the api refuses to boot without
      // it, so "not_configured" here can only mean the dev/fake path.
      {
        name: 'connect',
        status: isConnectInitialized() ? ('ok' as const) : ('not_configured' as const),
        required: false,
        latency_ms: 0,
        detail: isConnectInitialized() ? null : `sms_provider=${config.SMS_PROVIDER}`,
      },
    ];

    const failed = checks.some((check) => check.required && check.status !== 'ok');
    return c.json(
      readinessResponseSchema.parse({
        status: failed ? 'degraded' : 'ok',
        service: 'arad-crm-api',
        time: new Date().toISOString(),
        checks,
      }),
      failed ? 503 : 200,
    );
  });
