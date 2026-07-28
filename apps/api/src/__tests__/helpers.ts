// db-test helpers: seed an org world + mint real session cookies (the full
// auth path — tests hit HTTP like the apps do).

import type { Role } from '@arad-crm/api-contracts';
import {
  commissionPlanVersions,
  commissionPlans,
  db,
  orgMembers,
  organizations,
  territories,
  users,
} from '@arad-crm/db';
import { issueSession } from '@arad/auth-otp';
import { eq } from 'drizzle-orm';
import { sessionDeps } from '../lib/auth-wiring.js';
import { SESSION_COOKIE } from '../middleware/session.js';

// Digits only: tests build phone numbers out of `runId.slice(-4)`, and a
// separator or a short random suffix landed a non-digit in the middle of one —
// a flake that only appeared when Math.random() rolled a short number.
//
// That tail is the whole namespace separating one test FILE's phone numbers
// from another's, and files run in parallel workers. A random tail collides on
// the birthday problem — around once every few hundred runs with eight files,
// which is exactly often enough to look like a real bug. The pid cannot:
// concurrent workers never share one.
export const runId = `${Date.now()}${String(process.pid % 10_000).padStart(4, '0')}`;
let phoneCounter = 0;

export interface World {
  orgId: string;
  territoryA: string;
  territoryB: string;
}

export const seedWorld = async (): Promise<World> => {
  const org = (
    await db
      .insert(organizations)
      .values({ name: 'تست', slug: `api-${runId}` })
      .returning()
  )[0];
  if (!org) throw new Error('org seed failed');
  const [a, b] = await db
    .insert(territories)
    .values([
      { organizationId: org.id, name: `تهران-${runId}`, kind: 'city' as const },
      { organizationId: org.id, name: `کرج-${runId}`, kind: 'city' as const },
    ])
    .returning();
  if (!a || !b) throw new Error('territory seed failed');
  const plan = (
    await db
      .insert(commissionPlans)
      .values({ organizationId: org.id, name: 'پلن تست', active: 1 })
      .returning()
  )[0];
  if (plan) {
    await db.insert(commissionPlanVersions).values({
      organizationId: org.id,
      planId: plan.id,
      versionNo: 1,
      rules: { rules: [{ type: 'percent_of_net', percent_bp: 1500 }] },
      effectiveFrom: new Date('2020-01-01T00:00:00Z'),
    });
  }
  return { orgId: org.id, territoryA: a.id, territoryB: b.id };
};

/** A real session cookie for an existing user — the same issuer the login route uses. */
export const cookieFor = async (userId: string): Promise<string> => {
  const row = (await db.select().from(users).where(eq(users.id, userId)))[0];
  if (!row) throw new Error('user not found');
  const token = await issueSession(sessionDeps, {
    id: row.id,
    mobile: row.phone,
    sessionVersion: row.sessionVersion,
  });
  return `${SESSION_COOKIE}=${token.token}`;
};

export const makeMember = async (
  world: World,
  role: Role,
  territoryId: string | null = null,
): Promise<{ userId: string; cookie: string }> => {
  phoneCounter++;
  const phone = `+98935${String(phoneCounter).padStart(3, '0')}${runId.slice(-4)}`;
  const user = (
    await db
      .insert(users)
      .values({ phone, displayName: `کاربر ${role}`, status: 'active' })
      .returning()
  )[0];
  if (!user) throw new Error('user seed failed');
  await db.insert(orgMembers).values({
    organizationId: world.orgId,
    userId: user.id,
    role,
    ...(territoryId ? { territoryId } : {}),
  });
  const token = await issueSession(sessionDeps, {
    id: user.id,
    mobile: user.phone,
    sessionVersion: user.sessionVersion,
  });
  return { userId: user.id, cookie: `${SESSION_COOKIE}=${token.token}` };
};
