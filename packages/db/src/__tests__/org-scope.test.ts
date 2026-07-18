import { TenantIsolationViolation } from '@arad/errors';
import { describe, expect, it } from 'vitest';
import { orgScope } from '../org-scope.js';
import { orgMembers } from '../schema.js';
import { uuidv7 } from '../uuid.js';

describe('orgScope', () => {
  it('throws TenantIsolationViolation on empty organizationId', () => {
    expect(() => orgScope(orgMembers.organizationId, '')).toThrow(TenantIsolationViolation);
  });

  it('builds an equality predicate for a real id', () => {
    const sql = orgScope(orgMembers.organizationId, uuidv7());
    expect(sql).toBeDefined();
  });
});

describe('uuidv7', () => {
  it('emits version-7, RFC-variant, time-ordered ids', () => {
    const a = uuidv7();
    const b = uuidv7();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    // same-millisecond ties can order either way; prefix (timestamp) must not decrease
    expect(b.slice(0, 8) >= a.slice(0, 8)).toBe(true);
  });
});
