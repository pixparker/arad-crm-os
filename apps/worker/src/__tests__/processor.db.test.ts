// End-to-end money path 🔒 (ADR-006/007): payment.received → attribution →
// won opportunity → commission ledger; replay-idempotent; refund → clawback.
// Runs against real Postgres (CI service container / dev compose).

import { sellerTotals } from '@arad-crm/commission';
import {
  accounts,
  attributionClaims,
  attributionLinks,
  closePool,
  commissionEntries,
  commissionPlanVersions,
  commissionPlans,
  db,
  integrationEventsInbox,
  opportunities,
  orgMembers,
  orgScope,
  organizations,
  territories,
  users,
} from '@arad-crm/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { processInboxRow } from '../processor.js';

const runId = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
let orgId: string;
let sellerId: string;
const TOKEN = `tok-${runId}`;
const BIZ_REF = `biz-${runId}`;

const envelope = (over: Record<string, unknown>) => ({
  id: crypto.randomUUID(),
  version: 1,
  occurred_at: new Date().toISOString(),
  producer: 'mizro',
  ...over,
});

const insertInbox = async (env: Record<string, unknown>) => {
  const rows = await db
    .insert(integrationEventsInbox)
    .values({
      producer: 'mizro',
      eventId: env.id as string,
      type: env.type as string,
      version: 1,
      payload: env,
    })
    .returning();
  const row = rows[0];
  if (!row) throw new Error('inbox insert failed');
  return row;
};

beforeAll(async () => {
  const org = (
    await db
      .insert(organizations)
      .values({ name: 'تست', slug: `t-${runId}` })
      .returning()
  )[0];
  if (!org) throw new Error('org');
  orgId = org.id;
  const territory = (
    await db
      .insert(territories)
      .values({ organizationId: orgId, name: 'تهران', kind: 'city' })
      .returning()
  )[0];
  const seller = (
    await db
      .insert(users)
      .values({ phone: `+98912${runId.slice(-7)}`, displayName: 'رضا', status: 'active' })
      .returning()
  )[0];
  if (!seller || !territory) throw new Error('seed');
  sellerId = seller.id;
  await db.insert(orgMembers).values({
    organizationId: orgId,
    userId: sellerId,
    role: 'visitor_seller',
    territoryId: territory.id,
  });
  await db.insert(attributionLinks).values({ organizationId: orgId, sellerId, token: TOKEN });
  const plan = (
    await db
      .insert(commissionPlans)
      .values({ organizationId: orgId, name: 'پلن تست', active: 1 })
      .returning()
  )[0];
  if (!plan) throw new Error('plan');
  await db.insert(commissionPlanVersions).values({
    organizationId: orgId,
    planId: plan.id,
    versionNo: 1,
    rules: { rules: [{ type: 'percent_of_net', percent_bp: 1500 }] },
    effectiveFrom: new Date('2020-01-01T00:00:00Z'),
  });
});

afterAll(async () => {
  await closePool();
});

describe('inbox money path', () => {
  const paymentId = `pay-${runId}`;
  let paymentEventId: string;

  it('payment.received → claim + won opportunity + 15% commission entry', async () => {
    const env = envelope({
      type: 'payment.received',
      payload: {
        payment_id: paymentId,
        business_ref: BIZ_REF,
        amount_rial: '15000000',
        net_amount_rial: '13500000',
        currency: 'IRR',
        method: 'zarinpal',
        paid_at: new Date().toISOString(),
        attribution_ref: TOKEN,
      },
    });
    paymentEventId = env.id as string;
    const row = await insertInbox(env);
    await processInboxRow(db, row, orgId);

    const processed = (
      await db.select().from(integrationEventsInbox).where(eq(integrationEventsInbox.id, row.id))
    )[0];
    expect(processed?.status).toBe('processed');
    expect(processed?.error).toBeNull();

    const entries = await db
      .select()
      .from(commissionEntries)
      .where(
        and(
          orgScope(commissionEntries.organizationId, orgId),
          eq(commissionEntries.sourceEventId, paymentEventId),
        ),
      );
    expect(entries).toHaveLength(1);
    expect(entries[0]?.amountRial).toBe(2_025_000n); // 15% of 13,500,000
    expect(entries[0]?.beneficiaryUserId).toBe(sellerId);
    expect(entries[0]?.status).toBe('earned');
    expect((entries[0]?.basis as { netAmountRial: string }).netAmountRial).toBe('13500000');

    const testOrgId = orgId;
    const claim = (
      await db
        .select()
        .from(attributionClaims)
        .where(orgScope(attributionClaims.organizationId, testOrgId))
    ).find((cl) => cl.sellerId === sellerId);
    expect(claim).toBeDefined();

    const opp = (
      await db
        .select()
        .from(opportunities)
        .where(
          and(orgScope(opportunities.organizationId, testOrgId), eq(opportunities.status, 'won')),
        )
    ).find((o) => o.ownerId === sellerId);
    expect(opp?.wonVia).toBe('auto_from_payment');

    const account = (
      await db
        .select()
        .from(accounts)
        .where(
          and(orgScope(accounts.organizationId, testOrgId), eq(accounts.mizroBusinessRef, BIZ_REF)),
        )
    )[0];
    expect(account?.status).toBe('customer');
    expect(account?.totalPaidRial).toBe(15_000_000n);
  });

  it('🔒 replay of the same event credits exactly once', async () => {
    const row = (
      await db
        .select()
        .from(integrationEventsInbox)
        .where(eq(integrationEventsInbox.eventId, paymentEventId))
    )[0];
    if (!row) throw new Error('row missing');
    await processInboxRow(db, row, orgId); // replay
    const entries = await db
      .select()
      .from(commissionEntries)
      .where(
        and(
          orgScope(commissionEntries.organizationId, orgId),
          eq(commissionEntries.sourceEventId, paymentEventId),
        ),
      );
    expect(entries).toHaveLength(1); // still one — wasDeduped path
  });

  it('🔒 payment.refunded → clawback reversal, totals net out', async () => {
    const env = envelope({
      type: 'payment.refunded',
      payload: {
        payment_id: paymentId,
        business_ref: BIZ_REF,
        amount_rial: '15000000',
        refunded_at: new Date().toISOString(),
        reason: 'early_cancel',
      },
    });
    const row = await insertInbox(env);
    await processInboxRow(db, row, orgId);

    const all = await db
      .select()
      .from(commissionEntries)
      .where(
        and(
          orgScope(commissionEntries.organizationId, orgId),
          eq(commissionEntries.paymentRef, paymentId),
        ),
      );
    expect(all).toHaveLength(2);
    const reversal = all.find((e) => e.entryType === 'reversal');
    const earn = all.find((e) => e.entryType === 'earn');
    expect(reversal?.amountRial).toBe(-2_025_000n);
    expect(reversal?.reversesEntryId).toBe(earn?.id);
    expect(earn?.status).toBe('reversed');

    const totals = sellerTotals(all);
    expect(totals.earnedTotal).toBe(0n); // net of clawback
    expect(totals.reversed).toBe(-2_025_000n);

    // replay refund → no double reversal
    await processInboxRow(db, row, orgId);
    const after = await db
      .select()
      .from(commissionEntries)
      .where(
        and(
          orgScope(commissionEntries.organizationId, orgId),
          eq(commissionEntries.paymentRef, paymentId),
        ),
      );
    expect(after).toHaveLength(2);
  });

  it('payment without attribution → processed with no_attribution note, no money', async () => {
    const env = envelope({
      type: 'payment.received',
      payload: {
        payment_id: `pay2-${runId}`,
        business_ref: `biz2-${runId}`,
        amount_rial: '1000000',
        net_amount_rial: '900000',
        currency: 'IRR',
        method: 'card_to_card',
        paid_at: new Date().toISOString(),
      },
    });
    const row = await insertInbox(env);
    await processInboxRow(db, row, orgId);
    const processed = (
      await db.select().from(integrationEventsInbox).where(eq(integrationEventsInbox.id, row.id))
    )[0];
    expect(processed?.status).toBe('processed');
    expect(processed?.error).toBe('no_attribution');
    const entries = await db
      .select()
      .from(commissionEntries)
      .where(
        and(
          orgScope(commissionEntries.organizationId, orgId),
          eq(commissionEntries.sourceEventId, env.id as string),
        ),
      );
    expect(entries).toHaveLength(0);
  });
});
