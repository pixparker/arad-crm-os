// Account visibility + projection — the shared half of the accounts module,
// consumed by the lead and opportunity detail routes through `index.ts`.
//
// 🔒 THE RULE, in one place. `GET /v1/accounts` has always restricted a seller
// to their own territory, but the detail read did not: an id guessed, pasted or
// received in a 409 body opened any file in the business, including another
// seller's. The list's rule and the detail's rule were never meant to differ.
//
// Territory is not the whole rule, though. A manager can assign a lead across
// territories on purpose (`override_territory`), and a seller keeps deals they
// own after a territory reshuffle — in both cases the assignment IS the grant,
// so it is checked before refusing.

import { type Account, accountSchema } from '@arad-crm/api-contracts';
import { accounts, db, leads, opportunities, orgScope } from '@arad-crm/db';
import { ForbiddenError } from '@arad/errors';
import { and, eq } from 'drizzle-orm';
import { type Actor, isSeller } from '../../middleware/session.js';

export const accountView = (a: typeof accounts.$inferSelect): Account =>
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

/** May this actor read this account file? Managers/owner/finance: the whole org. */
export const canSeeAccount = async (
  actor: Actor,
  account: { id: string; territoryId: string | null },
): Promise<boolean> => {
  if (!isSeller(actor.role)) return true;
  if (actor.territoryId && account.territoryId === actor.territoryId) return true;

  const assignedLead = (
    await db
      .select({ id: leads.id })
      .from(leads)
      .where(
        and(
          orgScope(leads.organizationId, actor.orgId),
          eq(leads.accountId, account.id),
          eq(leads.assignedTo, actor.userId),
        ),
      )
      .limit(1)
  )[0];
  if (assignedLead) return true;

  const ownedOpp = (
    await db
      .select({ id: opportunities.id })
      .from(opportunities)
      .where(
        and(
          orgScope(opportunities.organizationId, actor.orgId),
          eq(opportunities.accountId, account.id),
          eq(opportunities.ownerId, actor.userId),
        ),
      )
      .limit(1)
  )[0];
  return Boolean(ownedOpp);
};

export const assertAccountVisible = async (
  actor: Actor,
  account: { id: string; territoryId: string | null },
): Promise<void> => {
  if (!(await canSeeAccount(actor, account))) {
    throw new ForbiddenError('این پرونده خارج از دسترس شماست', { rule: 'account_visibility' });
  }
};

export const loadAccount = async (
  orgId: string,
  accountId: string,
): Promise<typeof accounts.$inferSelect | undefined> =>
  (
    await db
      .select()
      .from(accounts)
      .where(and(orgScope(accounts.organizationId, orgId), eq(accounts.id, accountId)))
  )[0];
