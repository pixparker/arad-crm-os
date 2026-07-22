// Inbox processor (ADR-006/007) — the core-loop money path 🔒:
//   payment.received → resolve attribution → mark opportunity WON → append
//   commission entries (idempotent) → mirror account state.
// Every handler is idempotent: the inbox unique + the commission ledger unique
// mean a replayed event can never double anything.

import {
  appendEarnEntries,
  computeEntries,
  planRulesSchema,
  reverseForPayment,
} from '@arad-crm/commission';
import {
  type Db,
  accounts,
  activities,
  attributionClaims,
  attributionLinks,
  commissionPlanVersions,
  commissionPlans,
  db as defaultDb,
  integrationEventsInbox,
  leads,
  opportunities,
  orgScope,
  organizations,
} from '@arad-crm/db';
import { logger } from '@arad/logger';
import { type ParsedEvent, parseEvent, parseRial } from '@arad/platform-events';
import { and, asc, desc, eq, inArray, isNotNull, isNull, lte, sql } from 'drizzle-orm';

const MAX_ATTEMPTS = 5;

// Pilot: single-org deployment — producer→org mapping is the multi-tenant seam.
const pilotOrgId = async (db: Db): Promise<string> => {
  // @invariant-allow: orgScope-cross-tenant resolving THE pilot org (integration boundary, pre-org context)
  const org = (await db.select().from(organizations).limit(1))[0];
  if (!org) throw new Error('no organization — run pnpm db:seed');
  return org.id;
};

const findOrCreateAccountByRef = async (
  db: Db,
  orgId: string,
  businessRef: string,
): Promise<typeof accounts.$inferSelect> => {
  const existing = (
    await db
      .select()
      .from(accounts)
      .where(
        and(orgScope(accounts.organizationId, orgId), eq(accounts.mizroBusinessRef, businessRef)),
      )
  )[0];
  if (existing) return existing;
  const rows = await db
    .insert(accounts)
    .values({
      organizationId: orgId,
      name: businessRef,
      source: 'mizro_event',
      status: 'prospect',
      mizroBusinessRef: businessRef,
    })
    .onConflictDoNothing({ target: [accounts.organizationId, accounts.mizroBusinessRef] })
    .returning();
  const created =
    rows[0] ??
    (
      await db
        .select()
        .from(accounts)
        .where(
          and(orgScope(accounts.organizationId, orgId), eq(accounts.mizroBusinessRef, businessRef)),
        )
    )[0];
  if (!created) throw new Error(`account upsert failed for ${businessRef}`);
  return created;
};

/** The settled claim's seller for an account (also re-read after an insert so a
 *  concurrent first-touch wins deterministically), or null. */
const claimedSeller = async (db: Db, orgId: string, accountId: string): Promise<string | null> => {
  const claim = (
    await db
      .select({ sellerId: attributionClaims.sellerId })
      .from(attributionClaims)
      .where(
        and(
          orgScope(attributionClaims.organizationId, orgId),
          eq(attributionClaims.accountId, accountId),
        ),
      )
  )[0];
  return claim?.sellerId ?? null;
};

/** The seller who worked this account in the CRM: opportunity owner → lead
 *  assignee → account creator. The attribution fallback for businesses that
 *  never carried a demo-link ref (e.g. onboarded manually in Mizro ops) — a
 *  bare, un-worked account (no opp/lead/creator) resolves to null. */
const resolveAccountOwner = async (
  db: Db,
  orgId: string,
  accountId: string,
): Promise<string | null> => {
  const opp = (
    await db
      .select({ ownerId: opportunities.ownerId })
      .from(opportunities)
      .where(
        and(orgScope(opportunities.organizationId, orgId), eq(opportunities.accountId, accountId)),
      )
      .orderBy(desc(opportunities.createdAt))
      .limit(1)
  )[0];
  if (opp?.ownerId) return opp.ownerId;
  const lead = (
    await db
      .select({ assignedTo: leads.assignedTo })
      .from(leads)
      .where(
        and(
          orgScope(leads.organizationId, orgId),
          eq(leads.accountId, accountId),
          isNotNull(leads.assignedTo),
        ),
      )
      .orderBy(desc(leads.createdAt))
      .limit(1)
  )[0];
  if (lead?.assignedTo) return lead.assignedTo;
  const account = (
    await db
      .select({ createdBy: accounts.createdBy })
      .from(accounts)
      .where(and(orgScope(accounts.organizationId, orgId), eq(accounts.id, accountId)))
  )[0];
  return account?.createdBy ?? null;
};

/** Resolve (or first-touch-create 🔒) the attributed seller for an account.
 *  Priority: existing claim → demo-link ref → the seller who worked it in the
 *  CRM. Every path lands an append-only, immutable first-touch claim. */
const resolveSeller = async (
  db: Db,
  orgId: string,
  accountId: string,
  attributionRef: string | undefined,
  touchedAt: Date,
): Promise<string | null> => {
  // 1) an existing claim is immutable first-touch — always wins
  const existing = await claimedSeller(db, orgId, accountId);
  if (existing) return existing;

  // 2) demo-link ref → first-touch claim from the seller's link
  if (attributionRef) {
    const link = (
      await db
        .select()
        .from(attributionLinks)
        .where(
          and(
            orgScope(attributionLinks.organizationId, orgId),
            eq(attributionLinks.token, attributionRef),
          ),
        )
    )[0];
    if (link) {
      await db
        .insert(attributionClaims)
        .values({
          organizationId: orgId,
          accountId,
          sellerId: link.sellerId,
          linkId: link.id,
          source: 'event',
          firstTouchAt: touchedAt,
        })
        .onConflictDoNothing({
          target: [attributionClaims.organizationId, attributionClaims.accountId],
        });
      return claimedSeller(db, orgId, accountId);
    }
  }

  // 3) no usable ref (e.g. a business onboarded manually in Mizro ops) → credit
  //    the seller who actually worked it. Still append-only + auditable.
  const ownerId = await resolveAccountOwner(db, orgId, accountId);
  if (!ownerId) return null;
  await db
    .insert(attributionClaims)
    .values({
      organizationId: orgId,
      accountId,
      sellerId: ownerId,
      source: 'manual_first_touch',
      firstTouchAt: touchedAt,
    })
    .onConflictDoNothing({
      target: [attributionClaims.organizationId, attributionClaims.accountId],
    });
  return claimedSeller(db, orgId, accountId);
};

const activePlanVersion = async (db: Db, orgId: string, at: Date) => {
  const rows = await db
    .select({ version: commissionPlanVersions })
    .from(commissionPlanVersions)
    .innerJoin(commissionPlans, eq(commissionPlans.id, commissionPlanVersions.planId))
    .where(
      and(
        orgScope(commissionPlanVersions.organizationId, orgId),
        eq(commissionPlans.active, 1),
        lte(commissionPlanVersions.effectiveFrom, at),
      ),
    )
    .orderBy(sql`${commissionPlanVersions.effectiveFrom} desc`)
    .limit(1);
  return rows[0]?.version ?? null;
};

const systemActivity = async (
  db: Db,
  orgId: string,
  accountId: string,
  note: string,
  occurredAt: Date,
): Promise<void> => {
  await db.insert(activities).values({
    organizationId: orgId,
    accountId,
    kind: 'system',
    note,
    occurredAt,
  });
};

// ─── handlers ───────────────────────────────────────────────────────────────

const handlePaymentReceived = async (
  db: Db,
  orgId: string,
  parsed: Extract<ParsedEvent, { key: 'payment.received@v1' }>,
): Promise<string | null> => {
  const p = parsed.payload;
  const paidAt = new Date(p.paid_at);
  const account = await findOrCreateAccountByRef(db, orgId, p.business_ref);
  const attributionRef = p.attribution_ref ?? parsed.envelope.meta?.attribution_ref;
  const sellerId = await resolveSeller(db, orgId, account.id, attributionRef, paidAt);

  // mirror product state on the account file (mock: «وضعیت در میزرو»)
  await db
    .update(accounts)
    .set({
      totalPaidRial: sql`${accounts.totalPaidRial} + ${p.amount_rial}::bigint`,
      status: 'customer',
      ...(p.package_ref ? { mizroPlan: p.package_ref } : {}),
      updatedAt: new Date(),
    })
    .where(and(orgScope(accounts.organizationId, orgId), eq(accounts.id, account.id)));

  if (!sellerId) {
    await systemActivity(
      db,
      orgId,
      account.id,
      `پرداخت بدون اسناد فروشنده — ${p.payment_id}`,
      paidAt,
    );
    return 'no_attribution';
  }

  // 🔒 sale = payment event: mark the open opportunity won (or record auto-won)
  const openOpp = (
    await db
      .select()
      .from(opportunities)
      .where(
        and(
          orgScope(opportunities.organizationId, orgId),
          eq(opportunities.accountId, account.id),
          eq(opportunities.status, 'open'),
        ),
      )
  )[0];
  let oppId: string;
  if (openOpp) {
    await db
      .update(opportunities)
      .set({ status: 'won', wonAt: paidAt, wonVia: 'payment_event', updatedAt: new Date() })
      .where(and(orgScope(opportunities.organizationId, orgId), eq(opportunities.id, openOpp.id)));
    oppId = openOpp.id;
  } else {
    const rows = await db
      .insert(opportunities)
      .values({
        organizationId: orgId,
        accountId: account.id,
        ownerId: sellerId,
        stage: 'awaiting_payment',
        status: 'won',
        wonAt: paidAt,
        wonVia: 'auto_from_payment',
      })
      .returning();
    const created = rows[0];
    if (!created) throw new Error('auto-won opportunity insert failed');
    oppId = created.id;
  }
  // close the loop on any open lead for this account
  await db
    .update(leads)
    .set({ status: 'qualified', updatedAt: new Date() })
    .where(
      and(
        orgScope(leads.organizationId, orgId),
        eq(leads.accountId, account.id),
        inArray(leads.status, ['new', 'assigned', 'in_progress']),
      ),
    );

  const planVersion = await activePlanVersion(db, orgId, paidAt);
  if (!planVersion) throw new Error('no active commission plan version — seed one');
  const rules = planRulesSchema.parse(planVersion.rules);
  const drafts = computeEntries(rules, {
    sourceEventId: parsed.envelope.id,
    organizationId: orgId,
    trigger: p.subscription_ref ? 'renewal' : 'new_payment',
    netAmountRial: parseRial(p.net_amount_rial),
    beneficiaries: { closer: sellerId, visitor: sellerId, referrer: sellerId },
  });
  const result = await appendEarnEntries(db, {
    organizationId: orgId,
    sourceEventId: parsed.envelope.id,
    paymentRef: p.payment_id,
    drafts,
    planVersionId: planVersion.id,
    accountId: account.id,
    opportunityId: oppId,
  });
  const total = drafts.reduce((s, d) => s + d.amountRial, 0n);
  await systemActivity(
    db,
    orgId,
    account.id,
    `پرداخت ${p.amount_rial} ریال دریافت شد → کمیسیون ${total} ریال ثبت شد (${result.dedupedCount > 0 ? 'تکراری' : 'جدید'})`,
    paidAt,
  );
  return null;
};

const handlePaymentRefunded = async (
  db: Db,
  orgId: string,
  parsed: Extract<ParsedEvent, { key: 'payment.refunded@v1' }>,
): Promise<string | null> => {
  const p = parsed.payload;
  await reverseForPayment(db, {
    organizationId: orgId,
    refundEventId: parsed.envelope.id,
    paymentRef: p.payment_id,
    reason: p.reason ?? 'refund',
  });
  const account = (
    await db
      .select()
      .from(accounts)
      .where(
        and(
          orgScope(accounts.organizationId, orgId),
          eq(accounts.mizroBusinessRef, p.business_ref),
        ),
      )
  )[0];
  if (account) {
    await db
      .update(accounts)
      .set({
        totalPaidRial: sql`${accounts.totalPaidRial} - ${p.amount_rial}::bigint`,
        updatedAt: new Date(),
      })
      .where(and(orgScope(accounts.organizationId, orgId), eq(accounts.id, account.id)));
    await systemActivity(
      db,
      orgId,
      account.id,
      `برگشت وجه ${p.amount_rial} ریال — کلاوبک کمیسیون ثبت شد`,
      new Date(p.refunded_at),
    );
  }
  return null;
};

const handleBusinessCreated = async (
  db: Db,
  orgId: string,
  parsed: Extract<ParsedEvent, { key: 'business.created@v1' }>,
): Promise<string | null> => {
  const p = parsed.payload;
  const account = await findOrCreateAccountByRef(db, orgId, p.business_ref);
  await db
    .update(accounts)
    .set({
      ...(p.name && account.name === p.business_ref ? { name: p.name } : {}),
      ...(p.business_type ? { businessType: p.business_type } : {}),
      updatedAt: new Date(),
    })
    .where(and(orgScope(accounts.organizationId, orgId), eq(accounts.id, account.id)));
  const ref = p.attribution_ref ?? parsed.envelope.meta?.attribution_ref;
  await resolveSeller(db, orgId, account.id, ref, new Date());
  return null;
};

const handleSubscription = async (
  db: Db,
  orgId: string,
  parsed: ParsedEvent,
): Promise<string | null> => {
  const p = parsed.payload as {
    business_ref: string;
    package_ref?: string;
    ends_at?: string;
  };
  const statusByType: Record<string, string> = {
    'subscription.created': 'created',
    'subscription.activated': 'active',
    'subscription.renewed': 'active',
    'subscription.upgraded': 'active',
    'subscription.cancelled': 'cancelled',
    'subscription.expiring': 'expiring',
  };
  const account = await findOrCreateAccountByRef(db, orgId, p.business_ref);
  await db
    .update(accounts)
    .set({
      mizroSubscriptionStatus: statusByType[parsed.envelope.type] ?? parsed.envelope.type,
      ...(p.package_ref ? { mizroPlan: p.package_ref } : {}),
      ...(p.ends_at ? { mizroSubscriptionEndsAt: new Date(p.ends_at) } : {}),
      updatedAt: new Date(),
    })
    .where(and(orgScope(accounts.organizationId, orgId), eq(accounts.id, account.id)));
  return null;
};

const handleLeadCaptured = async (
  db: Db,
  orgId: string,
  parsed: Extract<ParsedEvent, { key: 'lead.captured@v1' }>,
): Promise<string | null> => {
  const p = parsed.payload;
  let account = p.phone
    ? (
        await db
          .select()
          .from(accounts)
          .where(and(orgScope(accounts.organizationId, orgId), eq(accounts.phone, p.phone)))
      )[0]
    : undefined;
  if (!account) {
    const rows = await db
      .insert(accounts)
      .values({
        organizationId: orgId,
        name: p.business_name ?? p.lead_ref,
        phone: p.phone ?? null,
        businessType: p.business_type ?? null,
        source: p.source,
        status: 'prospect',
      })
      .onConflictDoNothing({ target: [accounts.organizationId, accounts.phone] })
      .returning();
    account =
      rows[0] ??
      (p.phone
        ? (
            await db
              .select()
              .from(accounts)
              .where(and(orgScope(accounts.organizationId, orgId), eq(accounts.phone, p.phone)))
          )[0]
        : undefined);
  }
  if (!account) return 'lead_account_unresolved';
  const openLead = (
    await db
      .select()
      .from(leads)
      .where(
        and(
          orgScope(leads.organizationId, orgId),
          eq(leads.accountId, account.id),
          inArray(leads.status, ['new', 'assigned', 'in_progress']),
        ),
      )
  )[0];
  if (!openLead) {
    await db.insert(leads).values({
      organizationId: orgId,
      accountId: account.id,
      source: p.source,
      status: 'new',
      requestedFeatures: p.requested_features ?? null,
    });
  }
  return null;
};

// ─── dispatcher + sweep ─────────────────────────────────────────────────────

export const processInboxRow = async (
  db: Db,
  row: typeof integrationEventsInbox.$inferSelect,
  explicitOrgId?: string,
): Promise<void> => {
  const orgId = explicitOrgId ?? (await pilotOrgId(db));
  let softError: string | null = null;
  try {
    const parsed = parseEvent(row.payload);
    switch (parsed.key) {
      case 'payment.received@v1':
        softError = await handlePaymentReceived(db, orgId, parsed);
        break;
      case 'payment.refunded@v1':
        softError = await handlePaymentRefunded(db, orgId, parsed);
        break;
      case 'business.created@v1':
        softError = await handleBusinessCreated(db, orgId, parsed);
        break;
      case 'subscription.created@v1':
      case 'subscription.activated@v1':
      case 'subscription.renewed@v1':
      case 'subscription.upgraded@v1':
      case 'subscription.cancelled@v1':
      case 'subscription.expiring@v1':
        softError = await handleSubscription(db, orgId, parsed);
        break;
      case 'lead.captured@v1':
        softError = await handleLeadCaptured(db, orgId, parsed);
        break;
      case 'menu.published@v1':
      case 'onboarding.completed@v1': {
        const p = parsed.payload as { business_ref: string };
        const account = await findOrCreateAccountByRef(db, orgId, p.business_ref);
        await systemActivity(
          db,
          orgId,
          account.id,
          parsed.envelope.type === 'menu.published' ? 'منو منتشر شد' : 'استقرار تکمیل شد',
          new Date(parsed.envelope.occurred_at),
        );
        break;
      }
    }
    await db
      .update(integrationEventsInbox)
      .set({ status: 'processed', processedAt: new Date(), error: softError })
      .where(eq(integrationEventsInbox.id, row.id));
  } catch (err) {
    const attempts = row.attempts + 1;
    logger.error({ err, eventId: row.eventId, attempts }, 'inbox processing failed');
    await db
      .update(integrationEventsInbox)
      .set({
        status: attempts >= MAX_ATTEMPTS ? 'dead' : 'failed',
        attempts,
        error: err instanceof Error ? err.message : String(err),
      })
      .where(eq(integrationEventsInbox.id, row.id));
  }
};

/** Sweep pending + retryable failed rows, oldest first (worker repeatable). */
export const sweepInbox = async (db: Db = defaultDb, limit = 20): Promise<number> => {
  const rows = await db
    .select()
    .from(integrationEventsInbox)
    .where(
      and(
        inArray(integrationEventsInbox.status, ['pending', 'failed']),
        isNull(integrationEventsInbox.processedAt),
      ),
    )
    .orderBy(asc(integrationEventsInbox.receivedAt))
    .limit(limit);
  for (const row of rows) {
    await processInboxRow(db, row);
  }
  return rows.length;
};
