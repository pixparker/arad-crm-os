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
import { sessionDeps } from '../lib/auth-wiring.js';
import { SESSION_COOKIE } from '../middleware/session.js';

export const runId = `${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
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
