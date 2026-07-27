// Client IP resolution behind the ArvanCloud edge → Caddy → api chain (ADR-013).
//
// 🔒 Never read a raw `x-forwarded-for` as an identity: it is a comma-separated
// chain (`<client>, <edge>, <caddy-peer>`) that the CLIENT can prepend to. Used
// directly as a rate-limit key it fails both ways — a varying chain fragments
// the bucket so the cap never fires, and an attacker sending their own header
// gets a fresh bucket per request.
//
// Single source of truth is OUR Caddy, which sets `X-Real-IP: {client_ip}` with
// `header_up` — that overwrites anything the client sent, so it is trustworthy
// by construction. `{client_ip}` is only the *real* client once Caddy's
// `trusted_proxies` lists the Arvan edge ranges; until then it is the edge IP —
// wrong, but consistent and unspoofable, which is the safe failure direction.
//
// The XFF fallback exists only for local dev / direct-to-api calls where no
// Caddy is in front. It takes the left-most entry and is NOT trusted upstream.

import type { Context } from 'hono';

const firstForwardedFor = (header: string): string | undefined => {
  const first = header.split(',')[0]?.trim();
  return first && first.length > 0 ? first : undefined;
};

/**
 * The client IP to use as a rate-limit / audit key, or undefined when none can
 * be established. Returns a SINGLE address — never a proxy chain.
 */
export const clientIp = (c: Context): string | undefined => {
  const realIp = c.req.header('x-real-ip')?.trim();
  if (realIp) return realIp;

  const forwarded = c.req.header('x-forwarded-for');
  return forwarded ? firstForwardedFor(forwarded) : undefined;
};
