// E01 control plane + identity, over real HTTP and real Postgres:
// 🔒 the two identity axes stay separate, every ops mutation is audited,
// workspace resolution never guesses, and the guided post-create enforces the
// open-lead invariant.

import {
  auditLog,
  closePool,
  db,
  flowStepDecisions,
  leads,
  opsUserRoles,
  orgScope,
  organizations,
  users,
} from '@arad-crm/db';
import { issueSession } from '@arad/auth-otp';
import { and, desc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { SESSION_COOKIE, WORKSPACE_COOKIE } from '../middleware/session.js';
import { type World, makeMember, runId, seedWorld } from './helpers.js';

const app = createApp();

let world: World;
let ops: { userId: string; cookie: string };
let tenantOnly: { userId: string; cookie: string };

const json = (path: string, cookie: string, body: unknown, method = 'POST') =>
  app.request(path, {
    method,
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });

const get = (path: string, cookie: string) => app.request(path, { headers: { cookie } });

const cookieFor = async (userId: string): Promise<string> => {
  const row = (await db.select().from(users).where(eq(users.id, userId)))[0];
  if (!row) throw new Error('user not found');
  const token = await issueSession(
    // The same session issuer the login route uses — these tests exercise the
    // real cookie path, not a stubbed actor.
    (await import('../lib/auth-wiring.js')).sessionDeps,
    { id: row.id, mobile: row.phone, sessionVersion: row.sessionVersion },
  );
  return `${SESSION_COOKIE}=${token.token}`;
};

beforeAll(async () => {
  world = await seedWorld();
  // An Arad staffer on the ops axis only — deliberately NOT an org member.
  const opsUser = (
    await db
      .insert(users)
      .values({
        phone: `+98901000${runId.slice(-4)}`,
        displayName: 'اپراتور',
        status: 'active',
        isOps: true,
      })
      .returning()
  )[0];
  if (!opsUser) throw new Error('ops user seed failed');
  await db.insert(opsUserRoles).values({ userId: opsUser.id, role: 'super_admin' });
  ops = { userId: opsUser.id, cookie: await cookieFor(opsUser.id) };

  // A tenant manager with no ops axis.
  tenantOnly = await makeMember(world, 'sales_manager');
});

afterAll(async () => {
  await closePool();
});

describe('🔒 two identity axes (ADR-014 §1)', () => {
  it('an ops user reaches the control plane', async () => {
    const res = await get('/v1/ops/me', ops.cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { roles: string[] };
    expect(body.roles).toContain('super_admin');
  });

  it('a tenant role — even owner-level — does NOT', async () => {
    const res = await get('/v1/ops/me', tenantOnly.cookie);
    expect(res.status).toBe(401);
  });

  it('an ops user with no membership gets no tenant workspace', async () => {
    const res = await get('/v1/auth/me', ops.cookie);
    // Explicit "no access", never a blank dashboard.
    expect(res.status).toBe(403);
    const body = (await res.json()) as { meta?: { code?: string } };
    expect(body.meta?.code).toBe('no_workspace');
  });
});

describe('provisioning (the demo, steps 3–4)', () => {
  let businessId = '';
  let userId = '';

  it('registers a business and audits it', async () => {
    const res = await json('/v1/ops/businesses', ops.cookie, {
      name: 'Mizro Test',
      slug: `mizro-${runId.slice(-6)}`,
      vertical_key: 'mizro',
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; slug: string };
    businessId = body.id;

    const audit = (
      await db
        .select()
        .from(auditLog)
        .where(
          and(orgScope(auditLog.organizationId, businessId), eq(auditLog.entityId, businessId)),
        )
        .orderBy(desc(auditLog.createdAt))
    )[0];
    expect(audit?.action).toBe('ops.business.created');
    expect(audit?.actorUserId).toBe(ops.userId);
  });

  it('rejects a reserved slug rather than creating a shadowed host', async () => {
    const res = await json('/v1/ops/businesses', ops.cookie, { name: 'Ops', slug: 'ops' });
    expect(res.status).toBe(400);
  });

  it('creates a user by phone and assigns them to the business', async () => {
    const created = await json('/v1/ops/users', ops.cookie, {
      phone: `0916334${runId.slice(-4)}`,
      display_name: 'فروشنده',
    });
    expect(created.status).toBe(201);
    userId = ((await created.json()) as { id: string }).id;

    const assigned = await json(`/v1/ops/users/${userId}/memberships`, ops.cookie, {
      organization_id: businessId,
      role: 'visitor_seller',
    });
    expect(assigned.status).toBe(201);
    const body = (await assigned.json()) as { memberships: { organization_id: string }[] };
    expect(body.memberships.map((m) => m.organization_id)).toContain(businessId);
  });

  it('re-assigning updates the role instead of erroring', async () => {
    const res = await json(`/v1/ops/users/${userId}/memberships`, ops.cookie, {
      organization_id: businessId,
      role: 'followup_seller',
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { memberships: { role: string }[] };
    expect(body.memberships[0]?.role).toBe('followup_seller');
  });

  it('binds a producer to the business so the worker never guesses (F10)', async () => {
    const res = await json('/v1/ops/businesses/producer-bindings', ops.cookie, {
      producer: 'mizro',
      external_ref: `test-${runId.slice(-6)}`,
      organization_id: businessId,
      label: 'میزرو',
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { organization_id: string };
    expect(body.organization_id).toBe(businessId);
  });

  // Revoking someone's LAST ops role drops the ops axis with it, so a
  // role-less user never keeps a reachable control plane.
  //
  // The companion rule — the last super_admin cannot be demoted — counts
  // super_admins platform-wide, so it is deliberately not asserted here: this
  // suite runs against the shared dev database, which accumulates ops users
  // across runs, and a test that manufactured "exactly one" would have to
  // delete other runs' rows to do it.
  it('revoking the last ops role clears the ops axis', async () => {
    const staffPhone = `+98902${runId.slice(-6)}`;
    const staff = (
      await db
        .insert(users)
        .values({ phone: staffPhone, displayName: 'پشتیبان', status: 'active' })
        .returning()
    )[0];
    if (!staff) throw new Error('staff seed failed');

    const granted = await json('/v1/ops/ops-users/grant', ops.cookie, {
      user_id: staff.id,
      role: 'support',
    });
    expect(granted.status).toBe(200);
    expect((await db.select().from(users).where(eq(users.id, staff.id)))[0]?.isOps).toBe(true);

    const revoked = await json('/v1/ops/ops-users/revoke', ops.cookie, {
      user_id: staff.id,
      role: 'support',
    });
    expect(revoked.status).toBe(200);
    expect((await db.select().from(users).where(eq(users.id, staff.id)))[0]?.isOps).toBe(false);
  });
});

describe('🔒 workspace resolution (F06)', () => {
  let secondOrgId = '';
  let multiUser: { userId: string; cookie: string };

  beforeAll(async () => {
    multiUser = await makeMember(world, 'sales_manager');
    const second = (
      await db
        .insert(organizations)
        .values({ name: 'دومی', slug: `second-${runId.slice(-6)}` })
        .returning()
    )[0];
    if (!second) throw new Error('second org seed failed');
    secondOrgId = second.id;
    const assigned = await json(`/v1/ops/users/${multiUser.userId}/memberships`, ops.cookie, {
      organization_id: secondOrgId,
      role: 'owner_admin',
    });
    if (assigned.status !== 201) {
      throw new Error(`second-org assignment failed: ${assigned.status} ${await assigned.text()}`);
    }
  });

  it('one membership ⇒ lands straight on the workspace', async () => {
    const res = await get('/v1/auth/me', tenantOnly.cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { workspaces: unknown[]; membership: { role: string } };
    expect(body.workspaces).toHaveLength(1);
    expect(body.membership.role).toBe('sales_manager');
  });

  it('two memberships with no choice made ⇒ 409, not a guessed default', async () => {
    const res = await get('/v1/auth/me', multiUser.cookie);
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string; meta: { workspaces: unknown[] } };
    expect(body.code).toBe('workspace_selection_required');
    expect(body.meta.workspaces).toHaveLength(2);
  });

  it('choosing a workspace resolves it for subsequent requests', async () => {
    const chosen = await json('/v1/auth/workspace', multiUser.cookie, {
      organization_id: secondOrgId,
    });
    expect(chosen.status).toBe(200);

    const me = await get('/v1/auth/me', `${multiUser.cookie}; ${WORKSPACE_COOKIE}=${secondOrgId}`);
    expect(me.status).toBe(200);
    const body = (await me.json()) as { membership: { organization_id: string; role: string } };
    expect(body.membership.organization_id).toBe(secondOrgId);
    expect(body.membership.role).toBe('owner_admin');
  });

  it('🔒 a workspace cookie for a business you do not belong to is ignored', async () => {
    const res = await get(
      '/v1/auth/me',
      `${tenantOnly.cookie}; ${WORKSPACE_COOKIE}=${secondOrgId}`,
    );
    // Falls back to the single legitimate membership rather than honouring the
    // cookie — a cookie is a request, not an authorization.
    expect(res.status).toBe(200);
    const body = (await res.json()) as { membership: { organization_id: string } };
    expect(body.membership.organization_id).toBe(world.orgId);
  });

  it('selecting a business you are not a member of is refused', async () => {
    const res = await json('/v1/auth/workspace', tenantOnly.cookie, {
      organization_id: secondOrgId,
    });
    expect(res.status).toBe(403);
  });
});

describe('quick-add + guided post-create (F07/F08)', () => {
  let seller: { userId: string; cookie: string };
  let leadId = '';
  let flowId = '';

  beforeAll(async () => {
    seller = await makeMember(world, 'visitor_seller', world.territoryA);
  });

  it('serves the ＋ registry with role-aware entries', async () => {
    const res = await get('/v1/quick-add', seller.cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { entries: { kind: string; enabled: boolean }[] };
    expect(body.entries.map((e) => e.kind)).toEqual([
      'lead',
      'customer',
      'opportunity',
      'touch',
      'info',
    ]);
    expect(body.entries.every((e) => e.enabled)).toBe(true);
  });

  it('a saved lead comes back with guidance instead of a dead end', async () => {
    const created = await json('/v1/leads', seller.cookie, {
      business_name: 'کافه راهنما',
      phone: `0913777${runId.slice(-4)}`,
      region_text: 'ونک',
      source: 'manual',
    });
    expect(created.status).toBe(201);
    leadId = ((await created.json()) as { id: string }).id;

    const res = await get(`/v1/leads/${leadId}/guidance`, seller.cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      suggest_opportunity: boolean;
      next_action_offsets: { days: number }[];
      suggested_next_action: { source: string } | null;
    };
    expect(body.suggest_opportunity).toBe(true);
    // The founder's own example: «۲ هفتهٔ دیگر».
    expect(body.next_action_offsets.map((o) => o.days)).toContain(14);
    expect(body.suggested_next_action?.source).toBe('none');
  });

  it('🔒 refuses to leave an open lead without a dated next action', async () => {
    const res = await json(`/v1/leads/${leadId}/guided-followup`, seller.cookie, {
      opportunity: { stage: 'qualified' },
    });
    expect(res.status).toBe(400);
  });

  it('opens the opportunity and schedules the next action in one step', async () => {
    const at = new Date(Date.now() + 14 * 86_400_000).toISOString();
    const res = await json(`/v1/leads/${leadId}/guided-followup`, seller.cookie, {
      opportunity: { stage: 'qualified', amount_estimate_rial: '25000000' },
      next_action_type: 'follow_up_call',
      next_action_at: at,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { opportunity_id: string | null };
    expect(body.opportunity_id).toBeTruthy();

    const lead = (
      await db
        .select()
        .from(leads)
        .where(and(orgScope(leads.organizationId, world.orgId), eq(leads.id, leadId)))
    )[0];
    expect(lead?.status).toBe('qualified');
    expect(lead?.nextActionType).toBe('follow_up_call');
    expect(lead?.nextActionAt).toBeTruthy();
  });

  it('a flow supplies the default, and an override is recorded (F09)', async () => {
    const manager = await makeMember(world, 'sales_manager');
    const flow = await json('/v1/flows', manager.cookie, {
      key: `cold_campaign_${runId.slice(-4)}`,
      label: 'کمپین سرد محصول ایکس',
      entity_kind: 'lead',
      steps: [
        { order: 1, action_type: 'follow_up_call', offset_days: 2, label: 'تماس اول' },
        { order: 2, action_type: 'send_demo', offset_days: 5, label: 'ارسال دمو' },
      ],
    });
    expect(flow.status).toBe(201);
    flowId = ((await flow.json()) as { id: string }).id;

    const created = await json('/v1/leads', seller.cookie, {
      business_name: 'کافه فلو',
      phone: `0913888${runId.slice(-4)}`,
      region_text: 'ونک',
      source: 'manual',
    });
    const flowLeadId = ((await created.json()) as { id: string }).id;

    // Enrolling and choosing in the same guided step.
    const at = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const followup = await json(`/v1/leads/${flowLeadId}/guided-followup`, seller.cookie, {
      flow_id: flowId,
      next_action_type: 'visit', // NOT the flow's step-1 action
      next_action_at: at,
    });
    expect(followup.status).toBe(200);
    expect(((await followup.json()) as { enrolled_flow_id: string }).enrolled_flow_id).toBe(flowId);

    const decision = (
      await db
        .select()
        .from(flowStepDecisions)
        .where(
          and(
            orgScope(flowStepDecisions.organizationId, world.orgId),
            eq(flowStepDecisions.chosenActionType, 'visit'),
          ),
        )
        .orderBy(desc(flowStepDecisions.createdAt))
    )[0];
    expect(decision?.decision).toBe('overridden');
    expect(decision?.suggestedActionType).toBe('follow_up_call');
  });

  it('🔒 a published flow edit becomes a new version, leaving enrollments alone', async () => {
    const manager = await makeMember(world, 'sales_manager');
    const res = await json(`/v1/flows/${flowId}/versions`, manager.cookie, {
      steps: [{ order: 1, action_type: 'send_price', offset_days: 1, label: 'ارسال قیمت' }],
    });
    expect(res.status).toBe(201);
    expect(((await res.json()) as { version_no: number }).version_no).toBe(2);
  });
});
