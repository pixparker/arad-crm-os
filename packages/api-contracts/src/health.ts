import { z } from 'zod';

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('arad-crm-api'),
  time: z.string().datetime(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

// Readiness — "can this process actually serve requests", which liveness
// deliberately does not answer. 🔒 `detail` is a fixed vocabulary, never the
// underlying driver error: a Postgres or Redis failure message can carry the
// connection string, and this endpoint is unauthenticated by necessity (the
// deploy smoke check and the reverse proxy both hit it). The real error is
// logged server-side.
export const readinessCheckStatusSchema = z.enum(['ok', 'down', 'not_configured']);

export const readinessResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  service: z.literal('arad-crm-api'),
  time: z.string().datetime(),
  checks: z.array(
    z.object({
      name: z.string(),
      status: readinessCheckStatusSchema,
      required: z.boolean(),
      latency_ms: z.number().int(),
      detail: z.string().nullable(),
    }),
  ),
});
export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;
