// Ops → businesses (ADR-014 §5). A "business" IS an `organizations` row; the
// ops panel is the only surface that creates one.
//
// Cross-tenant by definition: this file lists and counts across every org, so
// its reads carry the documented escape hatch rather than weakening orgScope().

import {
  businessSchema,
  createBusinessBodySchema,
  createProducerBindingBodySchema,
  producerBindingSchema,
  updateBusinessBodySchema,
} from '@arad-crm/api-contracts';
import { db, orgMembers, organizations, producerBindings } from '@arad-crm/db';
import { ConflictError, NotFoundError, ValidationError } from '@arad/errors';
import { slugifyName, validateSlug } from '@arad/ops-tenant';
import { count, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { requireOpsRole } from '../../middleware/ops-session.js';
import { writeOpsAudit } from './audit.js';

const businessRow = (org: typeof organizations.$inferSelect, memberCount: number) =>
  businessSchema.parse({
    id: org.id,
    name: org.name,
    slug: org.slug,
    status: org.status,
    vertical_key: org.verticalKey,
    member_count: memberCount,
    created_at: org.createdAt.toISOString(),
  });

export const opsBusinessRoutes = new Hono()
  .get('/', async (c) => {
    requireOpsRole(c, 'onboarding_agent', 'support', 'finance');
    // @invariant-allow: orgScope-cross-tenant the ops business directory spans every tenant
    const rows = await db
      .select({
        org: organizations,
        memberCount: count(orgMembers.id),
      })
      .from(organizations)
      .leftJoin(orgMembers, eq(orgMembers.organizationId, organizations.id))
      .groupBy(organizations.id)
      .orderBy(desc(organizations.createdAt))
      .limit(200);
    return c.json({ items: rows.map((r) => businessRow(r.org, r.memberCount)) });
  })

  .post('/', async (c) => {
    const actor = requireOpsRole(c, 'onboarding_agent');
    const body = createBusinessBodySchema.parse(await c.req.json());

    // A Persian business name slugifies to nothing, so ops must supply the
    // slug in that case rather than the api inventing one.
    const slug = (body.slug ?? slugifyName(body.name)).toLowerCase();
    if (!slug) {
      throw new ValidationError('نام لاتین ندارد — شناسهٔ کسب‌وکار (slug) را وارد کنید', {
        field: 'slug',
      });
    }
    const check = validateSlug(slug);
    if (!check.ok) throw new ValidationError(`slug: ${check.reason}`, { code: check.error });

    // @invariant-allow: orgScope-cross-tenant slug uniqueness is platform-wide by definition
    const clash = (
      await db.select().from(organizations).where(eq(organizations.slug, slug)).limit(1)
    )[0];
    if (clash) throw new ConflictError('کسب‌وکاری با این شناسه از قبل ثبت شده است', { slug });

    return db.transaction(async (tx) => {
      const inserted = await tx
        .insert(organizations)
        .values({ name: body.name, slug, verticalKey: body.vertical_key })
        .returning();
      const org = inserted[0];
      if (!org) throw new ValidationError('business insert failed');
      await writeOpsAudit(tx, c, actor, {
        organizationId: org.id,
        action: 'ops.business.created',
        entityType: 'organization',
        entityId: org.id,
        after: { name: org.name, slug: org.slug, vertical_key: org.verticalKey },
      });
      return c.json(businessRow(org, 0), 201);
    });
  })

  // 🔒 E01-F10 — which tenant a producer's events belong to. Until a binding
  // exists the worker falls back to "the only organization", which stops being
  // correct the moment a second business is registered here.
  //
  // Declared BEFORE `/:id`: Hono matches in registration order, so a literal
  // path registered after a param route would be swallowed by it.
  .get('/producer-bindings', async (c) => {
    requireOpsRole(c, 'onboarding_agent', 'support', 'finance');
    // @invariant-allow: orgScope-cross-tenant the binding table maps producers ACROSS tenants
    const rows = await db
      .select({ binding: producerBindings, organizationName: organizations.name })
      .from(producerBindings)
      .innerJoin(organizations, eq(organizations.id, producerBindings.organizationId))
      .orderBy(producerBindings.producer);
    return c.json({
      items: rows.map((r) =>
        producerBindingSchema.parse({
          id: r.binding.id,
          producer: r.binding.producer,
          external_ref: r.binding.externalRef,
          organization_id: r.binding.organizationId,
          organization_name: r.organizationName,
          label: r.binding.label,
          created_at: r.binding.createdAt.toISOString(),
        }),
      ),
    });
  })

  .post('/producer-bindings', async (c) => {
    const actor = requireOpsRole(c, 'onboarding_agent');
    const body = createProducerBindingBodySchema.parse(await c.req.json());
    // @invariant-allow: orgScope-cross-tenant ops binds a producer INTO a named tenant
    const org = (
      await db.select().from(organizations).where(eq(organizations.id, body.organization_id))
    )[0];
    if (!org) throw new NotFoundError('business not found');

    return db.transaction(async (tx) => {
      const inserted = await tx
        .insert(producerBindings)
        .values({
          producer: body.producer,
          externalRef: body.external_ref,
          organizationId: body.organization_id,
          label: body.label,
          createdBy: actor.userId,
        })
        .onConflictDoUpdate({
          target: [producerBindings.producer, producerBindings.externalRef],
          set: { organizationId: body.organization_id, label: body.label },
        })
        .returning();
      const binding = inserted[0];
      if (!binding) throw new ValidationError('producer binding insert failed');
      await writeOpsAudit(tx, c, actor, {
        organizationId: body.organization_id,
        action: 'ops.producer_binding.set',
        entityType: 'producer_binding',
        entityId: binding.id,
        after: { producer: binding.producer, external_ref: binding.externalRef },
      });
      return c.json(
        producerBindingSchema.parse({
          id: binding.id,
          producer: binding.producer,
          external_ref: binding.externalRef,
          organization_id: binding.organizationId,
          organization_name: org.name,
          label: binding.label,
          created_at: binding.createdAt.toISOString(),
        }),
        201,
      );
    });
  })

  .get('/:id', async (c) => {
    requireOpsRole(c, 'onboarding_agent', 'support', 'finance');
    const id = c.req.param('id');
    // @invariant-allow: orgScope-cross-tenant ops reads any tenant by id
    const org = (await db.select().from(organizations).where(eq(organizations.id, id)))[0];
    if (!org) throw new NotFoundError('business not found');
    // @invariant-allow: orgScope-cross-tenant member count for the ops detail screen
    const members = await db
      .select({ n: count(orgMembers.id) })
      .from(orgMembers)
      .where(eq(orgMembers.organizationId, id));
    return c.json(businessRow(org, members[0]?.n ?? 0));
  })

  .patch('/:id', async (c) => {
    const actor = requireOpsRole(c, 'onboarding_agent');
    const id = c.req.param('id');
    const body = updateBusinessBodySchema.parse(await c.req.json());

    return db.transaction(async (tx) => {
      // @invariant-allow: orgScope-cross-tenant ops mutates any tenant by id
      const before = (await tx.select().from(organizations).where(eq(organizations.id, id)))[0];
      if (!before) throw new NotFoundError('business not found');
      const updated = await tx
        .update(organizations)
        .set({
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.status !== undefined ? { status: body.status } : {}),
        })
        .where(eq(organizations.id, id))
        .returning();
      const org = updated[0];
      if (!org) throw new NotFoundError('business not found');
      await writeOpsAudit(tx, c, actor, {
        organizationId: org.id,
        action: 'ops.business.updated',
        entityType: 'organization',
        entityId: org.id,
        before: { name: before.name, status: before.status },
        after: { name: org.name, status: org.status },
      });
      return c.json(businessRow(org, 0));
    });
  });
