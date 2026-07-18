import { healthResponseSchema } from '@arad-crm/api-contracts';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app.js';

describe('GET /v1/health', () => {
  it('returns a contract-valid health payload', async () => {
    const res = await createApp().request('/v1/health');
    expect(res.status).toBe(200);
    const body = healthResponseSchema.parse(await res.json());
    expect(body.service).toBe('arad-crm-api');
  });

  it('unknown routes return the contract error shape', async () => {
    const res = await createApp().request('/v1/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: 'not_found' });
  });
});
