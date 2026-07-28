// Readiness against the real Postgres + Redis the dev stack runs — the point of
// the endpoint is that it fails when they are missing, so it has to be exercised
// against the actual services rather than mocks.

import { readinessResponseSchema } from '@arad-crm/api-contracts';
import { closePool } from '@arad-crm/db';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';

const app = createApp();

afterAll(async () => {
  await closePool();
});

describe('GET /v1/health/ready', () => {
  it('reports every required dependency and returns 200 when they answer', async () => {
    const res = await app.request('/v1/health/ready');
    const body = readinessResponseSchema.parse(await res.json());

    expect(res.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.checks.map((ch) => ch.name)).toEqual(['database', 'redis', 'connect']);
    expect(body.checks.filter((ch) => ch.required).every((ch) => ch.status === 'ok')).toBe(true);
  });

  // 🔒 unauthenticated endpoint: a driver error would carry the connection
  // string, password included. The vocabulary is fixed on purpose.
  it('never returns a driver error message', async () => {
    const body = (await (await app.request('/v1/health/ready')).json()) as unknown;
    const serialized = JSON.stringify(body);
    expect(serialized).not.toMatch(/postgres(ql)?:\/\//);
    expect(serialized).not.toMatch(/redis:\/\//);
    for (const detail of readinessResponseSchema.parse(body).checks.map((ch) => ch.detail)) {
      expect(detail === null || /^(unreachable|sms_provider=[a-z]+)$/.test(detail)).toBe(true);
    }
  });
});
