// Ops → ops users (ADR-014 §1). A separate screen because it is a separate
// identity axis: granting `support` here gives no access to any tenant
// workspace, and an owner_admin membership grants nothing here.
//
// 🔒 super_admin only. This is the surface that can hand out cross-tenant
// reach, so it is the one place where "any ops role" is not enough.

import { grantOpsRoleBodySchema, opsUserSchema } from '@arad-crm/api-contracts';
import { db, opsUserRoles, users } from '@arad-crm/db';
import { NotFoundError, ValidationError } from '@arad/errors';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { requireOpsRole } from '../../middleware/ops-session.js';
import { writeOpsAudit } from './audit.js';

const rolesFor = async (userIds: string[]) => {
  if (userIds.length === 0) return new Map<string, (typeof opsUserRoles.$inferSelect)['role'][]>();
  const rows = await db
    .select({ userId: opsUserRoles.userId, role: opsUserRoles.role })
    .from(opsUserRoles)
    .where(inArray(opsUserRoles.userId, userIds));
  const byUser = new Map<string, (typeof opsUserRoles.$inferSelect)['role'][]>();
  for (const row of rows) {
    byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), row.role]);
  }
  return byUser;
};

export const opsStaffRoutes = new Hono()
  .get('/', async (c) => {
    requireOpsRole(c);
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.isOps, true))
      .orderBy(desc(users.createdAt));
    const roles = await rolesFor(rows.map((r) => r.id));
    return c.json({
      items: rows.map((u) =>
        opsUserSchema.parse({
          id: u.id,
          phone: u.phone,
          display_name: u.displayName,
          roles: roles.get(u.id) ?? [],
          created_at: u.createdAt.toISOString(),
        }),
      ),
    });
  })

  .post('/grant', async (c) => {
    const actor = requireOpsRole(c);
    const body = grantOpsRoleBodySchema.parse(await c.req.json());

    return db.transaction(async (tx) => {
      const user = (await tx.select().from(users).where(eq(users.id, body.user_id)))[0];
      if (!user) throw new NotFoundError('user not found');
      // Granting any ops role implies the ops axis itself.
      if (!user.isOps) {
        await tx.update(users).set({ isOps: true }).where(eq(users.id, user.id));
      }
      await tx
        .insert(opsUserRoles)
        .values({ userId: user.id, role: body.role, grantedBy: actor.userId })
        .onConflictDoNothing({ target: [opsUserRoles.userId, opsUserRoles.role] });
      await writeOpsAudit(tx, c, actor, {
        action: 'ops.role.granted',
        entityType: 'ops_user',
        entityId: user.id,
        after: { role: body.role },
      });
      return c.json({ ok: true });
    });
  })

  .post('/revoke', async (c) => {
    const actor = requireOpsRole(c);
    const body = grantOpsRoleBodySchema.parse(await c.req.json());

    // 🔒 Lockout guard: the last super_admin cannot revoke their own last
    // grant, or the control plane becomes unreachable without database access.
    if (body.role === 'super_admin') {
      const supers = await db
        .select({ userId: opsUserRoles.userId })
        .from(opsUserRoles)
        .where(eq(opsUserRoles.role, 'super_admin'));
      if (supers.length <= 1) {
        throw new ValidationError('آخرین مدیر ارشد را نمی‌توان حذف کرد');
      }
    }

    return db.transaction(async (tx) => {
      await tx
        .delete(opsUserRoles)
        .where(and(eq(opsUserRoles.userId, body.user_id), eq(opsUserRoles.role, body.role)));
      const remaining = await tx
        .select({ role: opsUserRoles.role })
        .from(opsUserRoles)
        .where(eq(opsUserRoles.userId, body.user_id));
      // No roles left ⇒ no ops axis. Keeps `is_ops` honest rather than leaving
      // a role-less user with a reachable-but-empty control plane.
      if (remaining.length === 0) {
        await tx.update(users).set({ isOps: false }).where(eq(users.id, body.user_id));
      }
      await writeOpsAudit(tx, c, actor, {
        action: 'ops.role.revoked',
        entityType: 'ops_user',
        entityId: body.user_id,
        before: { role: body.role },
        after: { remaining_roles: remaining.map((r) => r.role) },
      });
      return c.json({ ok: true });
    });
  });
