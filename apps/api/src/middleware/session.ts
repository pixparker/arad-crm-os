// Session middleware (ADR-005): cookie JWT verify + sliding refresh + org
// context resolution. 🔒 Org context ALWAYS comes from the authenticated
// membership — never from client input.
//
// E01-F06 (workspace resolution): a user may belong to several businesses.
// Every membership is resolved on every request; the ACTIVE one is either the
// only one, or the one named by the `ac_workspace` cookie AND confirmed
// against that same membership list. An unresolvable choice is an explicit
// 409 `workspace_selection_required`, never a silent default — picking a
// workspace for the seller is how data lands in the wrong business.

import type { Role } from '@arad-crm/api-contracts';
import { config } from '@arad-crm/config';
import { db, orgMembers, orgScope, organizations, territories, users } from '@arad-crm/db';
import { issueSession, verifySession } from '@arad/auth-otp';
import { AradError, ForbiddenError, UnauthorizedError } from '@arad/errors';
import { and, asc, eq } from 'drizzle-orm';
import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { sessionDeps } from '../lib/auth-wiring.js';

export const SESSION_COOKIE = 'ac_session';
// Which business the session is currently acting in. Separate from the JWT so
// switching workspaces never re-issues (or invalidates) the login itself.
export const WORKSPACE_COOKIE = 'ac_workspace';

export interface Workspace {
  memberId: string;
  orgId: string;
  orgName: string;
  role: Role;
  territoryId: string | null;
  contractType: 'full_time' | 'part_time';
}

export interface Actor {
  userId: string;
  orgId: string;
  memberId: string;
  role: Role;
  territoryId: string | null;
  displayName: string;
}

export interface SessionState {
  userId: string;
  displayName: string;
  phone: string;
  isOps: boolean;
  workspaces: Workspace[];
}

declare module 'hono' {
  interface ContextVariableMap {
    actor: Actor | null;
    sessionState: SessionState | null;
  }
}

const cookieBase = () =>
  ({
    httpOnly: true,
    sameSite: 'Lax',
    secure: config.NODE_ENV === 'production',
    path: '/',
    ...(config.COOKIE_DOMAIN ? { domain: config.COOKIE_DOMAIN } : {}),
  }) as const;

export const setSessionCookie = (c: Context, token: string, expiresAt: Date): void => {
  setCookie(c, SESSION_COOKIE, token, { ...cookieBase(), expires: expiresAt });
};

export const setWorkspaceCookie = (c: Context, orgId: string): void => {
  setCookie(c, WORKSPACE_COOKIE, orgId, { ...cookieBase() });
};

export const clearSessionCookie = (c: Context): void => {
  // 🔒 Deletion matches on name + domain + path. The domain MUST mirror
  // setSessionCookie — omitting it clears only a host-only cookie and leaves a
  // `Domain=.aradap.ir` session alive, i.e. logout silently does nothing in
  // production (ADR-013 §3 sets COOKIE_DOMAIN; unset in dev, which is why this
  // stayed latent).
  const attrs = {
    path: '/',
    ...(config.COOKIE_DOMAIN ? { domain: config.COOKIE_DOMAIN } : {}),
  };
  deleteCookie(c, SESSION_COOKIE, attrs);
  deleteCookie(c, WORKSPACE_COOKIE, attrs);
};

const SELLER_ROLES: readonly Role[] = ['visitor_seller', 'followup_seller'];
export const isSeller = (role: Role): boolean => SELLER_ROLES.includes(role);

export const session = (): MiddlewareHandler => async (c, next) => {
  c.set('actor', null);
  c.set('sessionState', null);
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    const authUser = await verifySession(sessionDeps, token);
    if (authUser) {
      const userRow = (await db.select().from(users).where(eq(users.id, authUser.id)))[0];
      // @invariant-allow: orgScope-cross-tenant resolving org context FROM the authenticated user (pre-org lookup)
      const rows = await db
        .select({
          memberId: orgMembers.id,
          orgId: orgMembers.organizationId,
          orgName: organizations.name,
          role: orgMembers.role,
          territoryId: orgMembers.territoryId,
          contractType: orgMembers.contractType,
          orgStatus: organizations.status,
        })
        .from(orgMembers)
        .innerJoin(organizations, eq(organizations.id, orgMembers.organizationId))
        .where(eq(orgMembers.userId, authUser.id))
        .orderBy(asc(organizations.name));

      // A suspended business is not a workspace — it disappears from the
      // selector rather than logging the whole user out.
      const workspaces: Workspace[] = rows
        .filter((r) => r.orgStatus === 'active')
        .map((r) => ({
          memberId: r.memberId,
          orgId: r.orgId,
          orgName: r.orgName,
          role: r.role,
          territoryId: r.territoryId,
          contractType: r.contractType,
        }));

      c.set('sessionState', {
        userId: authUser.id,
        displayName: userRow?.displayName ?? '',
        phone: userRow?.phone ?? '',
        isOps: userRow?.isOps ?? false,
        workspaces,
      });

      const requested = getCookie(c, WORKSPACE_COOKIE);
      const active =
        (requested ? workspaces.find((w) => w.orgId === requested) : undefined) ??
        (workspaces.length === 1 ? workspaces[0] : undefined);

      if (active) {
        c.set('actor', {
          userId: authUser.id,
          orgId: active.orgId,
          memberId: active.memberId,
          role: active.role,
          territoryId: active.territoryId,
          displayName: userRow?.displayName ?? '',
        });
      }
      // sliding refresh (Mizro pattern): every authenticated request extends
      const fresh = await issueSession(sessionDeps, authUser);
      setSessionCookie(c, fresh.token, fresh.expiresAt);
    }
  }
  await next();
};

export const requireSession = (c: Context): SessionState => {
  const state = c.get('sessionState');
  if (!state) throw new UnauthorizedError();
  return state;
};

export const requireActor = (c: Context): Actor => {
  const actor = c.get('actor');
  if (actor) return actor;
  const state = c.get('sessionState');
  if (!state) throw new UnauthorizedError();
  if (state.workspaces.length === 0) {
    // 🔒 Explicit "no access" — never a blank dashboard (E01-F06).
    throw new ForbiddenError('این حساب به هیچ کسب‌وکاری دسترسی ندارد', { code: 'no_workspace' });
  }
  throw new AradError('workspace_selection_required', 'کسب‌وکار خود را انتخاب کنید', 409, {
    workspaces: state.workspaces.map((w) => ({
      organization_id: w.orgId,
      organization_name: w.orgName,
      role: w.role,
    })),
  });
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
