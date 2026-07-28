// E01 — the founder's demo walkthrough, executable.
//
// `docs/founder/demos/demo-01-mizro.md` is the acceptance script, and the epic
// says E01 is done when it runs end to end. Prose cannot fail CI, so the half
// of it that does not need a host or a real SMS account runs here instead:
// steps 3 → 8, over real HTTP and real Postgres, in the founder's order.
//
// What this deliberately does NOT cover, because it cannot be honest about it:
//   · steps 1–2 (deploy) — needs the pool
//   · real sms.ir delivery — needs an account; the sender is captured below,
//     which proves the OTP *flow* and proves nothing about delivery.
//
// The OTP code is hashed at rest, so the test swaps in a capturing sender
// rather than guessing it. That is also the closest thing to what the founder
// does at step 5: read the code off the phone and type it in.

import { closePool, db, opsUserRoles, users } from '@arad-crm/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { authDeps } from '../lib/auth-wiring.js';
import { SESSION_COOKIE } from '../middleware/session.js';
import { cookieFor, runId } from './helpers.js';

const app = createApp();

const suffix = runId.slice(-4);
// The founder's own number in the script; a test that runs repeatedly against a
// shared dev database needs its own, so only the shape is preserved.
const SELLER_PHONE = `0916334${suffix}`;

let ops: { userId: string; cookie: string };
let mizroOrgId: string;
let sellerUserId: string;
let sellerCookie: string;

// Whatever the api tries to send, this captures — the test then "reads the SMS".
let lastOtp = '';
const realSender = authDeps.otpSender;

const json = (path: string, cookie: string, body: unknown, method = 'POST') =>
  app.request(path, {
    method,
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });

const get = (path: string, cookie: string) => app.request(path, { headers: { cookie } });

beforeAll(async () => {
  authDeps.otpSender = {
    async sendOtp({ code }) {
      lastOtp = code;
      return { messageId: `captured-${code.length}` };
    },
  };

  // Step 0 of the real script is `SEED_OPS_PHONE=… pnpm db:seed`, which is the
  // only path that mints the first ops user (deliberately not an API route).
  const opsUser = (
    await db
      .insert(users)
      .values({
        phone: `+98902000${suffix}`,
        displayName: 'اپراتور آراد',
        status: 'active',
        isOps: true,
      })
      .returning()
  )[0];
  if (!opsUser) throw new Error('ops user seed failed');
  await db.insert(opsUserRoles).values({ userId: opsUser.id, role: 'super_admin' });
  ops = { userId: opsUser.id, cookie: await cookieFor(opsUser.id) };
});

afterAll(async () => {
  authDeps.otpSender = realSender;
  await closePool();
});

describe('demo-01 §2 — the acceptance script', () => {
  it('3a. ops registers میزرو as a business', async () => {
    const res = await json('/v1/ops/businesses', ops.cookie, {
      name: 'میزرو',
      slug: `mizro-${suffix}`,
      vertical_key: 'mizro',
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; slug: string; vertical_key: string };
    mizroOrgId = body.id;
    expect(body.vertical_key).toBe('mizro');
  });

  it('3b. ops creates the seller by phone', async () => {
    const res = await json('/v1/ops/users', ops.cookie, {
      phone: SELLER_PHONE,
      display_name: 'فروشندهٔ میزرو',
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; phone: string };
    sellerUserId = body.id;
    // stored normalized, whatever spelling ops typed
    expect(body.phone).toMatch(/^\+98/);
  });

  it('3c. ops assigns that user to the business', async () => {
    const res = await json(`/v1/ops/users/${sellerUserId}/memberships`, ops.cookie, {
      organization_id: mizroOrgId,
      role: 'owner_admin',
    });
    expect([200, 201]).toContain(res.status);
    const body = (await res.json()) as { memberships: { organization_id: string }[] };
    expect(body.memberships.map((m) => m.organization_id)).toContain(mizroOrgId);
  });

  it('5. the seller logs in with a real OTP round trip', async () => {
    const requested = await app.request('/v1/auth/request-otp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mobile: SELLER_PHONE }),
    });
    expect(requested.status).toBe(200);
    expect(lastOtp).toMatch(/^\d+$/); // a code was actually produced and handed to a sender

    const verified = await app.request('/v1/auth/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mobile: SELLER_PHONE, code: lastOtp }),
    });
    expect(verified.status).toBe(200);
    const setCookie = verified.headers.get('set-cookie') ?? '';
    const token = /ac_session=([^;]+)/.exec(setCookie)?.[1];
    expect(token).toBeTruthy();
    sellerCookie = `${SESSION_COOKIE}=${token}`;
  });

  // 🔒 F06: one business ⇒ no selector, no guessing, straight to the dashboard.
  it('6. a single business lands the seller directly in it', async () => {
    const res = await get('/v1/auth/me', sellerCookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      membership: { organization_id: string };
      workspaces: unknown[];
      is_ops: boolean;
    };
    expect(body.membership.organization_id).toBe(mizroOrgId);
    expect(body.workspaces).toHaveLength(1);
    expect(body.is_ops).toBe(false); // 🔒 the two axes stay separate
  });

  it('7a. ＋ offers «سرنخ جدید», enabled for this seller', async () => {
    const res = await get('/v1/quick-add', sellerCookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { entries: { kind: string; enabled: boolean }[] };
    const lead = body.entries.find((e) => e.kind === 'lead');
    expect(lead?.enabled).toBe(true);
  });

  let leadId: string;

  it('7b. the seller captures a lead', async () => {
    const res = await json('/v1/leads', sellerCookie, {
      business_name: `کافه دمو ${suffix}`,
      phone: `0913900${suffix}`,
      region_text: 'ونک',
      contact_name: 'آقای احمدی',
    });
    expect(res.status).toBe(201);
    leadId = ((await res.json()) as { id: string }).id;
  });

  it('8a. saving it offers an opportunity and «۲ هفتهٔ دیگر»', async () => {
    const res = await get(`/v1/leads/${leadId}/guidance`, sellerCookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      suggest_opportunity: boolean;
      next_action_offsets: { key: string; label: string; days: number }[];
      opportunity_stages: { code: string }[];
    };
    expect(body.suggest_opportunity).toBe(true);
    expect(body.opportunity_stages.length).toBeGreaterThan(0);
    // the founder's own words, straight from the walkthrough
    const twoWeeks = body.next_action_offsets.find((o) => o.key === 'in_2_weeks');
    expect(twoWeeks?.days).toBe(14);
    expect(twoWeeks?.label).toBe('۲ هفتهٔ دیگر');
  });

  it('8b. one call opens the opportunity and dates the next action', async () => {
    const dueAt = new Date(Date.now() + 14 * 86_400_000);
    const res = await json(`/v1/leads/${leadId}/guided-followup`, sellerCookie, {
      opportunity: { stage: 'qualified' },
      next_action_type: 'follow_up_call',
      next_action_at: dueAt.toISOString(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      opportunity_id: string | null;
      next_action_at: string | null;
    };
    expect(body.opportunity_id).toBeTruthy();
    expect(body.next_action_at).toBe(dueAt.toISOString());
  });

  it('8c. and the lead now reads back with both', async () => {
    const res = await get(`/v1/leads/${leadId}`, sellerCookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      lead: { status: string; next_action_at: string | null };
      opportunities: { stage: string }[];
    };
    expect(body.lead.status).toBe('qualified');
    expect(body.lead.next_action_at).toBeTruthy();
    expect(body.opportunities).toHaveLength(1);
    expect(body.opportunities[0]?.stage).toBe('qualified');
  });
});

// The other side of step 6 — the moment Arad has a second client, which is the
// whole reason this repo is a CRM-OS and not a Mizro feature.
describe('demo-01 §2 step 6, the second business', () => {
  it('a second membership turns the landing into an explicit choice', async () => {
    const second = await json('/v1/ops/businesses', ops.cookie, {
      name: 'کسب‌وکار دوم',
      slug: `second-${suffix}`,
      vertical_key: 'mizro',
    });
    const secondOrgId = ((await second.json()) as { id: string }).id;
    await json(`/v1/ops/users/${sellerUserId}/memberships`, ops.cookie, {
      organization_id: secondOrgId,
      role: 'owner_admin',
    });

    // 🔒 Never a silent default — that is how data lands in the wrong business.
    const ambiguous = await get('/v1/auth/me', sellerCookie);
    expect(ambiguous.status).toBe(409);
    const body = (await ambiguous.json()) as {
      code?: string;
      meta?: { workspaces?: { organization_id: string }[] };
    };
    expect(body.code).toBe('workspace_selection_required');
    expect(body.meta?.workspaces).toHaveLength(2);

    const chosen = await json('/v1/auth/workspace', sellerCookie, {
      organization_id: mizroOrgId,
    });
    expect(chosen.status).toBe(200);
    const wsCookie = /ac_workspace=([^;]+)/.exec(chosen.headers.get('set-cookie') ?? '')?.[1];
    expect(wsCookie).toBe(mizroOrgId);

    const resolved = await get('/v1/auth/me', `${sellerCookie}; ac_workspace=${wsCookie}`);
    expect(resolved.status).toBe(200);
    expect(
      ((await resolved.json()) as { membership: { organization_id: string } }).membership
        .organization_id,
    ).toBe(mizroOrgId);
  });
});
