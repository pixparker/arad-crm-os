// Ops → users & membership (ADR-014 §5). Users are created by phone and
// assigned to one or more businesses with a tenant role — `org_members`
// already carries unique(organization_id, user_id), so multi-business
// membership needed no schema change, only this surface and login-time
// workspace resolution (E01-F06).
//
// 🔒 Registration stays invite-only: this is the ONLY path that creates a
// user, and it is behind the ops axis. The tenant login flow never creates
// accounts (see auth-wiring's registrationGate).

import {
  assignMembershipBodySchema,
  createUserBodySchema,
  platformUserSchema,
  updateUserBodySchema,
} from '@arad-crm/api-contracts';
import { db, orgMembers, organizations, territories, users } from '@arad-crm/db';
import { normalizeIranianMobile } from '@arad/auth-otp';
import { ConflictError, NotFoundError, ValidationError } from '@arad/errors';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { requireOpsRole } from '../../middleware/ops-session.js';
import { writeOpsAudit } from './audit.js';

type UserRow = typeof users.$inferSelect;

interface MembershipRow {
  organizationId: string;
  organizationName: string;
  role: (typeof orgMembers.$inferSelect)['role'];
  territoryId: string | null;
  createdAt: Date;
}

const userRow = (user: UserRow, memberships: MembershipRow[]) =>
  platformUserSchema.parse({
    id: user.id,
    phone: user.phone,
    display_name: user.displayName,
    status: user.status,
    is_ops: user.isOps,
    memberships: memberships.map((m) => ({
      organization_id: m.organizationId,
      organization_name: m.organizationName,
      role: m.role,
      territory_id: m.territoryId,
      created_at: m.createdAt.toISOString(),
    })),
    last_login_at: user.lastLoginAt?.toISOString() ?? null,
    created_at: user.createdAt.toISOString(),
  });

// @invariant-allow: orgScope-cross-tenant a user's memberships span tenants by definition
const membershipsFor = async (userIds: string[]): Promise<Map<string, MembershipRow[]>> => {
  if (userIds.length === 0) return new Map();
  const rows = await db
    .select({
      userId: orgMembers.userId,
      organizationId: orgMembers.organizationId,
      organizationName: organizations.name,
      role: orgMembers.role,
      territoryId: orgMembers.territoryId,
      createdAt: orgMembers.createdAt,
    })
    .from(orgMembers)
    .innerJoin(organizations, eq(organizations.id, orgMembers.organizationId))
    .where(inArray(orgMembers.userId, userIds));
  const byUser = new Map<string, MembershipRow[]>();
  for (const row of rows) {
    const list = byUser.get(row.userId) ?? [];
    list.push(row);
    byUser.set(row.userId, list);
  }
  return byUser;
};

export const opsUserRoutes = new Hono()
  .get('/', async (c) => {
    requireOpsRole(c, 'onboarding_agent', 'support', 'finance');
    const orgFilter = c.req.query('organization_id');
    let rows: UserRow[];
    if (orgFilter) {
      // @invariant-allow: orgScope-cross-tenant ops filters the directory BY tenant, from the query
      const scoped = await db
        .select({ user: users })
        .from(users)
        .innerJoin(orgMembers, eq(orgMembers.userId, users.id))
        .where(eq(orgMembers.organizationId, orgFilter))
        .orderBy(desc(users.createdAt))
        .limit(200);
      rows = scoped.map((r) => r.user);
    } else {
      rows = await db.select().from(users).orderBy(desc(users.createdAt)).limit(200);
    }
    const memberships = await membershipsFor(rows.map((r) => r.id));
    return c.json({ items: rows.map((r) => userRow(r, memberships.get(r.id) ?? [])) });
  })

  .post('/', async (c) => {
    const actor = requireOpsRole(c, 'onboarding_agent', 'support');
    const body = createUserBodySchema.parse(await c.req.json());
    const phone = normalizeIranianMobile(body.phone);
    if (!phone) throw new ValidationError('شمارهٔ موبایل معتبر نیست (۰۹xxxxxxxxx)');

    const existing = (await db.select().from(users).where(eq(users.phone, phone)))[0];
    if (existing) {
      throw new ConflictError('کاربری با این شماره از قبل وجود دارد', { user_id: existing.id });
    }

    return db.transaction(async (tx) => {
      const inserted = await tx
        .insert(users)
        // 'invited' until the first successful OTP verify flips it to active.
        .values({ phone, displayName: body.display_name, status: 'invited' })
        .returning();
      const user = inserted[0];
      if (!user) throw new ValidationError('user insert failed');
      await writeOpsAudit(tx, c, actor, {
        action: 'ops.user.created',
        entityType: 'user',
        entityId: user.id,
        after: { phone: user.phone, display_name: user.displayName },
      });
      return c.json(userRow(user, []), 201);
    });
  })

  .get('/:id', async (c) => {
    requireOpsRole(c, 'onboarding_agent', 'support', 'finance');
    const id = c.req.param('id');
    const user = (await db.select().from(users).where(eq(users.id, id)))[0];
    if (!user) throw new NotFoundError('user not found');
    const memberships = await membershipsFor([id]);
    return c.json(userRow(user, memberships.get(id) ?? []));
  })

  .patch('/:id', async (c) => {
    const actor = requireOpsRole(c, 'onboarding_agent', 'support');
    const id = c.req.param('id');
    const body = updateUserBodySchema.parse(await c.req.json());

    // Same read-after-write discipline as the membership route below: mutate
    // in the transaction, read the response once it has committed.
    const user = await db.transaction(async (tx) => {
      const before = (await tx.select().from(users).where(eq(users.id, id)))[0];
      if (!before) throw new NotFoundError('user not found');
      const updated = await tx
        .update(users)
        .set({
          ...(body.display_name !== undefined ? { displayName: body.display_name } : {}),
          ...(body.status !== undefined ? { status: body.status } : {}),
          // Disabling a user must end their live sessions, not just block the
          // next login — @arad/auth-otp rejects a token whose sessionVersion
          // no longer matches the row.
          ...(body.status === 'disabled' ? { sessionVersion: before.sessionVersion + 1 } : {}),
        })
        .where(eq(users.id, id))
        .returning();
      const row = updated[0];
      if (!row) throw new NotFoundError('user not found');
      await writeOpsAudit(tx, c, actor, {
        action: 'ops.user.updated',
        entityType: 'user',
        entityId: row.id,
        before: { display_name: before.displayName, status: before.status },
        after: { display_name: row.displayName, status: row.status },
      });
      return row;
    });

    const memberships = await membershipsFor([id]);
    return c.json(userRow(user, memberships.get(id) ?? []));
  })

  // Assign to a business — the demo's «assign user to business» step. Idempotent
  // on (org, user): re-assigning updates the role rather than erroring.
  .post('/:id/memberships', async (c) => {
    const actor = requireOpsRole(c, 'onboarding_agent');
    const userId = c.req.param('id');
    const body = assignMembershipBodySchema.parse(await c.req.json());

    const user = (await db.select().from(users).where(eq(users.id, userId)))[0];
    if (!user) throw new NotFoundError('user not found');
    // @invariant-allow: orgScope-cross-tenant ops assigns INTO a tenant it is not a member of
    const org = (
      await db.select().from(organizations).where(eq(organizations.id, body.organization_id))
    )[0];
    if (!org) throw new NotFoundError('business not found');

    if (body.territory_id) {
      // A territory from another business would silently break the seller's
      // pick scope, so it is validated against THIS org.
      // @invariant-allow: orgScope-cross-tenant validating the territory belongs to the target org
      const territory = (
        await db
          .select()
          .from(territories)
          .where(
            and(
              eq(territories.id, body.territory_id),
              eq(territories.organizationId, body.organization_id),
            ),
          )
      )[0];
      if (!territory) throw new ValidationError('منطقه متعلق به این کسب‌وکار نیست');
    }

    // The write runs in its own transaction; the response is read AFTER it
    // commits. Reading through `db` inside the tx would miss the row that tx
    // just wrote (a different connection), and the caller would be told the
    // assignment did not happen.
    const wasUpdate = await db.transaction(async (tx) => {
      // @invariant-allow: orgScope-cross-tenant ops membership write into the named tenant
      const existing = (
        await tx
          .select()
          .from(orgMembers)
          .where(
            and(eq(orgMembers.organizationId, body.organization_id), eq(orgMembers.userId, userId)),
          )
      )[0];
      if (existing) {
        await tx
          .update(orgMembers)
          .set({
            role: body.role,
            territoryId: body.territory_id ?? existing.territoryId,
            contractType: body.contract_type,
          })
          .where(eq(orgMembers.id, existing.id));
      } else {
        await tx.insert(orgMembers).values({
          organizationId: body.organization_id,
          userId,
          role: body.role,
          territoryId: body.territory_id ?? null,
          contractType: body.contract_type,
        });
      }
      await writeOpsAudit(tx, c, actor, {
        organizationId: body.organization_id,
        action: existing ? 'ops.membership.updated' : 'ops.membership.created',
        entityType: 'org_member',
        entityId: userId,
        before: existing ? { role: existing.role, territory_id: existing.territoryId } : null,
        after: { role: body.role, territory_id: body.territory_id ?? null },
      });
      return Boolean(existing);
    });

    const memberships = await membershipsFor([userId]);
    return c.json(userRow(user, memberships.get(userId) ?? []), wasUpdate ? 200 : 201);
  })

  .delete('/:id/memberships/:organizationId', async (c) => {
    const actor = requireOpsRole(c, 'onboarding_agent');
    const userId = c.req.param('id');
    const organizationId = c.req.param('organizationId');

    return db.transaction(async (tx) => {
      // @invariant-allow: orgScope-cross-tenant ops removes a membership from the named tenant
      const existing = (
        await tx
          .select()
          .from(orgMembers)
          .where(and(eq(orgMembers.organizationId, organizationId), eq(orgMembers.userId, userId)))
      )[0];
      if (!existing) throw new NotFoundError('membership not found');
      await tx.delete(orgMembers).where(eq(orgMembers.id, existing.id));
      await writeOpsAudit(tx, c, actor, {
        organizationId,
        action: 'ops.membership.removed',
        entityType: 'org_member',
        entityId: userId,
        before: { role: existing.role, territory_id: existing.territoryId },
      });
      return c.json({ ok: true });
    });
  });
