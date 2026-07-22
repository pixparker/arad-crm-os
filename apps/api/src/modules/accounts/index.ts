// Accounts («پرونده‌ها») — the cafes. Detail = header + interaction timeline +
// Mizro read-only mirror + immutable معرِّف claim (mock's account page).

import {
  accountSchema,
  activitySchema,
  linkMizroBusinessBodySchema,
  updateAccountBodySchema,
} from '@arad-crm/api-contracts';
import { accounts, activities, attributionClaims, db, orgScope, users } from '@arad-crm/db';
import { findingsSchema, mergeFindings } from '@arad-crm/vertical-mizro';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@arad/errors';
import { type SQL, and, desc, eq, ilike, ne, or } from 'drizzle-orm';
import { Hono } from 'hono';
import { isSeller, requireActor, session } from '../../middleware/session.js';

const toAccount = (a: typeof accounts.$inferSelect) =>
  accountSchema.parse({
    id: a.id,
    name: a.name,
    business_type: a.businessType,
    phone: a.phone,
    contact_name: a.contactName,
    contact_role: a.contactRole,
    instagram: a.instagram,
    address_text: a.addressText,
    region_text: a.regionText,
    territory_id: a.territoryId,
    source: a.source,
    external_rating: a.externalRating,
    status: a.status,
    attributes: (a.attributes as Record<string, unknown>) ?? {},
    mizro: {
      business_ref: a.mizroBusinessRef,
      plan: a.mizroPlan,
      subscription_status: a.mizroSubscriptionStatus,
      subscription_ends_at: a.mizroSubscriptionEndsAt?.toISOString() ?? null,
      total_paid_rial: a.totalPaidRial.toString(),
    },
    created_at: a.createdAt.toISOString(),
  });

export const accountsRoutes = new Hono()
  .use('*', session())
  .get('/', async (c) => {
    const actor = requireActor(c);
    const q = c.req.query('q');
    const filters: SQL[] = [];
    // 🔒 seller visibility: own territory only (managers/owner/finance see org)
    if (isSeller(actor.role)) {
      if (!actor.territoryId) return c.json({ items: [] });
      filters.push(eq(accounts.territoryId, actor.territoryId));
    }
    if (q) {
      const search = or(ilike(accounts.name, `%${q}%`), ilike(accounts.phone, `%${q}%`));
      if (search) filters.push(search);
    }
    const rows = await db
      .select()
      .from(accounts)
      .where(and(orgScope(accounts.organizationId, actor.orgId), ...filters))
      .orderBy(desc(accounts.updatedAt))
      .limit(100);
    return c.json({ items: rows.map(toAccount) });
  })
  .get('/:id', async (c) => {
    const actor = requireActor(c);
    const id = c.req.param('id');
    const account = (
      await db
        .select()
        .from(accounts)
        .where(and(orgScope(accounts.organizationId, actor.orgId), eq(accounts.id, id)))
    )[0];
    if (!account) throw new NotFoundError('account not found');

    const timeline = await db
      .select({ activity: activities, sellerName: users.displayName })
      .from(activities)
      .leftJoin(users, eq(users.id, activities.sellerId))
      .where(and(orgScope(activities.organizationId, actor.orgId), eq(activities.accountId, id)))
      .orderBy(desc(activities.occurredAt))
      .limit(50);

    const claim = (
      await db
        .select({
          sellerId: attributionClaims.sellerId,
          sellerName: users.displayName,
          at: attributionClaims.firstTouchAt,
        })
        .from(attributionClaims)
        .innerJoin(users, eq(users.id, attributionClaims.sellerId))
        .where(
          and(
            orgScope(attributionClaims.organizationId, actor.orgId),
            eq(attributionClaims.accountId, id),
          ),
        )
    )[0];

    return c.json({
      account: toAccount(account),
      timeline: timeline.map((t) =>
        activitySchema.parse({
          id: t.activity.id,
          account_id: t.activity.accountId,
          kind: t.activity.kind,
          outcome: t.activity.outcome,
          note: t.activity.note,
          findings: (t.activity.findings as Record<string, unknown> | null) ?? null,
          next_action_type: t.activity.nextActionType,
          next_action_at: t.activity.nextActionAt?.toISOString() ?? null,
          seller_id: t.activity.sellerId,
          seller_name: t.sellerName ?? null,
          occurred_at: t.activity.occurredAt.toISOString(),
        }),
      ),
      // ★ معرِّف — 🔒 immutable attribution
      attribution: claim
        ? {
            seller_id: claim.sellerId,
            seller_name: claim.sellerName,
            first_touch_at: claim.at.toISOString(),
          }
        : null,
    });
  })
  .patch('/:id', async (c) => {
    const actor = requireActor(c);
    const id = c.req.param('id');
    const body = updateAccountBodySchema.parse(await c.req.json());
    const account = (
      await db
        .select()
        .from(accounts)
        .where(and(orgScope(accounts.organizationId, actor.orgId), eq(accounts.id, id)))
    )[0];
    if (!account) throw new NotFoundError('account not found');

    let attributes = account.attributes as Record<string, unknown>;
    if (body.attributes) {
      const parsed = findingsSchema.safeParse(body.attributes);
      if (!parsed.success) {
        throw new ValidationError('invalid vertical attributes', { issues: parsed.error.issues });
      }
      attributes = mergeFindings(attributes, parsed.data);
    }
    await db
      .update(accounts)
      .set({
        ...(body.contact_name !== undefined ? { contactName: body.contact_name } : {}),
        ...(body.contact_role !== undefined ? { contactRole: body.contact_role } : {}),
        ...(body.instagram !== undefined ? { instagram: body.instagram } : {}),
        ...(body.address_text !== undefined ? { addressText: body.address_text } : {}),
        attributes,
        updatedAt: new Date(),
      })
      .where(and(orgScope(accounts.organizationId, actor.orgId), eq(accounts.id, id)));
    return c.json({ ok: true });
  })
  // Link this account to its Mizro business id 🔒 — the attribution bridge for
  // manually-onboarded businesses: once set, payment events for that business
  // match THIS seller-worked account (accounts.mizroBusinessRef) instead of
  // minting a bare one, so commission reaches the seller (resolved in the worker).
  .post('/:id/mizro-link', async (c) => {
    const actor = requireActor(c);
    const id = c.req.param('id');
    const body = linkMizroBusinessBodySchema.parse(await c.req.json());
    const account = (
      await db
        .select()
        .from(accounts)
        .where(and(orgScope(accounts.organizationId, actor.orgId), eq(accounts.id, id)))
    )[0];
    if (!account) throw new NotFoundError('account not found');
    // 🔒 a seller may only link an account inside their own territory (mirrors visibility)
    if (isSeller(actor.role) && account.territoryId !== actor.territoryId) {
      throw new ForbiddenError('این پرونده خارج از منطقهٔ شماست');
    }

    const ref = body.mizro_business_ref;
    if (account.mizroBusinessRef === ref) return c.json({ ok: true }); // idempotent
    if (account.mizroBusinessRef) {
      throw new ConflictError('این پرونده قبلاً به کسب‌وکار دیگری در میزرو متصل است');
    }
    // that business id is already claimed by another account (e.g. a bare account
    // minted by an earlier payment) — that needs a manual merge, not a silent relink
    const taken = (
      await db
        .select({ id: accounts.id })
        .from(accounts)
        .where(
          and(
            orgScope(accounts.organizationId, actor.orgId),
            eq(accounts.mizroBusinessRef, ref),
            ne(accounts.id, id),
          ),
        )
    )[0];
    if (taken) {
      throw new ConflictError('این کسب‌وکار میزرو قبلاً به پروندهٔ دیگری متصل شده است', {
        conflicting_account_id: taken.id,
      });
    }

    await db
      .update(accounts)
      .set({ mizroBusinessRef: ref, updatedAt: new Date() })
      .where(and(orgScope(accounts.organizationId, actor.orgId), eq(accounts.id, id)));
    return c.json({ ok: true });
  });
