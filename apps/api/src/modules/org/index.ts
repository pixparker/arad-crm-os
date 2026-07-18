// Org module: territories + team management (ADR-005 roles; founder req:
// part/full-time contracts, per-seller territory 🔒).

import {
  createMemberBodySchema,
  createTerritoryBodySchema,
  teamMemberSchema,
  territorySchema,
} from '@arad-crm/api-contracts';
import { auditLog, db, orgMembers, orgScope, territories, users } from '@arad-crm/db';
import { normalizeIranianMobile } from '@arad/auth-otp';
import { ConflictError, ValidationError } from '@arad/errors';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { requireActor, requireRole, session } from '../../middleware/session.js';

export const orgRoutes = new Hono()
  .use('*', session())
  .get('/territories', async (c) => {
    const actor = requireActor(c);
    const rows = await db
      .select()
      .from(territories)
      .where(orgScope(territories.organizationId, actor.orgId));
    return c.json({
      items: rows.map((t) => territorySchema.parse({ id: t.id, name: t.name, kind: t.kind })),
    });
  })
  .post('/territories', async (c) => {
    const actor = requireRole(c, 'sales_manager', 'owner_admin');
    const body = createTerritoryBodySchema.parse(await c.req.json());
    const rows = await db
      .insert(territories)
      .values({ organizationId: actor.orgId, name: body.name, kind: body.kind })
      .returning();
    const t = rows[0];
    if (!t) throw new ValidationError('territory insert failed');
    return c.json(territorySchema.parse({ id: t.id, name: t.name, kind: t.kind }), 201);
  })
  .get('/team', async (c) => {
    const actor = requireRole(c, 'sales_manager', 'owner_admin', 'finance');
    const rows = await db
      .select({
        userId: users.id,
        displayName: users.displayName,
        phone: users.phone,
        status: users.status,
        role: orgMembers.role,
        contractType: orgMembers.contractType,
        territoryId: orgMembers.territoryId,
        territoryName: territories.name,
      })
      .from(orgMembers)
      .innerJoin(users, eq(users.id, orgMembers.userId))
      .leftJoin(territories, eq(territories.id, orgMembers.territoryId))
      .where(orgScope(orgMembers.organizationId, actor.orgId));
    return c.json({
      items: rows.map((r) =>
        teamMemberSchema.parse({
          user_id: r.userId,
          display_name: r.displayName,
          phone: r.phone,
          role: r.role,
          contract_type: r.contractType,
          territory_id: r.territoryId,
          territory_name: r.territoryName ?? null,
          status: r.status,
        }),
      ),
    });
  })
  .post('/team', async (c) => {
    const actor = requireRole(c, 'sales_manager', 'owner_admin');
    const body = createMemberBodySchema.parse(await c.req.json());
    const phone = normalizeIranianMobile(body.phone);
    if (!phone) throw new ValidationError('invalid Iranian mobile');

    return db.transaction(async (tx) => {
      const existingUser = (await tx.select().from(users).where(eq(users.phone, phone)))[0];
      const user =
        existingUser ??
        (
          await tx
            .insert(users)
            .values({ phone, displayName: body.display_name, status: 'invited' })
            .returning()
        )[0];
      if (!user) throw new ValidationError('user create failed');
      if (existingUser && !existingUser.displayName) {
        await tx.update(users).set({ displayName: body.display_name }).where(eq(users.id, user.id));
      }
      const existingMember = (
        await tx
          .select()
          .from(orgMembers)
          .where(
            and(orgScope(orgMembers.organizationId, actor.orgId), eq(orgMembers.userId, user.id)),
          )
      )[0];
      if (existingMember) throw new ConflictError('این شماره از قبل عضو تیم است');
      await tx.insert(orgMembers).values({
        organizationId: actor.orgId,
        userId: user.id,
        role: body.role,
        contractType: body.contract_type,
        ...(body.territory_id ? { territoryId: body.territory_id } : {}),
      });
      await tx.insert(auditLog).values({
        organizationId: actor.orgId,
        actorUserId: actor.userId,
        action: 'team.member_added',
        entityType: 'user',
        entityId: user.id,
        after: { role: body.role, contract_type: body.contract_type },
        correlationId: c.get('correlationId'),
      });
      return c.json({ ok: true, user_id: user.id }, 201);
    });
  });
