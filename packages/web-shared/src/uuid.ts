// randomId — a v4 UUID that works off localhost.
//
// 🔒 `crypto.randomUUID` is gated behind a SECURE CONTEXT. It exists on
// `localhost` and over HTTPS, and is `undefined` on a plain-http LAN address —
// so every call site that used it directly worked all through development and
// died the moment anyone opened the app on a phone via `http://192.168.x.x`.
// The failure is total, not cosmetic: `apiFetch` stamps a correlation id on
// every request, so a missing function means *no screen loads at all*.
//
// `crypto.getRandomValues` carries no such gate — it is available in insecure
// contexts — so the fallback is genuinely random, not `Math.random` wearing a
// UUID's shape.

/** A random v4 UUID, in or out of a secure context. */
export const randomId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // Version 4, variant 10xx — the two fields that make these bytes a v4 UUID
  // rather than 16 random bytes formatted like one.
  // biome-ignore lint/style/noNonNullAssertion: fixed-length array, indices 6 and 8 exist
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  // biome-ignore lint/style/noNonNullAssertion: fixed-length array, indices 6 and 8 exist
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
