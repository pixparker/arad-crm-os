// Ops-axis session middleware (ADR-014 §1). 🔒 This is a DIFFERENT middleware
// against a DIFFERENT surface than `session()`: it resolves ops roles from
// `ops_user_roles` and never looks at `org_members`. A tenant role can never
// reach an ops route, and holding an ops role grants nothing inside a tenant
// workspace. The same person may hold both — visibly, on two rows.

import type { OpsRole } from '@arad-crm/api-contracts';
import { db, opsUserRoles, users } from '@arad-crm/db';
import { verifySession } from '@arad/auth-otp';
import { ForbiddenError, UnauthorizedError } from '@arad/errors';
import { eq } from 'drizzle-orm';
import type { Context, MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { sessionDeps } from '../lib/auth-wiring.js';
import { SESSION_COOKIE } from './session.js';

export interface OpsActor {
  userId: string;
  phone: string;
  displayName: string;
  roles: OpsRole[];
}

declare module 'hono' {
  interface ContextVariableMap {
    opsActor: OpsActor | null;
  }
}

export const opsSession = (): MiddlewareHandler => async (c, next) => {
  c.set('opsActor', null);
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    const authUser = await verifySession(sessionDeps, token);
    if (authUser) {
      const row = (await db.select().from(users).where(eq(users.id, authUser.id)))[0];
      // 🔒 is_ops is the gate; roles refine it. A user whose ops access was
      // revoked loses the surface on the next request, without a re-login.
      if (row?.isOps && row.status === 'active') {
        const roles = await db
          .select({ role: opsUserRoles.role })
          .from(opsUserRoles)
          .where(eq(opsUserRoles.userId, row.id));
        c.set('opsActor', {
          userId: row.id,
          phone: row.phone,
          displayName: row.displayName,
          roles: roles.map((r) => r.role),
        });
      }
    }
  }
  await next();
};

export const requireOpsActor = (c: Context): OpsActor => {
  const actor = c.get('opsActor');
  if (!actor) throw new UnauthorizedError('ops access required');
  return actor;
};

/** Any of `roles` (super_admin always passes — it is the superset by design). */
export const requireOpsRole = (c: Context, ...roles: OpsRole[]): OpsActor => {
  const actor = requireOpsActor(c);
  if (actor.roles.includes('super_admin')) return actor;
  if (!roles.some((r) => actor.roles.includes(r))) {
    throw new ForbiddenError(`ops role ${roles.join('|')} required`, {
      held: actor.roles,
    });
  }
  return actor;
};
