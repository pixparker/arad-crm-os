// Identity module (ADR-005): phone OTP → session cookie. Invite-only 🔒.

import {
  meResponseSchema,
  requestOtpBodySchema,
  verifyOtpBodySchema,
} from '@arad-crm/api-contracts';
import { db, orgMembers, organizations, users } from '@arad-crm/db';
import { issueSession, requestOtp, verifyOtp } from '@arad/auth-otp';
import { AradError, UnauthorizedError } from '@arad/errors';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { authDeps, sessionDeps } from '../../lib/auth-wiring.js';
import {
  clearSessionCookie,
  requireActor,
  session,
  setSessionCookie,
  territoryName,
} from '../../middleware/session.js';

export const identityRoutes = new Hono()
  .post('/request-otp', async (c) => {
    const body = requestOtpBodySchema.parse(await c.req.json());
    const ip = c.req.header('x-forwarded-for') ?? undefined;
    const result = await requestOtp(authDeps, { mobile: body.mobile, ip });
    if (!result.ok) {
      throw new AradError('rate_limited', `otp request refused: ${result.code}`, 429, {
        code: result.code,
        retry_after_sec: result.retryAfterSec,
        has_pending_code: result.hasPendingCode,
      });
    }
    return c.json({
      ok: true as const,
      expires_at: result.expiresAt.toISOString(),
      cooldown_sec: result.cooldownSec,
    });
  })
  .post('/verify', async (c) => {
    const body = verifyOtpBodySchema.parse(await c.req.json());
    const ip = c.req.header('x-forwarded-for') ?? undefined;
    const result = await verifyOtp(authDeps, { mobile: body.mobile, code: body.code, ip });
    if (!result.ok) {
      throw new UnauthorizedError(`otp verify failed: ${result.code}`, {
        code: result.code,
        attempts_remaining: result.attemptsRemaining,
      });
    }
    const token = await issueSession(sessionDeps, result.user);
    setSessionCookie(c, token.token, token.expiresAt);
    return c.json({ ok: true as const });
  })
  .post('/logout', session(), async (c) => {
    clearSessionCookie(c);
    return c.json({ ok: true as const });
  })
  .get('/me', session(), async (c) => {
    const actor = requireActor(c);
    const userRow = (await db.select().from(users).where(eq(users.id, actor.userId)))[0];
    // @invariant-allow: orgScope-cross-tenant membership row already resolved from the session's own user
    const member = (await db.select().from(orgMembers).where(eq(orgMembers.id, actor.memberId)))[0];
    const org = (await db.select().from(organizations).where(eq(organizations.id, actor.orgId)))[0];
    if (!userRow || !member || !org) throw new UnauthorizedError();
    return c.json(
      meResponseSchema.parse({
        user: { id: userRow.id, phone: userRow.phone, display_name: userRow.displayName },
        membership: {
          organization_id: org.id,
          organization_name: org.name,
          role: member.role,
          contract_type: member.contractType,
          territory_id: member.territoryId,
          territory_name: await territoryName(actor.orgId, member.territoryId),
        },
      }),
    );
  });
