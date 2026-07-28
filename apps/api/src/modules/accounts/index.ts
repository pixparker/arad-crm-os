// Accounts («پرونده‌ها») — the cafes. Detail = header + interaction timeline +
// Mizro read-only mirror + immutable معرِّف claim (mock's account page).
//
// Creation lives here too: the ＋ menu's «مشتری» entry (E01-F07) files a
// business the seller already knows, without inventing a lead for it.

import {
  accountDetailSchema,
  accountListResponseSchema,
  accountLookupResponseSchema,
  attributionClaimSchema,
  createAccountBodySchema,
  linkMizroBusinessBodySchema,
  updateAccountBodySchema,
} from '@arad-crm/api-contracts';
import { accounts, attributionClaims, db, orgScope, users } from '@arad-crm/db';
import { findingsSchema, mergeFindings } from '@arad-crm/vertical-mizro';
import { normalizeIranianMobile } from '@arad/auth-otp';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@arad/errors';
import { type SQL, and, desc, eq, ilike, ne, not, or } from 'drizzle-orm';
import { Hono } from 'hono';
import { writeAudit } from '../../lib/tenant-audit.js';
import { isSeller, requireActor, session } from '../../middleware/session.js';
import { accountTimeline, commitmentsByAccount, lastTouchByAccount } from '../activities/index.js';
import { hasOpenDeal, openDealsByAccount } from '../opportunities/index.js';
import { accountView, assertAccountVisible, canSeeAccount, loadAccount } from './service.js';

export { accountView, assertAccountVisible, canSeeAccount, loadAccount } from './service.js';

const toAccount = accountView;

const findByPhone = async (orgId: string, phone: string) =>
  (
    await db
      .select()
      .from(accounts)
      .where(and(orgScope(accounts.organizationId, orgId), eq(accounts.phone, phone)))
  )[0];

export const accountsRoutes = new Hono()
  .use('*', session())
  .get('/', async (c) => {
    const actor = requireActor(c);
    const q = c.req.query('q');
    // «همه / سرنخ / فرصت / مشتری». A file is a CUSTOMER when a payment made it
    // one 🔒, an OPPORTUNITY while it carries an open deal, and a LEAD otherwise
    // — derived, never a field someone can set to disagree with the money.
    const segment = c.req.query('segment') ?? 'all';
    const filters: SQL[] = [];
    // 🔒 seller visibility: own territory only (managers/owner/finance see org)
    if (isSeller(actor.role)) {
      if (!actor.territoryId) return c.json(accountListResponseSchema.parse({ items: [] }));
      filters.push(eq(accounts.territoryId, actor.territoryId));
    }
    if (q) {
      const search = or(ilike(accounts.name, `%${q}%`), ilike(accounts.phone, `%${q}%`));
      if (search) filters.push(search);
    }

    const openDeal = hasOpenDeal(accounts.id, actor.orgId);
    if (segment === 'customer') filters.push(eq(accounts.status, 'customer'));
    if (segment === 'opportunity') filters.push(openDeal);
    if (segment === 'lead') filters.push(ne(accounts.status, 'customer'), not(openDeal));

    const rows = await db
      .select()
      .from(accounts)
      .where(and(orgScope(accounts.organizationId, actor.orgId), ...filters))
      .orderBy(desc(accounts.updatedAt))
      .limit(100);

    const ids = rows.map((r) => r.id);
    // Three questions the row has to answer, asked once for the whole page
    // instead of once per row: what did I promise, when did anyone last touch
    // it, and how much is open on it.
    const [commitments, touchedAt, openDeals] = await Promise.all([
      commitmentsByAccount(actor.orgId, actor.userId, ids),
      lastTouchByAccount(actor.orgId, ids),
      openDealsByAccount(actor.orgId, ids),
    ]);

    return c.json(
      accountListResponseSchema.parse({
        items: rows.map((row) => {
          const commitment = commitments.get(row.id);
          const open = openDeals.get(row.id);
          return {
            ...toAccount(row),
            next_action_type: commitment?.action_type ?? null,
            next_action_at: commitment?.due_at ?? null,
            last_activity_at: touchedAt.get(row.id) ?? null,
            open_opportunities: open?.count ?? 0,
            open_value_rial: open?.valueRial ?? '0',
          };
        }),
      }),
    );
  })
  // ＋ «مشتری» — a file for a business already known, no lead pipeline involved.
  .post('/', async (c) => {
    const actor = requireActor(c);
    const body = createAccountBodySchema.parse(await c.req.json());
    const phone = body.phone ? (normalizeIranianMobile(body.phone) ?? body.phone.trim()) : null;

    // Same dedupe rule as lead capture — one business, one file. Two sellers
    // filing the same cafe under two names is how attribution turns into an
    // argument nobody can settle from the data.
    if (phone) {
      const existing = await findByPhone(actor.orgId, phone);
      if (existing) {
        throw new ConflictError('کسب‌وکاری با این شماره از قبل ثبت شده است', {
          existing_account_id: existing.id,
          // and whether they can actually open it — the UI needs to choose
          // between "برو به پرونده" and "از مدیر بخواه"
          visible_to_me: await canSeeAccount(actor, existing),
        });
      }
    }

    let attributes: Record<string, unknown> = {};
    if (body.attributes) {
      const parsed = findingsSchema.safeParse(body.attributes);
      if (!parsed.success) {
        throw new ValidationError('invalid vertical attributes', { issues: parsed.error.issues });
      }
      attributes = parsed.data;
    }

    const seller = isSeller(actor.role);
    // 🔒 A seller files into their OWN territory. Accepting a territory_id from
    // a seller would let a file (and the pipeline it feeds) be parked in
    // someone else's patch.
    if (seller && body.territory_id && body.territory_id !== actor.territoryId) {
      throw new ForbiddenError('ثبت پرونده در منطقهٔ دیگر مجاز نیست', { rule: 'own_territory' });
    }

    const rows = await db
      .insert(accounts)
      .values({
        organizationId: actor.orgId,
        name: body.business_name,
        phone,
        regionText: body.region_text ?? null,
        addressText: body.address_text ?? null,
        territoryId: seller ? actor.territoryId : (body.territory_id ?? null),
        ...(body.business_type ? { businessType: body.business_type } : {}),
        ...(body.contact_name ? { contactName: body.contact_name } : {}),
        ...(body.contact_role ? { contactRole: body.contact_role } : {}),
        ...(body.instagram ? { instagram: body.instagram } : {}),
        attributes,
        source: seller ? 'seller' : body.source,
        // 🔒 never 'customer' — that status means a detected payment event and
        // is written by the worker alone (schema.ts accountStatus).
        status: 'in_funnel',
        createdBy: actor.userId,
      })
      .returning();
    const account = rows[0];
    if (!account) throw new ValidationError('account insert failed');
    return c.json(toAccount(account), 201);
  })
  // Duplicate check BEFORE the form is filled (the ＋ sheet's first field).
  // Registered ahead of /:id — Hono matches in registration order.
  .get('/lookup', async (c) => {
    const actor = requireActor(c);
    const rawPhone = c.req.query('phone');
    const name = c.req.query('name');
    if (!rawPhone && !name) throw new ValidationError('phone or name is required');

    let match: typeof accounts.$inferSelect | undefined;
    if (rawPhone) {
      const phone = normalizeIranianMobile(rawPhone) ?? rawPhone.trim();
      match = await findByPhone(actor.orgId, phone);
    }
    if (!match && name) {
      match = (
        await db
          .select()
          .from(accounts)
          .where(and(orgScope(accounts.organizationId, actor.orgId), ilike(accounts.name, name)))
          .limit(1)
      )[0];
    }

    if (!match) {
      return c.json(
        accountLookupResponseSchema.parse({
          found: false,
          visible_to_me: false,
          account_id: null,
          name: null,
          status: null,
          region_text: null,
          message: null,
        }),
      );
    }

    // 🔒 Found but out of reach: say that it is taken, and nothing else. The
    // seller needs to stop typing — not to read another territory's file.
    if (!(await canSeeAccount(actor, match))) {
      return c.json(
        accountLookupResponseSchema.parse({
          found: true,
          visible_to_me: false,
          account_id: null,
          name: null,
          status: null,
          region_text: null,
          message: 'این کسب‌وکار قبلاً ثبت شده و خارج از دسترس شماست — با مدیر فروش هماهنگ کنید',
        }),
      );
    }

    return c.json(
      accountLookupResponseSchema.parse({
        found: true,
        visible_to_me: true,
        account_id: match.id,
        name: match.name,
        status: match.status,
        region_text: match.regionText,
        message: null,
      }),
    );
  })
  .get('/:id', async (c) => {
    const actor = requireActor(c);
    const id = c.req.param('id');
    const account = await loadAccount(actor.orgId, id);
    if (!account) throw new NotFoundError('account not found');
    // 🔒 same rule as the list — an id is not an authorization
    await assertAccountVisible(actor, account);

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

    return c.json(
      accountDetailSchema.parse({
        account: toAccount(account),
        timeline: await accountTimeline(actor.orgId, id),
        // ★ معرِّف — 🔒 immutable attribution
        attribution: claim
          ? attributionClaimSchema.parse({
              seller_id: claim.sellerId,
              seller_name: claim.sellerName,
              first_touch_at: claim.at.toISOString(),
            })
          : null,
      }),
    );
  })
  .patch('/:id', async (c) => {
    const actor = requireActor(c);
    const id = c.req.param('id');
    const body = updateAccountBodySchema.parse(await c.req.json());
    const account = await loadAccount(actor.orgId, id);
    if (!account) throw new NotFoundError('account not found');
    await assertAccountVisible(actor, account);

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
    const account = await loadAccount(actor.orgId, id);
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

    // 🔒 This link decides which account a future payment event lands on, and
    // therefore whose commission it becomes. It is the single most
    // consequential edit a seller can make to a file — audited in the same
    // transaction, with the ref recorded so a later dispute has a fact to read.
    await db.transaction(async (tx) => {
      await tx
        .update(accounts)
        .set({ mizroBusinessRef: ref, updatedAt: new Date() })
        .where(and(orgScope(accounts.organizationId, actor.orgId), eq(accounts.id, id)));
      await writeAudit(tx, c, actor, {
        action: 'account.mizro_linked',
        entityType: 'account',
        entityId: id,
        before: { mizro_business_ref: null },
        after: { mizro_business_ref: ref },
      });
    });
    return c.json({ ok: true });
  });
