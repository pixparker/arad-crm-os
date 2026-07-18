// Commission module (ADR-007). 🔒 Sellers see their OWN ledger with the
// calculation formula (basis) per row; manager approves within authority;
// finance marks paid. All mutation goes through the store's transition().

import {
  approveEntryBodySchema,
  commissionEntrySchema,
  myCommissionResponseSchema,
} from '@arad-crm/api-contracts';
import { sellerTotals, transitionEntry } from '@arad-crm/commission';
import { accounts, commissionEntries, db, orgScope } from '@arad-crm/db';
import { and, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { requireActor, requireRole, session } from '../../middleware/session.js';

const toEntry = (e: typeof commissionEntries.$inferSelect, accountName: string | null) =>
  commissionEntrySchema.parse({
    id: e.id,
    created_at: e.createdAt.toISOString(),
    account_id: e.accountId,
    account_name: accountName,
    entry_type: e.entryType,
    amount_rial: e.amountRial.toString(),
    status: e.status,
    basis: (e.basis as Record<string, unknown>) ?? {},
    payment_ref: e.paymentRef,
    reason: e.reason,
  });

export const commissionRoutes = new Hono()
  .use('*', session())
  // «کمیسیون من» — دفتر فقط‌افزودنی
  .get('/my', async (c) => {
    const actor = requireActor(c);
    const rows = await db
      .select({ entry: commissionEntries, accountName: accounts.name })
      .from(commissionEntries)
      .leftJoin(accounts, eq(accounts.id, commissionEntries.accountId))
      .where(
        and(
          orgScope(commissionEntries.organizationId, actor.orgId),
          eq(commissionEntries.beneficiaryUserId, actor.userId),
        ),
      )
      .orderBy(desc(commissionEntries.createdAt))
      .limit(200);
    const totals = sellerTotals(rows.map((r) => r.entry));
    return c.json(
      myCommissionResponseSchema.parse({
        totals: {
          earned_total_rial: totals.earnedTotal.toString(),
          paid_rial: totals.paid.toString(),
          pending_rial: totals.pending.toString(),
          reversed_rial: totals.reversed.toString(),
        },
        entries: rows.map((r) => toEntry(r.entry, r.accountName)),
      }),
    );
  })
  // manager/finance ledger view
  .get('/entries', async (c) => {
    const actor = requireRole(c, 'sales_manager', 'owner_admin', 'finance');
    const rows = await db
      .select({ entry: commissionEntries, accountName: accounts.name })
      .from(commissionEntries)
      .leftJoin(accounts, eq(accounts.id, commissionEntries.accountId))
      .where(orgScope(commissionEntries.organizationId, actor.orgId))
      .orderBy(desc(commissionEntries.createdAt))
      .limit(500);
    return c.json({ items: rows.map((r) => toEntry(r.entry, r.accountName)) });
  })
  .post('/entries/:id/approve', async (c) => {
    const actor = requireRole(c, 'sales_manager', 'owner_admin');
    const body = approveEntryBodySchema.parse(await c.req.json().catch(() => ({})));
    const entry = await transitionEntry(db, {
      organizationId: actor.orgId,
      entryId: c.req.param('id'),
      to: 'approved',
      actorUserId: actor.userId,
      ...(body.reason ? { reason: body.reason } : {}),
    });
    return c.json({ ok: true, status: entry.status });
  })
  .post('/entries/:id/mark-paid', async (c) => {
    const actor = requireRole(c, 'finance', 'owner_admin');
    const entry = await transitionEntry(db, {
      organizationId: actor.orgId,
      entryId: c.req.param('id'),
      to: 'paid',
      actorUserId: actor.userId,
      reason: 'settlement',
    });
    return c.json({ ok: true, status: entry.status });
  });
