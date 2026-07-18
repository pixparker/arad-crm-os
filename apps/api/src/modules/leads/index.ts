// Leads module. Founder reqs: import from sheet + manual + seller-introduced;
// 🔒 sellers pick only within their own territory; dedupe blocks duplicate
// phones AND the "two sellers claim the same cafe" race (unique + tx).

import {
  assignLeadBodySchema,
  createLeadBodySchema,
  importLeadsBodySchema,
  importLeadsResponseSchema,
  leadSchema,
} from '@arad-crm/api-contracts';
import { accounts, auditLog, db, leads, orgScope, users } from '@arad-crm/db';
import { normalizeIranianMobile } from '@arad/auth-otp';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@arad/errors';
import { type SQL, and, desc, eq, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { isSeller, requireActor, requireRole, session } from '../../middleware/session.js';

const leadRow = (r: {
  lead: typeof leads.$inferSelect;
  account: typeof accounts.$inferSelect;
  assigneeName: string | null;
}) =>
  leadSchema.parse({
    id: r.lead.id,
    account_id: r.account.id,
    account_name: r.account.name,
    account_phone: r.account.phone,
    region_text: r.account.regionText,
    territory_id: r.account.territoryId,
    status: r.lead.status,
    source: r.lead.source,
    assigned_to: r.lead.assignedTo,
    assigned_to_name: r.assigneeName,
    next_action_type: r.lead.nextActionType,
    next_action_at: r.lead.nextActionAt?.toISOString() ?? null,
    close_reason: r.lead.closeReason,
    requested_features: (r.lead.requestedFeatures as string[] | null) ?? null,
    created_at: r.lead.createdAt.toISOString(),
  });

const findByPhone = async (orgId: string, phone: string) =>
  (
    await db
      .select()
      .from(accounts)
      .where(and(orgScope(accounts.organizationId, orgId), eq(accounts.phone, phone)))
  )[0];

export const leadsRoutes = new Hono()
  .use('*', session())
  // «سرنخ جدید» — manual + seller-introduced (کم‌فیلد اما دقیق)
  .post('/', async (c) => {
    const actor = requireActor(c);
    const body = createLeadBodySchema.parse(await c.req.json());
    const phone = normalizeIranianMobile(body.phone) ?? body.phone.trim();

    const existing = await findByPhone(actor.orgId, phone);
    if (existing) {
      throw new ConflictError('کسب‌وکاری با این شماره از قبل ثبت شده است', {
        existing_account_id: existing.id,
      });
    }
    const sellerIntroduced = isSeller(actor.role);
    return db.transaction(async (tx) => {
      const accountRows = await tx
        .insert(accounts)
        .values({
          organizationId: actor.orgId,
          name: body.business_name,
          phone,
          regionText: body.region_text,
          territoryId: body.territory_id ?? (sellerIntroduced ? actor.territoryId : null),
          ...(body.business_type ? { businessType: body.business_type } : {}),
          ...(body.contact_name ? { contactName: body.contact_name } : {}),
          source: sellerIntroduced ? 'seller' : body.source,
          status: 'in_funnel',
          createdBy: actor.userId,
        })
        .returning();
      const account = accountRows[0];
      if (!account) throw new ValidationError('account insert failed');
      const leadRows = await tx
        .insert(leads)
        .values({
          organizationId: actor.orgId,
          accountId: account.id,
          source: sellerIntroduced ? 'seller' : body.source,
          // seller-introduced leads are theirs from birth 🔒 with a dated first action
          ...(sellerIntroduced
            ? {
                assignedTo: actor.userId,
                status: 'assigned' as const,
                nextActionType: 'visit',
                nextActionAt: new Date(),
              }
            : { status: 'new' as const }),
          createdBy: actor.userId,
        })
        .returning();
      const lead = leadRows[0];
      if (!lead) throw new ValidationError('lead insert failed');
      return c.json(leadRow({ lead, account, assigneeName: null }), 201);
    });
  })
  // sheet/CSV import (founder req #1) — dedupe by normalized phone
  .post('/import', async (c) => {
    const actor = requireRole(c, 'sales_manager', 'owner_admin');
    const body = importLeadsBodySchema.parse(await c.req.json());
    const duplicates: { row_index: number; reason: string; existing_account_id: string }[] = [];
    let imported = 0;

    await db.transaction(async (tx) => {
      const seenPhones = new Map<string, string>();
      for (const [i, row] of body.rows.entries()) {
        const phone = row.phone ? (normalizeIranianMobile(row.phone) ?? row.phone.trim()) : null;
        if (phone) {
          const inBatch = seenPhones.get(phone);
          if (inBatch) {
            duplicates.push({
              row_index: i,
              reason: 'duplicate_in_batch',
              existing_account_id: inBatch,
            });
            continue;
          }
          const existing = (
            await tx
              .select()
              .from(accounts)
              .where(and(orgScope(accounts.organizationId, actor.orgId), eq(accounts.phone, phone)))
          )[0];
          if (existing) {
            duplicates.push({
              row_index: i,
              reason: 'phone_exists',
              existing_account_id: existing.id,
            });
            continue;
          }
        }
        const accountRows = await tx
          .insert(accounts)
          .values({
            organizationId: actor.orgId,
            name: row.business_name,
            phone,
            regionText: row.region_text ?? null,
            addressText: row.address_text ?? null,
            businessType: row.business_type ?? null,
            externalRating: row.external_rating ?? null,
            territoryId: body.default_territory_id ?? null,
            source: body.source,
            status: 'prospect',
            createdBy: actor.userId,
          })
          .returning();
        const account = accountRows[0];
        if (!account) continue;
        if (phone) seenPhones.set(phone, account.id);
        await tx.insert(leads).values({
          organizationId: actor.orgId,
          accountId: account.id,
          source: body.source,
          status: 'new',
          createdBy: actor.userId,
        });
        imported++;
      }
    });
    return c.json(importLeadsResponseSchema.parse({ imported, duplicates }));
  })
  .get('/', async (c) => {
    const actor = requireActor(c);
    const view = c.req.query('view') ?? (isSeller(actor.role) ? 'mine' : 'all');
    const filters: SQL[] = [];
    if (view === 'mine') {
      filters.push(eq(leads.assignedTo, actor.userId));
    } else if (view === 'pickable') {
      // 🔒 territory restriction: unassigned + in MY territory only
      if (!isSeller(actor.role)) throw new ForbiddenError('pickable view is for sellers');
      if (!actor.territoryId) return c.json({ items: [] });
      filters.push(
        isNull(leads.assignedTo),
        eq(leads.status, 'new'),
        eq(accounts.territoryId, actor.territoryId),
      );
    } else if (view === 'unassigned') {
      requireRole(c, 'sales_manager', 'owner_admin');
      filters.push(isNull(leads.assignedTo), eq(leads.status, 'new'));
    } else {
      requireRole(c, 'sales_manager', 'owner_admin', 'finance');
    }
    const rows = await db
      .select({ lead: leads, account: accounts, assigneeName: users.displayName })
      .from(leads)
      .innerJoin(accounts, eq(accounts.id, leads.accountId))
      .leftJoin(users, eq(users.id, leads.assignedTo))
      .where(and(orgScope(leads.organizationId, actor.orgId), ...filters))
      .orderBy(desc(leads.createdAt))
      .limit(200);
    return c.json({ items: rows.map(leadRow) });
  })
  // manager assignment (mock: تخصیص سرنخ)
  .post('/:id/assign', async (c) => {
    const actor = requireRole(c, 'sales_manager', 'owner_admin');
    const body = assignLeadBodySchema.parse(await c.req.json());
    const leadId = c.req.param('id');

    return db.transaction(async (tx) => {
      const row = (
        await tx
          .select({ lead: leads, account: accounts })
          .from(leads)
          .innerJoin(accounts, eq(accounts.id, leads.accountId))
          .where(and(orgScope(leads.organizationId, actor.orgId), eq(leads.id, leadId)))
      )[0];
      if (!row) throw new NotFoundError('lead not found');
      const member = (await tx.select().from(users).where(eq(users.id, body.seller_id)))[0];
      if (!member) throw new NotFoundError('seller not found');
      await tx
        .update(leads)
        .set({
          assignedTo: body.seller_id,
          status: 'assigned',
          nextActionType: row.lead.nextActionType ?? 'visit',
          nextActionAt: row.lead.nextActionAt ?? new Date(),
          updatedAt: new Date(),
        })
        .where(eq(leads.id, leadId));
      await tx.insert(auditLog).values({
        organizationId: actor.orgId,
        actorUserId: actor.userId,
        action: 'lead.assigned',
        entityType: 'lead',
        entityId: leadId,
        after: { seller_id: body.seller_id, override_territory: body.override_territory },
        correlationId: c.get('correlationId'),
      });
      return c.json({ ok: true });
    });
  })
  // 🔒 seller daily pick — own territory only; the unique assignment is the
  // race gate ("ادعای هم‌زمان دو فروشنده")
  .post('/:id/pick', async (c) => {
    const actor = requireActor(c);
    if (!isSeller(actor.role)) throw new ForbiddenError('only sellers pick leads');
    if (!actor.territoryId) throw new ForbiddenError('seller has no territory assigned');
    const leadId = c.req.param('id');

    return db.transaction(async (tx) => {
      const row = (
        await tx
          .select({ lead: leads, account: accounts })
          .from(leads)
          .innerJoin(accounts, eq(accounts.id, leads.accountId))
          .where(and(orgScope(leads.organizationId, actor.orgId), eq(leads.id, leadId)))
      )[0];
      if (!row) throw new NotFoundError('lead not found');
      if (row.account.territoryId !== actor.territoryId) {
        throw new ForbiddenError('این سرنخ خارج از منطقهٔ شماست');
      }
      // atomic claim: only wins if still unassigned
      const claimed = await tx
        .update(leads)
        .set({
          assignedTo: actor.userId,
          status: 'assigned',
          nextActionType: 'visit',
          nextActionAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(leads.id, leadId), isNull(leads.assignedTo)))
        .returning();
      if (claimed.length === 0) {
        throw new ConflictError('این سرنخ همین حالا توسط فروشندهٔ دیگری برداشته شد');
      }
      return c.json({ ok: true });
    });
  });
