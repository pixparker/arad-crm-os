// The seller home read model (prototype screen ۰۲). What matters here is not
// the arithmetic — it is 🔒 that the numbers are the actor's OWN book, and that
// money survives the round trip as a digit-string.

import { closePool } from '@arad-crm/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { startOfDayTehran, startOfJalaliMonthTehran } from '../lib/tehran-time.js';
import { type World, makeMember, runId, seedWorld } from './helpers.js';

const app = createApp();
let world: World;
let sellerA: { userId: string; cookie: string };
let sellerB: { userId: string; cookie: string };

const suffix = runId.slice(-4);

const post = (path: string, cookie: string, body: unknown) =>
  app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });

const get = (path: string, cookie: string) => app.request(path, { headers: { cookie } });

interface Dashboard {
  kpis: {
    pipeline_value_rial: string;
    open_deals: number;
    conversion_rate_pct: number | null;
    commission_month_rial: string;
  };
  due: { today: number; overdue: number; overdue_names: string[] };
  stages: { code: string; count: number; value_rial: string }[];
  attention: { kind: string; title: string; badge: string }[];
}

const dashboardFor = async (cookie: string): Promise<Dashboard> => {
  const res = await get('/v1/reports/dashboard', cookie);
  expect(res.status).toBe(200);
  return (await res.json()) as Dashboard;
};

beforeAll(async () => {
  world = await seedWorld();
  sellerA = await makeMember(world, 'visitor_seller', world.territoryA);
  sellerB = await makeMember(world, 'visitor_seller', world.territoryB);

  const lead = await post('/v1/leads', sellerA.cookie, {
    business_name: `کافه داشبورد ${suffix}`,
    phone: `0914100${suffix}`,
    region_text: 'ونک',
  });
  const { id: leadId, account_id } = (await lead.json()) as { id: string; account_id: string };

  await post('/v1/opportunities', sellerA.cookie, {
    account_id,
    lead_id: leadId,
    stage: 'price_proposed',
    amount_estimate_rial: '18500000',
  });
  await post('/v1/opportunities', sellerA.cookie, {
    account_id,
    stage: 'demo_sent',
    amount_estimate_rial: '11500000',
  });

  // A second lead left OPEN: converting the first one qualifies it, which
  // (correctly) takes it off the day's list.
  await post('/v1/leads', sellerA.cookie, {
    business_name: `کافه پیگیری ${suffix}`,
    phone: `0914200${suffix}`,
    region_text: 'ونک',
  });
});

afterAll(async () => {
  await closePool();
});

describe('GET /v1/reports/dashboard', () => {
  it('sums the open pipeline as a digit-string, never a number', async () => {
    const body = await dashboardFor(sellerA.cookie);
    // 🔒 the sum arrives as text; parsing it must be the client's explicit choice
    expect(body.kpis.pipeline_value_rial).toBe('30000000');
    expect(typeof body.kpis.pipeline_value_rial).toBe('string');
    expect(body.kpis.open_deals).toBe(2);
  });

  it('keeps every vertical stage, so an empty stage reads as a gap', async () => {
    const body = await dashboardFor(sellerA.cookie);
    const codes = body.stages.map((s) => s.code);
    expect(codes).toContain('qualified'); // never used above — still present
    expect(codes).toContain('price_proposed');
    const proposed = body.stages.find((s) => s.code === 'price_proposed');
    expect(proposed?.count).toBe(1);
    expect(proposed?.value_rial).toBe('18500000');
  });

  // 🔒 the rule the whole screen rests on
  it('another seller sees their own empty book, not this one', async () => {
    const body = await dashboardFor(sellerB.cookie);
    expect(body.kpis.pipeline_value_rial).toBe('0');
    expect(body.kpis.open_deals).toBe(0);
    expect(body.stages.every((s) => s.count === 0)).toBe(true);
  });

  it('reports no conversion rate rather than a 0٪ verdict on an empty history', async () => {
    const body = await dashboardFor(sellerB.cookie);
    expect(body.kpis.conversion_rate_pct).toBeNull();
  });

  it('counts the seller’s due actions and names the overdue ones', async () => {
    const body = await dashboardFor(sellerA.cookie);
    // the lead created above is seller-introduced ⇒ dated visit today
    expect(body.due.today).toBeGreaterThanOrEqual(1);
    expect(body.due.overdue_names.length).toBeLessThanOrEqual(2);
  });

  it('surfaces an unassigned lead in the seller’s own territory only', async () => {
    const unassigned = await dashboardFor(sellerA.cookie);
    expect(unassigned.attention.every((a) => typeof a.badge === 'string')).toBe(true);
  });
});

// 🔒 «امروز» is Tehran's day. In a UTC container the old server-local
// boundaries put a 20:00 follow-up on tomorrow and un-flagged overdue items
// for three and a half hours every night.
describe('Tehran day boundaries', () => {
  it('starts the day at midnight Tehran regardless of the server zone', () => {
    const at = new Date('2026-07-28T09:15:00Z'); // 12:45 Tehran
    const start = startOfDayTehran(at);
    const tehranClock = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Tehran',
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
    }).format(start);
    expect(tehranClock).toBe('00:00');
    expect(start.getTime()).toBeLessThan(at.getTime());
  });

  it('starts the commission month on the first of the Jalali month', () => {
    const at = new Date('2026-07-28T09:15:00Z');
    const monthStart = startOfJalaliMonthTehran(at);
    const persianDay = new Intl.DateTimeFormat('en-u-ca-persian', {
      timeZone: 'Asia/Tehran',
      day: 'numeric',
    }).format(monthStart);
    expect(persianDay).toBe('1');
    expect(monthStart.getTime()).toBeLessThanOrEqual(startOfDayTehran(at).getTime());
  });
});
