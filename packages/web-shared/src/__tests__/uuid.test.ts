// The insecure-context path is the one that matters here: it is the branch no
// developer exercises (localhost is always a secure context) and the one every
// phone hits (a LAN address over plain http never is).
//
// The property is DELETED rather than mocked, because absence is the real
// condition — `crypto.randomUUID` is not a function that throws, it is not
// there at all, and that is exactly what the code under test checks for.

import { describe, expect, it } from 'vitest';
import { randomId } from '../uuid.js';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const withoutRandomUUID = <T>(run: () => T): T => {
  // `randomUUID` lives on `Crypto.prototype`, so deleting it from the instance
  // is a no-op — the lookup just walks up the chain. Shadowing it with an own
  // `undefined` is what actually reproduces "is not a function"; deleting that
  // own property afterwards uncovers the prototype's again.
  Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
  try {
    return run();
  } finally {
    Reflect.deleteProperty(crypto, 'randomUUID');
  }
};

describe('randomId', () => {
  it('returns a v4 uuid in a secure context', () => {
    expect(randomId()).toMatch(V4);
  });

  it('returns a v4 uuid when crypto.randomUUID is missing', () => {
    withoutRandomUUID(() => {
      expect(crypto.randomUUID).toBeUndefined();
      expect(randomId()).toMatch(V4);
    });
  });

  it('does not repeat itself', () => {
    const ids = new Set(Array.from({ length: 500 }, () => randomId()));
    expect(ids.size).toBe(500);
  });

  it('stays unique on the fallback path too', () => {
    withoutRandomUUID(() => {
      const ids = new Set(Array.from({ length: 500 }, () => randomId()));
      expect(ids.size).toBe(500);
    });
  });
});
