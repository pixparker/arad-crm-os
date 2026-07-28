// The three screens the ＋ leads into: «کارها و یادآورها» (the agenda),
// «سرنخ‌ها و مشتریان» (the segmented list) and «پایپلاین» (deal cards).
//
// What matters here is not the layout — it is that each surface tells the truth
// about work in flight: a commitment made on a file that never was a lead is
// still owed 🔒, a broken promise is bucketed as overdue rather than folded
// into today, the segment a file lands in is derived from money and deals
// rather than a settable field, and stage age counts from the stage change.

import { closePool } from '@arad-crm/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { startOfDayTehran } from '../lib/tehran-time.js';
import { type World, makeMember, runId, seedWorld } from './helpers.js';

const app = createApp();
let world: World;
let seller: { userId: string; cookie: string };
let other: { userId: string; cookie: string };

const suffix = runId.slice(-4);

const post = (path: string, cookie: string, body: unknown) =>
  app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });

const patch = (path: string, cookie: string, body: unknown) =>
  app.request(path, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });

const get = (path: string, cookie: string) => app.request(path, { headers: { cookie } });

interface Commitment {
  lead_id: string | null;
  account_id: string;
  account_name: string;
  action_type: string | null;
  due_at: string | null;
  overdue: boolean;
}
interface Agenda {
  today: string;
  overdue: Commitment[];
  days: { date: string; starts_at: string; items: Commitment[] }[];
}
interface ListItem {
  id: string;
  name: string;
  status: string;
  next_action_type: string | null;
  next_action_at: string | null;
  last_activity_at: string | null;
  open_opportunities: number;
  open_value_rial: string;
}
interface PipelineItem {
  id: string;
  account_id: string;
  stage: string;
  stage_entered_at: string;
  region_text: string | null;
  next_action_type: string | null;
  next_action_at: string | null;
}

const DAY = 86_400_000;
const atHourOn = (dayOffset: number, hour: number): string =>
  new Date(startOfDayTehran().getTime() + dayOffset * DAY + hour * 3_600_000).toISOString();

// The files this suite reasons about, kept as ids so each test can find its own
// row in a list that also contains the others.
let leadAccountId: string;
let leadId: string;
let leadlessAccountId: string;
let staleAccountId: string;
let oppId: string;

beforeAll(async () => {
  world = await seedWorld();
  seller = await makeMember(world, 'visitor_seller', world.territoryA);
  other = await makeMember(world, 'visitor_seller', world.territoryA);

  // 1. A lead with a follow-up the day after tomorrow.
  const leadRes = await post('/v1/leads', seller.cookie, {
    business_name: `کافه برنامه ${suffix}`,
    phone: `0914200${suffix}`,
    region_text: 'ونک',
  });
  const lead = (await leadRes.json()) as { id: string; account_id: string };
  leadId = lead.id;
  leadAccountId = lead.account_id;
  await post('/v1/activities', seller.cookie, {
    account_id: leadAccountId,
    lead_id: leadId,
    kind: 'call',
    outcome: 'interested',
    next_action_type: 'follow_up_call',
    next_action_at: atHourOn(2, 11),
  });

  // 2. A file created straight from the ＋ («مشتری») — no lead anywhere — with
  //    a promise for today. This is the one a leads-only reading loses.
  const acc = await post('/v1/accounts', seller.cookie, {
    business_name: `رستوران بی‌سرنخ ${suffix}`,
    phone: `0914201${suffix}`,
    region_text: 'ونک',
  });
  leadlessAccountId = ((await acc.json()) as { id: string }).id;
  await post('/v1/activities', seller.cookie, {
    account_id: leadlessAccountId,
    kind: 'visit',
    outcome: 'interested',
    next_action_type: 'send_price',
    next_action_at: atHourOn(0, 16),
  });

  // 3. A file whose promise was for yesterday — a broken one.
  const stale = await post('/v1/accounts', seller.cookie, {
    business_name: `کافه عقب‌افتاده ${suffix}`,
    phone: `0914202${suffix}`,
    region_text: 'ونک',
  });
  staleAccountId = ((await stale.json()) as { id: string }).id;
  await post('/v1/activities', seller.cookie, {
    account_id: staleAccountId,
    kind: 'call',
    outcome: 'interested',
    next_action_type: 'follow_up_call',
    next_action_at: atHourOn(-1, 10),
  });

  // A deal on the leadless file, so it reads as «فرصت» in the list.
  const opp = await post('/v1/opportunities', seller.cookie, {
    account_id: leadlessAccountId,
    stage: 'demo_sent',
    amount_estimate_rial: '24000000',
  });
  oppId = ((await opp.json()) as { id: string }).id;
});

afterAll(async () => {
  await closePool();
});

describe('GET /v1/activities/agenda', () => {
  it('buckets every commitment by Tehran day and keeps empty days visible', async () => {
    const res = await get('/v1/activities/agenda?days=7', seller.cookie);
    expect(res.status).toBe(200);
    const agenda = (await res.json()) as Agenda;

    // Seven buckets, in order, starting at today — a free day must still be
    // drawn, or the day strip silently skips it.
    expect(agenda.days).toHaveLength(7);
    expect(agenda.days[0]?.date).toBe(agenda.today);
    const dates = agenda.days.map((d) => d.date);
    expect([...dates].sort()).toEqual(dates);

    const today = agenda.days[0];
    expect(today?.items.map((i) => i.account_id)).toContain(leadlessAccountId);
    const dayAfter = agenda.days[2];
    expect(dayAfter?.items.map((i) => i.account_id)).toContain(leadAccountId);
  });

  it('🔒 carries a promise made on a file that never was a lead', async () => {
    const agenda = (await (await get('/v1/activities/agenda', seller.cookie)).json()) as Agenda;
    const item = agenda.days[0]?.items.find((i) => i.account_id === leadlessAccountId);
    expect(item).toBeDefined();
    expect(item?.lead_id).toBeNull();
    expect(item?.action_type).toBe('send_price');
  });

  it('separates a broken promise from today rather than folding it in', async () => {
    const agenda = (await (await get('/v1/activities/agenda', seller.cookie)).json()) as Agenda;
    expect(agenda.overdue.map((i) => i.account_id)).toContain(staleAccountId);
    expect(agenda.overdue.every((i) => i.overdue)).toBe(true);
    for (const day of agenda.days) {
      expect(day.items.map((i) => i.account_id)).not.toContain(staleAccountId);
    }
  });

  it('a shorter horizon drops the far commitment but keeps overdue', async () => {
    const agenda = (await (
      await get('/v1/activities/agenda?days=1', seller.cookie)
    ).json()) as Agenda;
    expect(agenda.days).toHaveLength(1);
    expect(agenda.days[0]?.items.map((i) => i.account_id)).not.toContain(leadAccountId);
    expect(agenda.overdue.map((i) => i.account_id)).toContain(staleAccountId);
  });

  it('🔒 shows only the actor’s own promises', async () => {
    const agenda = (await (await get('/v1/activities/agenda', other.cookie)).json()) as Agenda;
    const everything = [...agenda.overdue, ...agenda.days.flatMap((d) => d.items)];
    expect(everything).toHaveLength(0);
  });

  it('🔒 an unassigned lead worked by someone becomes theirs, not an orphan', async () => {
    // A manager captures the lead (it lands in the pool, unassigned) and then
    // makes the call themselves. Before, that moved it to `in_progress` — out
    // of «قابل برداشت» — while it still belonged to nobody, so the dated
    // promise appeared on no one's day and rotted where nothing could see it.
    const manager = await makeMember(world, 'sales_manager');
    const leadRes = await post('/v1/leads', manager.cookie, {
      business_name: `کافه بی‌صاحب ${suffix}`,
      phone: `0914203${suffix}`,
      region_text: 'ونک',
    });
    const orphan = (await leadRes.json()) as { id: string; account_id: string };

    await post('/v1/activities', manager.cookie, {
      account_id: orphan.account_id,
      lead_id: orphan.id,
      kind: 'call',
      outcome: 'interested',
      next_action_type: 'follow_up_call',
      next_action_at: atHourOn(0, 15),
    });

    const agenda = (await (await get('/v1/activities/agenda', manager.cookie)).json()) as Agenda;
    const carried = [...agenda.overdue, ...agenda.days.flatMap((d) => d.items)];
    expect(carried.map((i) => i.account_id)).toContain(orphan.account_id);
  });

  it('🔒 keeps carrying the promise after the lead becomes a deal', async () => {
    // Opening an opportunity marks its lead `qualified`, and a qualified lead
    // stops carrying a next action. The call that produced the deal still
    // promised a follow-up, so the promise has to survive on the activity —
    // otherwise every deal in the pipeline silently loses its next step at the
    // exact moment it becomes worth money.
    const leadRes = await post('/v1/leads', seller.cookie, {
      business_name: `کافه تبدیل ${suffix}`,
      phone: `0914204${suffix}`,
      region_text: 'ونک',
    });
    const converted = (await leadRes.json()) as { id: string; account_id: string };

    await post('/v1/activities', seller.cookie, {
      account_id: converted.account_id,
      lead_id: converted.id,
      kind: 'call',
      outcome: 'demo_requested',
      next_action_type: 'send_demo',
      next_action_at: atHourOn(1, 12),
    });
    await post('/v1/opportunities', seller.cookie, {
      account_id: converted.account_id,
      lead_id: converted.id,
      stage: 'demo_sent',
      amount_estimate_rial: '42500000',
    });

    const agenda = (await (await get('/v1/activities/agenda', seller.cookie)).json()) as Agenda;
    const tomorrow = agenda.days[1]?.items.find((i) => i.account_id === converted.account_id);
    expect(tomorrow?.action_type).toBe('send_demo');

    // …and it reaches the pipeline card, which is where the seller will see it.
    const deals = (await (await get('/v1/opportunities?view=mine', seller.cookie)).json()) as {
      items: PipelineItem[];
    };
    const card = deals.items.find((o) => o.account_id === converted.account_id);
    expect(card?.next_action_type).toBe('send_demo');
  });

  it('does not list one promise twice while its lead is still open', async () => {
    // The lead row and the activity row hold the same commitment; only one of
    // them may reach the seller's day.
    const agenda = (await (await get('/v1/activities/agenda', seller.cookie)).json()) as Agenda;
    const everything = [...agenda.overdue, ...agenda.days.flatMap((d) => d.items)];
    const ids = everything.map((i) => i.account_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('agrees with «امروز من» and with the dashboard banner', async () => {
    const agenda = (await (await get('/v1/activities/agenda', seller.cookie)).json()) as Agenda;
    const today = (await (await get('/v1/activities/today', seller.cookie)).json()) as {
      due_actions: Commitment[];
    };
    const dash = (await (await get('/v1/reports/dashboard', seller.cookie)).json()) as {
      due: { today: number; overdue: number };
    };
    // «امروز من» is today ∪ overdue — the same set the agenda splits in two.
    const agendaDue = agenda.overdue.length + (agenda.days[0]?.items.length ?? 0);
    expect(today.due_actions).toHaveLength(agendaDue);
    expect(dash.due.today).toBe(agendaDue);
    expect(dash.due.overdue).toBe(agenda.overdue.length);
  });
});

describe('GET /v1/accounts (the list screen)', () => {
  const listFor = async (query = ''): Promise<ListItem[]> => {
    const res = await get(`/v1/accounts${query}`, seller.cookie);
    expect(res.status).toBe(200);
    return ((await res.json()) as { items: ListItem[] }).items;
  };

  it('annotates each row with the commitment standing on it', async () => {
    const items = await listFor();
    const row = items.find((i) => i.id === leadlessAccountId);
    expect(row?.next_action_type).toBe('send_price');
    expect(row?.next_action_at).toBeTruthy();
    expect(row?.last_activity_at).toBeTruthy();
  });

  it('reports open deals as a count and a digit-string total 🔒', async () => {
    const items = await listFor();
    const row = items.find((i) => i.id === leadlessAccountId);
    expect(row?.open_opportunities).toBe(1);
    expect(row?.open_value_rial).toBe('24000000');
    const noDeals = items.find((i) => i.id === staleAccountId);
    expect(noDeals?.open_opportunities).toBe(0);
    expect(noDeals?.open_value_rial).toBe('0');
  });

  it('derives the «فرصت» segment from an open deal, not from a field', async () => {
    const opportunities = await listFor('?segment=opportunity');
    expect(opportunities.map((i) => i.id)).toContain(leadlessAccountId);
    expect(opportunities.map((i) => i.id)).not.toContain(staleAccountId);

    const leads = await listFor('?segment=lead');
    expect(leads.map((i) => i.id)).toContain(staleAccountId);
    expect(leads.map((i) => i.id)).not.toContain(leadlessAccountId);
  });

  it('«مشتری» is empty until a payment says otherwise 🔒', async () => {
    // Nothing in this world has been paid for, so no file may claim customer
    // status — that transition belongs to the payment event alone.
    expect(await listFor('?segment=customer')).toHaveLength(0);
  });

  it('🔒 does not leak another seller’s commitments into shared rows', async () => {
    // Same territory, so `other` sees the same files — but none of the promises,
    // because the commitment belongs to whoever made it.
    const res = await get('/v1/accounts', other.cookie);
    const items = ((await res.json()) as { items: ListItem[] }).items;
    expect(items.map((i) => i.id)).toContain(leadlessAccountId);
    expect(items.find((i) => i.id === leadlessAccountId)?.next_action_type).toBeNull();
  });
});

describe('GET /v1/opportunities (the pipeline screen)', () => {
  const pipeline = async (cookie: string): Promise<PipelineItem[]> => {
    const res = await get('/v1/opportunities?view=mine', cookie);
    expect(res.status).toBe(200);
    return ((await res.json()) as { items: PipelineItem[] }).items;
  };

  it('carries the file’s next step onto the deal card', async () => {
    const card = (await pipeline(seller.cookie)).find((o) => o.id === oppId);
    expect(card?.next_action_type).toBe('send_price');
    expect(card?.region_text).toBe('ونک');
  });

  it('stage age counts from the stage change, not from any edit', async () => {
    const before = (await pipeline(seller.cookie)).find((o) => o.id === oppId);
    const enteredAt = new Date(before?.stage_entered_at ?? 0).getTime();

    const res = await patch(`/v1/opportunities/${oppId}`, seller.cookie, {
      stage: 'price_proposed',
    });
    expect(res.status).toBe(200);

    const after = (await pipeline(seller.cookie)).find((o) => o.id === oppId);
    expect(after?.stage).toBe('price_proposed');
    expect(new Date(after?.stage_entered_at ?? 0).getTime()).toBeGreaterThan(enteredAt);
  });
});
