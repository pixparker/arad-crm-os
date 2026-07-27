// Identity module (ADR-005): phone OTP → session cookie. Invite-only 🔒.
// E01-F06 adds workspace resolution: one login can reach several businesses,
// and which one it is currently acting in is an explicit choice.

import {
  meResponseSchema,
  requestOtpBodySchema,
  selectWorkspaceBodySchema,
  verifyOtpBodySchema,
  workspaceSchema,
} from '@arad-crm/api-contracts';
import { issueSession, requestOtp, verifyOtp } from '@arad/auth-otp';
import { AradError, ForbiddenError, UnauthorizedError, ValidationError } from '@arad/errors';
import { Hono } from 'hono';
import { authDeps, sessionDeps } from '../../lib/auth-wiring.js';
import { clientIp } from '../../lib/client-ip.js';
import {
  type Workspace,
  clearSessionCookie,
  requireActor,
  requireSession,
  session,
  setSessionCookie,
  setWorkspaceCookie,
  territoryName,
} from '../../middleware/session.js';

const workspaceView = async (w: Workspace) =>
  workspaceSchema.parse({
    organization_id: w.orgId,
    organization_name: w.orgName,
    role: w.role,
    contract_type: w.contractType,
    territory_id: w.territoryId,
    territory_name: await territoryName(w.orgId, w.territoryId),
  });

export const identityRoutes = new Hono()
  .post('/request-otp', async (c) => {
    const body = requestOtpBodySchema.parse(await c.req.json());
    const ip = clientIp(c);
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
    const ip = clientIp(c);
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
  // Readable without an active workspace — this is what the selector renders
  // when a user belongs to more than one business.
  .get('/workspaces', session(), async (c) => {
    const state = requireSession(c);
    return c.json({ items: await Promise.all(state.workspaces.map(workspaceView)) });
  })
  // 🔒 The chosen org is confirmed against this user's own membership list
  // before it is stored — a cookie value is a request, not an authorization.
  .post('/workspace', session(), async (c) => {
    const state = requireSession(c);
    const body = selectWorkspaceBodySchema.parse(await c.req.json());
    const chosen = state.workspaces.find((w) => w.orgId === body.organization_id);
    if (!chosen) throw new ForbiddenError('شما عضو این کسب‌وکار نیستید');
    setWorkspaceCookie(c, chosen.orgId);
    return c.json(await workspaceView(chosen));
  })
  .get('/me', session(), async (c) => {
    const state = requireSession(c);
    // Throws 409 workspace_selection_required when the choice is ambiguous,
    // 403 no_workspace when there is nothing to choose from.
    const actor = requireActor(c);
    const active = state.workspaces.find((w) => w.orgId === actor.orgId);
    if (!active) throw new ValidationError('active workspace vanished mid-request');
    return c.json(
      meResponseSchema.parse({
        user: { id: state.userId, phone: state.phone, display_name: state.displayName },
        membership: await workspaceView(active),
        workspaces: await Promise.all(state.workspaces.map(workspaceView)),
        is_ops: state.isOps,
      }),
    );
  });
