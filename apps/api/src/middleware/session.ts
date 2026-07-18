// Session middleware (ADR-005): cookie JWT verify + sliding refresh + org
// context resolution. 🔒 Org context ALWAYS comes from the authenticated
// membership — never from client input.

import type { Role } from '@arad-crm/api-contracts';
import { config } from '@arad-crm/config';
import { db, orgMembers, orgScope, organizations, territories } from '@arad-crm/db';
import { issueSession, verifySession } from '@arad/auth-otp';
import { ForbiddenError, UnauthorizedError } from '@arad/errors';
import { and, eq } from 'drizzle-orm';
import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { sessionDeps } from '../lib/auth-wiring.js';

export const SESSION_COOKIE = 'ac_session';

export interface Actor {
  userId: string;
  orgId: string;
  memberId: string;
  role: Role;
  territoryId: string | null;
  displayName: string;
}

declare module 'hono' {
  interface ContextVariableMap {
    actor: Actor | null;
  }
}

export const setSessionCookie = (c: Context, token: string, expiresAt: Date): void => {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: config.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
    ...(config.COOKIE_DOMAIN ? { domain: config.COOKIE_DOMAIN } : {}),
  });
};

export const clearSessionCookie = (c: Context): void => {
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
};

const SELLER_ROLES: readonly Role[] = ['visitor_seller', 'followup_seller'];
export const isSeller = (role: Role): boolean => SELLER_ROLES.includes(role);

export const session = (): MiddlewareHandler => async (c, next) => {
  c.set('actor', null);
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    const user = await verifySession(sessionDeps, token);
    if (user) {
      // @invariant-allow: orgScope-cross-tenant resolving org context FROM the authenticated user (pre-org lookup)
      const rows = await db
        .select({
          memberId: orgMembers.id,
          orgId: orgMembers.organizationId,
          role: orgMembers.role,
          territoryId: orgMembers.territoryId,
          orgName: organizations.name,
        })
        .from(orgMembers)
        .innerJoin(organizations, eq(organizations.id, orgMembers.organizationId))
        .where(eq(orgMembers.userId, user.id))
        .limit(1);
      const m = rows[0];
      if (m) {
        c.set('actor', {
          userId: user.id,
          orgId: m.orgId,
          memberId: m.memberId,
          role: m.role,
          territoryId: m.territoryId,
          displayName: '',
        });
        // sliding refresh (Mizro pattern): every authenticated request extends
        const fresh = await issueSession(sessionDeps, user);
        setSessionCookie(c, fresh.token, fresh.expiresAt);
      }
    }
  }
  await next();
};

export const requireActor = (c: Context): Actor => {
  const actor = c.get('actor');
  if (!actor) throw new UnauthorizedError();
  return actor;
};

export const requireRole = (c: Context, ...roles: Role[]): Actor => {
  const actor = requireActor(c);
  if (!roles.includes(actor.role)) {
    throw new ForbiddenError(`role ${actor.role} may not perform this action`);
  }
  return actor;
};

export const territoryName = async (
  orgId: string,
  territoryId: string | null,
): Promise<string | null> => {
  if (!territoryId) return null;
  const rows = await db
    .select({ name: territories.name })
    .from(territories)
    .where(and(orgScope(territories.organizationId, orgId), eq(territories.id, territoryId)));
  return rows[0]?.name ?? null;
};
