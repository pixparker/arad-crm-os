// Core-loop invariants over real HTTP + real Postgres:
// 🔒 territory-restricted pick + double-pick race, import dedupe,
// mandatory next-action, findings→account file, sale-is-a-payment-event.

import { accounts, closePool, db, leads, orgScope } from '@arad-crm/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { type World, makeMember, runId, seedWorld } from './helpers.js';

const app = createApp();
let world: World;
let manager: { userId: string; cookie: string };
let sellerA: { userId: string; cookie: string }; // territory A
let sellerA2: { userId: string; cookie: string }; // territory A (race partner)
let sellerB: { userId: string; cookie: string }; // territory B

const post = (path: string, cookie: string, body: unknown) =>
  app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });

beforeAll(async () => {
  world = await seedWorld();
  manager = await makeMember(world, 'sales_manager');
  sellerA = await makeMember(world, 'visitor_seller', world.territoryA);
  sellerA2 = await makeMember(world, 'visitor_seller', world.territoryA);
  sellerB = await makeMember(world, 'visitor_seller', world.territoryB);
});

afterAll(async () => {
  await closePool();
});

describe('lead import (founder req #1: sheet)', () => {
  it('imports rows, reports duplicates by normalized phone', async () => {
    const res = await post('/v1/leads/import', manager.cookie, {
      source: 'csv_import',
      default_territory_id: world.territoryA,
      rows: [
        { business_name: 'کافه آرام', phone: `0912000${runId.slice(-4)}`, region_text: 'ونک' },
        { business_name: 'کافه ماه', phone: `0912111${runId.slice(-4)}`, region_text: 'سعادت‌آباد' },
        // same phone as row 0 → duplicate
        { business_name: 'کافه آرام ۲', phone: `0912000${runId.slice(-4)}`, region_text: 'ونک' },
        { business_name: 'رستوران البرز', region_text: 'عظیمیه' }, // no phone → ok
      ],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { imported: number; duplicates: { reason: string }[] };
    expect(body.imported).toBe(3);
    expect(body.duplicates).toHaveLength(1);
    expect(body.duplicates[0]?.reason).toBe('duplicate_in_batch');
  });

  it('sellers only see pickable leads in THEIR territory 🔒', async () => {
    const resA = await app.request('/v1/leads?view=pickable', {
      headers: { cookie: sellerA.cookie },
    });
    const listA = (await resA.json()) as { items: { account_name: string }[] };
    expect(listA.items.length).toBeGreaterThanOrEqual(3);

    const resB = await app.request('/v1/leads?view=pickable', {
      headers: { cookie: sellerB.cookie },
    });
    const listB = (await resB.json()) as { items: unknown[] };
    expect(listB.items).toHaveLength(0); // nothing in territory B
  });
});

describe('daily pick 🔒 (founder req #2)', () => {
  let leadId: string;

  it('seller picks an in-territory lead; the race loser gets 409', async () => {
    const res = await app.request('/v1/leads?view=pickable', {
      headers: { cookie: sellerA.cookie },
    });
    const list = (await res.json()) as { items: { id: string }[] };
    const first = list.items[0];
    if (!first) throw new Error('no pickable lead');
    leadId = first.id;

    const pick1 = await post(`/v1/leads/${leadId}/pick`, sellerA.cookie, {});
    expect(pick1.status).toBe(200);

    // «ادعای هم‌زمان دو فروشنده» — second seller loses atomically
    const pick2 = await post(`/v1/leads/${leadId}/pick`, sellerA2.cookie, {});
    expect(pick2.status).toBe(409);
  });

  it('out-of-territory pick is forbidden 🔒', async () => {
    const res = await app.request('/v1/leads?view=pickable', {
      headers: { cookie: sellerA.cookie },
    });
    const list = (await res.json()) as { items: { id: string }[] };
    const target = list.items[0];
    if (!target) return; // all picked — covered above
    const pick = await post(`/v1/leads/${target.id}/pick`, sellerB.cookie, {});
    expect(pick.status).toBe(403);
  });

  it('seller-introduced lead is theirs from birth (founder req #2b)', async () => {
    const res = await post('/v1/leads', sellerA.cookie, {
      business_name: 'کافه معرفی‌شده',
      phone: `0912222${runId.slice(-4)}`,
      region_text: 'جردن',
    });
    expect(res.status).toBe(201);
    const lead = (await res.json()) as { id: string; assigned_to: string | null; status: string };
    expect(lead.assigned_to).toBe(sellerA.userId);
    expect(lead.status).toBe('assigned');

    // duplicate phone → 409 with pointer to existing account
    const dup = await post('/v1/leads', sellerA.cookie, {
      business_name: 'کافه تکراری',
      phone: `0912222${runId.slice(-4)}`,
      region_text: 'جردن',
    });
    expect(dup.status).toBe(409);
  });

  it("«امروز من» lists the picked lead as today's due action", async () => {
    const res = await app.request('/v1/activities/today', { headers: { cookie: sellerA.cookie } });
    expect(res.status).toBe(200);
    const today = (await res.json()) as { due_actions: { lead_id: string | null }[] };
    expect(today.due_actions.some((d) => d.lead_id === leadId)).toBe(true);
  });
});

describe('visit recording 🔒 (founder req #3)', () => {
  let accountId: string;
  let leadId: string;

  beforeAll(async () => {
    const row = (
      await db
        .select({ lead: leads, account: accounts })
        .from(leads)
        .innerJoin(accounts, eq(accounts.id, leads.accountId))
        .where(
          and(orgScope(leads.organizationId, world.orgId), eq(leads.assignedTo, sellerA.userId)),
        )
    )[0];
    if (!row) throw new Error('no assigned lead');
    accountId = row.account.id;
    leadId = row.lead.id;
  });

  it('rejects a visit with no next action (mandatory 🔒) and suggests one', async () => {
    const res = await post('/v1/activities', sellerA.cookie, {
      account_id: accountId,
      lead_id: leadId,
      kind: 'visit',
      outcome: 'interested',
      note: 'صاحب کافه علاقه‌مند بود',
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { meta: { rule: string; suggested: unknown } };
    expect(body.meta.rule).toBe('next_action_required');
    expect(body.meta.suggested).toBeTruthy();
  });

  it('records visit + findings; findings land on the account file (luxury → vip)', async () => {
    const res = await post('/v1/activities', sellerA.cookie, {
      account_id: accountId,
      lead_id: leadId,
      kind: 'visit',
      outcome: 'interested',
      note: 'کافه لوکس است — پیشنهاد VIP',
      findings: { segment: 'luxury', offer_hint: 'vip', current_menu: 'paper' },
      next_action_type: 'send_demo',
      next_action_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    });
    expect(res.status).toBe(201);

    const account = (
      await db
        .select()
        .from(accounts)
        .where(and(orgScope(accounts.organizationId, world.orgId), eq(accounts.id, accountId)))
    )[0];
    const attrs = account?.attributes as Record<string, unknown>;
    expect(attrs.segment).toBe('luxury');
    expect(attrs.offer_hint).toBe('vip');
    expect(account?.status).toBe('in_funnel');
  });

  it('rejects junk findings (vertical schema validates 🔒)', async () => {
    const res = await post('/v1/activities', sellerA.cookie, {
      account_id: accountId,
      kind: 'note',
      findings: { segment: 'nonsense-value' },
    });
    expect(res.status).toBe(400);
  });
});

describe('sale = payment event 🔒 (founder req #4)', () => {
  it('manual won is rejected with the rule named', async () => {
    const createRes = await post('/v1/opportunities', sellerA.cookie, {
      account_id: (
        await db.select().from(accounts).where(orgScope(accounts.organizationId, world.orgId))
      )[0]?.id,
      stage: 'demo_sent',
    });
    expect(createRes.status).toBe(201);
    const opp = (await createRes.json()) as { id: string };

    const wonRes = await app.request(`/v1/opportunities/${opp.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: sellerA.cookie },
      body: JSON.stringify({ status: 'won' }),
    });
    expect(wonRes.status).toBe(403);
    const body = (await wonRes.json()) as { meta: { rule: string } };
    expect(body.meta.rule).toBe('sale_is_a_payment_event');

    // lost without a standard reason also rejected
    const lostRes = await app.request(`/v1/opportunities/${opp.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: sellerA.cookie },
      body: JSON.stringify({ status: 'lost' }),
    });
    expect(lostRes.status).toBe(400);
  });
});

describe('mizro business link (attribution bridge for manual onboarding)', () => {
  let accountId: string;
  const ref = `mizrobiz-${runId}`;

  it('seller links their account to a Mizro business id (idempotent)', async () => {
    const introduce = await post('/v1/leads', sellerA.cookie, {
      business_name: 'کافه اتصال',
      phone: `0912333${runId.slice(-4)}`,
      region_text: 'ولنجک',
    });
    expect(introduce.status).toBe(201);
    accountId = ((await introduce.json()) as { account_id: string }).account_id;

    const link = await post(`/v1/accounts/${accountId}/mizro-link`, sellerA.cookie, {
      mizro_business_ref: ref,
    });
    expect(link.status).toBe(200);

    const detail = await app.request(`/v1/accounts/${accountId}`, {
      headers: { cookie: sellerA.cookie },
    });
    const body = (await detail.json()) as { account: { mizro: { business_ref: string | null } } };
    expect(body.account.mizro.business_ref).toBe(ref);

    // re-linking to the same ref is a no-op, not a conflict
    const again = await post(`/v1/accounts/${accountId}/mizro-link`, sellerA.cookie, {
      mizro_business_ref: ref,
    });
    expect(again.status).toBe(200);
  });

  it('🔒 rejects a business id already tied to another account (409)', async () => {
    const introduce = await post('/v1/leads', sellerA.cookie, {
      business_name: 'کافه دوم',
      phone: `0912444${runId.slice(-4)}`,
      region_text: 'ولنجک',
    });
    const other = ((await introduce.json()) as { account_id: string }).account_id;
    const conflict = await post(`/v1/accounts/${other}/mizro-link`, sellerA.cookie, {
      mizro_business_ref: ref, // already taken by the first account
    });
    expect(conflict.status).toBe(409);
  });

  it('🔒 out-of-territory link is forbidden', async () => {
    const link = await post(`/v1/accounts/${accountId}/mizro-link`, sellerB.cookie, {
      mizro_business_ref: `other-${runId}`,
    });
    expect(link.status).toBe(403);
  });
});

describe('visibility 🔒', () => {
  it("sellers never see other sellers' commission or org-wide reports", async () => {
    const my = await app.request('/v1/commission/my', { headers: { cookie: sellerB.cookie } });
    expect(my.status).toBe(200);
    const body = (await my.json()) as { entries: unknown[] };
    expect(body.entries).toHaveLength(0);

    const reports = await app.request('/v1/reports/team-performance', {
      headers: { cookie: sellerB.cookie },
    });
    expect(reports.status).toBe(403);
  });
});
