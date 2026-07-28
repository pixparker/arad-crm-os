// E01-F11 — the entity read surface the ＋ sheet and the detail screens consume,
// over real HTTP + real Postgres. What is asserted here is mostly one thing:
// 🔒 an id is not an authorization. The list endpoints have always restricted a
// seller to their own territory; the detail reads must agree, and the duplicate
// check must be able to say "taken" without handing over the file.

import { auditLog, closePool, db, orgScope } from '@arad-crm/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { type World, makeMember, runId, seedWorld } from './helpers.js';

const app = createApp();
let world: World;
let manager: { userId: string; cookie: string };
let sellerA: { userId: string; cookie: string };
let sellerB: { userId: string; cookie: string };

const post = (path: string, cookie: string, body: unknown) =>
  app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });

const get = (path: string, cookie: string) => app.request(path, { headers: { cookie } });

const suffix = runId.slice(-4);

beforeAll(async () => {
  world = await seedWorld();
  manager = await makeMember(world, 'sales_manager');
  sellerA = await makeMember(world, 'visitor_seller', world.territoryA);
  sellerB = await makeMember(world, 'visitor_seller', world.territoryB);
});

afterAll(async () => {
  await closePool();
});

describe('＋ «مشتری» — POST /v1/accounts (E01-F07 registry entry)', () => {
  let accountId: string;

  it('creates a file in the seller’s own territory, in the funnel', async () => {
    const res = await post('/v1/accounts', sellerA.cookie, {
      business_name: `کافه ری ${suffix}`,
      phone: `0913100${suffix}`,
      region_text: 'ونک',
      contact_name: 'آقای رضایی',
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      id: string;
      status: string;
      territory_id: string;
      source: string;
    };
    accountId = body.id;
    expect(body.status).toBe('in_funnel');
    expect(body.territory_id).toBe(world.territoryA);
    expect(body.source).toBe('seller');
  });

  // 🔒 sale = payment event: 'customer' is the worker's word, not a form field
  it('cannot be created as a customer — the status field does not exist on the wire', async () => {
    const res = await post('/v1/accounts', manager.cookie, {
      business_name: `کافه وضعیت ${suffix}`,
      phone: `0913199${suffix}`,
      status: 'customer',
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('in_funnel');
  });

  it('refuses a duplicate phone, and says whether the existing file is reachable', async () => {
    const res = await post('/v1/accounts', sellerA.cookie, {
      business_name: `کافه ری دوم ${suffix}`,
      phone: `0913100${suffix}`,
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as {
      meta?: { existing_account_id?: string; visible_to_me?: boolean };
    };
    expect(body.meta?.existing_account_id).toBe(accountId);
    expect(body.meta?.visible_to_me).toBe(true);
  });

  it('🔒 a seller cannot file a business into another territory', async () => {
    const res = await post('/v1/accounts', sellerA.cookie, {
      business_name: `کافه کرج ${suffix}`,
      territory_id: world.territoryB,
    });
    expect(res.status).toBe(403);
  });
});

describe('duplicate lookup — GET /v1/accounts/lookup', () => {
  it('reports a reachable file with its name', async () => {
    const res = await get(`/v1/accounts/lookup?phone=0913100${suffix}`, sellerA.cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { found: boolean; visible_to_me: boolean; name: string };
    expect(body.found).toBe(true);
    expect(body.visible_to_me).toBe(true);
    expect(body.name).toContain('کافه ری');
  });

  // 🔒 the whole point of the endpoint: stop the seller typing, tell them nothing
  it('reports another territory’s file as taken, without its contents', async () => {
    const res = await get(`/v1/accounts/lookup?phone=0913100${suffix}`, sellerB.cookie);
    const body = (await res.json()) as {
      found: boolean;
      visible_to_me: boolean;
      account_id: string | null;
      name: string | null;
      message: string | null;
    };
    expect(body.found).toBe(true);
    expect(body.visible_to_me).toBe(false);
    expect(body.account_id).toBeNull();
    expect(body.name).toBeNull();
    expect(body.message).toBeTruthy();
  });

  it('an unknown phone is simply not found', async () => {
    const res = await get('/v1/accounts/lookup?phone=09120000000', sellerA.cookie);
    const body = (await res.json()) as { found: boolean; message: string | null };
    expect(body.found).toBe(false);
    expect(body.message).toBeNull();
  });
});

describe('detail reads 🔒 an id is not an authorization', () => {
  let leadId: string;
  let accountId: string;
  let opportunityId: string;

  beforeAll(async () => {
    const created = await post('/v1/leads', sellerA.cookie, {
      business_name: `کافه پرونده ${suffix}`,
      phone: `0913200${suffix}`,
      region_text: 'ونک',
    });
    const lead = (await created.json()) as { id: string; account_id: string };
    leadId = lead.id;
    accountId = lead.account_id;

    const opp = await post('/v1/opportunities', sellerA.cookie, {
      account_id: accountId,
      lead_id: leadId,
      stage: 'demo_sent',
      amount_estimate_rial: '15000000',
    });
    opportunityId = ((await opp.json()) as { id: string }).id;
  });

  it('lead detail carries the file, the timeline and the deals it produced', async () => {
    const res = await get(`/v1/leads/${leadId}`, sellerA.cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      lead: { id: string };
      account: { id: string; name: string };
      timeline: unknown[];
      opportunities: { id: string; amount_estimate_rial: string }[];
    };
    expect(body.lead.id).toBe(leadId);
    expect(body.account.id).toBe(accountId);
    expect(body.opportunities).toHaveLength(1);
    // 🔒 money crosses the wire as a digit-string, never a number
    expect(body.opportunities[0]?.amount_estimate_rial).toBe('15000000');
  });

  it('another territory’s seller is refused the lead, the account and the deal', async () => {
    expect((await get(`/v1/leads/${leadId}`, sellerB.cookie)).status).toBe(403);
    expect((await get(`/v1/accounts/${accountId}`, sellerB.cookie)).status).toBe(403);
    expect((await get(`/v1/opportunities/${opportunityId}`, sellerB.cookie)).status).toBe(403);
  });

  it('the manager reads all three', async () => {
    expect((await get(`/v1/leads/${leadId}`, manager.cookie)).status).toBe(200);
    expect((await get(`/v1/accounts/${accountId}`, manager.cookie)).status).toBe(200);
    expect((await get(`/v1/opportunities/${opportunityId}`, manager.cookie)).status).toBe(200);
  });

  it('opportunity detail names the lead it came from', async () => {
    const res = await get(`/v1/opportunities/${opportunityId}`, sellerA.cookie);
    const body = (await res.json()) as {
      opportunity: { id: string; status: string };
      lead: { id: string } | null;
      account: { id: string };
    };
    expect(body.opportunity.status).toBe('open');
    expect(body.lead?.id).toBe(leadId);
    expect(body.account.id).toBe(accountId);
  });

  // A cross-territory assignment is a real workflow, and it must grant the read
  // it implies — otherwise the manager hands a seller a lead they cannot open.
  it('an assignment across territories grants the read it implies 🔒', async () => {
    expect((await get(`/v1/leads/${leadId}`, sellerB.cookie)).status).toBe(403);
    const assigned = await post(`/v1/leads/${leadId}/assign`, manager.cookie, {
      seller_id: sellerB.userId,
      override_territory: true,
    });
    expect(assigned.status).toBe(200);
    expect((await get(`/v1/leads/${leadId}`, sellerB.cookie)).status).toBe(200);
    expect((await get(`/v1/accounts/${accountId}`, sellerB.cookie)).status).toBe(200);
  });

  it('a missing id is 404, not 403', async () => {
    const res = await get('/v1/leads/00000000-0000-7000-8000-000000000000', manager.cookie);
    expect(res.status).toBe(404);
  });
});

// business-architecture §11 rule 11 — a change to ownership, pipeline state or
// the attribution bridge leaves a row saying who did it and what it was before.
describe('tenant-side audit 🔒', () => {
  const auditRows = async (entityId: string) =>
    db
      .select()
      .from(auditLog)
      .where(and(orgScope(auditLog.organizationId, world.orgId), eq(auditLog.entityId, entityId)));

  it('a stage change records who moved it and from where', async () => {
    const created = await post('/v1/leads', sellerA.cookie, {
      business_name: `کافه ممیزی ${suffix}`,
      phone: `0913300${suffix}`,
      region_text: 'ونک',
    });
    const { id: leadId, account_id } = (await created.json()) as {
      id: string;
      account_id: string;
    };
    const opp = await post('/v1/opportunities', sellerA.cookie, {
      account_id,
      lead_id: leadId,
      stage: 'qualified',
    });
    const oppId = ((await opp.json()) as { id: string }).id;

    const patched = await app.request(`/v1/opportunities/${oppId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: sellerA.cookie },
      body: JSON.stringify({ stage: 'price_proposed' }),
    });
    expect(patched.status).toBe(200);

    const rows = await auditRows(oppId);
    const entry = rows.find((r) => r.action === 'opportunity.stage_changed');
    expect(entry).toBeDefined();
    expect(entry?.actorUserId).toBe(sellerA.userId);
    expect((entry?.before as { stage: string }).stage).toBe('qualified');
    expect((entry?.after as { stage: string }).stage).toBe('price_proposed');
  });

  it('linking an account to a Mizro business is audited — it decides whose commission it is', async () => {
    const created = await post('/v1/accounts', manager.cookie, {
      business_name: `کافه اتصال ${suffix}`,
      phone: `0913400${suffix}`,
    });
    const accountId = ((await created.json()) as { id: string }).id;
    const ref = `mizro-biz-${suffix}`;

    const linked = await post(`/v1/accounts/${accountId}/mizro-link`, manager.cookie, {
      mizro_business_ref: ref,
    });
    expect(linked.status).toBe(200);

    const entry = (await auditRows(accountId)).find((r) => r.action === 'account.mizro_linked');
    expect(entry).toBeDefined();
    expect((entry?.after as { mizro_business_ref: string }).mizro_business_ref).toBe(ref);
  });

  it('a self-service pick is audited on the same terms as a manager’s assignment', async () => {
    await post('/v1/leads/import', manager.cookie, {
      source: 'csv_import',
      default_territory_id: world.territoryA,
      rows: [{ business_name: `کافه برداشت ${suffix}`, phone: `0913500${suffix}` }],
    });
    const pickable = (await (await get('/v1/leads?view=pickable', sellerA.cookie)).json()) as {
      items: { id: string; account_name: string }[];
    };
    const target = pickable.items.find((l) => l.account_name.includes('کافه برداشت'));
    expect(target).toBeDefined();

    const picked = await post(`/v1/leads/${target?.id}/pick`, sellerA.cookie, {});
    expect(picked.status).toBe(200);

    const entry = (await auditRows(target?.id ?? '')).find((r) => r.action === 'lead.picked');
    expect(entry).toBeDefined();
    expect(entry?.actorUserId).toBe(sellerA.userId);
  });
});
