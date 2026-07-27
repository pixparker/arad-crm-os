// Idempotent dev/pilot seed: org + تهران territory + ONE commission plan
// (15% of net — the mock's rate; founder adjusts before pilot 🔒 plan-version
// discipline applies from v1) + optional owner login via SEED_OWNER_PHONE.

import { and, eq } from 'drizzle-orm';
import {
  closePool,
  commissionPlanVersions,
  commissionPlans,
  db,
  opsUserRoles,
  orgMembers,
  orgScope,
  organizations,
  producerBindings,
  territories,
  users,
} from './index.js';

const log = (msg: string): void => {
  // biome-ignore lint/suspicious/noConsoleLog: CLI output
  console.log(msg);
};

const run = async (): Promise<void> => {
  // org
  const inserted = await db
    .insert(organizations)
    .values({ name: 'آراد', slug: 'arad' })
    .onConflictDoNothing({ target: organizations.slug })
    .returning({ id: organizations.id });
  const org =
    inserted[0] ??
    (
      await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.slug, 'arad'))
    )[0];
  if (!org) throw new Error('org seed failed');
  log(`[db] org arad (${org.id})`);

  // territory تهران
  const existingTerritory = (
    await db
      .select()
      .from(territories)
      .where(and(orgScope(territories.organizationId, org.id), eq(territories.name, 'تهران')))
  )[0];
  const territory =
    existingTerritory ??
    (
      await db
        .insert(territories)
        .values({ organizationId: org.id, name: 'تهران', kind: 'city' })
        .returning()
    )[0];
  log(`[db] territory تهران (${territory?.id})`);

  // ONE commission plan, v1 = 15% of net (mock rate — founder-tunable)
  const existingPlan = (
    await db.select().from(commissionPlans).where(orgScope(commissionPlans.organizationId, org.id))
  )[0];
  if (!existingPlan) {
    const planRows = await db
      .insert(commissionPlans)
      .values({ organizationId: org.id, name: 'پلن پایه', active: 1 })
      .returning();
    const plan = planRows[0];
    if (!plan) throw new Error('plan seed failed');
    await db.insert(commissionPlanVersions).values({
      organizationId: org.id,
      planId: plan.id,
      versionNo: 1,
      rules: { rules: [{ type: 'percent_of_net', percent_bp: 1500 }] },
      effectiveFrom: new Date('2020-01-01T00:00:00Z'),
    });
    log('[db] commission plan «پلن پایه» v1 = 15% of net');
  } else {
    log('[db] commission plan already present');
  }

  // optional owner bootstrap: SEED_OWNER_PHONE=0912xxxxxxx pnpm db:seed
  const ownerPhone = process.env.SEED_OWNER_PHONE;
  if (ownerPhone) {
    const normalized = ownerPhone.startsWith('+')
      ? ownerPhone
      : `+98${ownerPhone.replace(/^0/, '')}`;
    const existingUser = (await db.select().from(users).where(eq(users.phone, normalized)))[0];
    const user =
      existingUser ??
      (
        await db
          .insert(users)
          .values({ phone: normalized, displayName: 'مالک', status: 'active' })
          .returning()
      )[0];
    if (user) {
      await db
        .insert(orgMembers)
        .values({ organizationId: org.id, userId: user.id, role: 'owner_admin' })
        .onConflictDoNothing({ target: [orgMembers.organizationId, orgMembers.userId] });
      log(`[db] owner ${normalized} ready — login via OTP`);
    }
  }

  // Producer binding: Mizro's events belong to this org (E01-F10). Without it
  // the worker falls back to "the only organization", which stops being right
  // the moment ops registers a second business.
  await db
    .insert(producerBindings)
    .values({ producer: 'mizro', externalRef: 'default', organizationId: org.id, label: 'میزرو' })
    .onConflictDoNothing({ target: [producerBindings.producer, producerBindings.externalRef] });
  log('[db] producer binding mizro/default → arad');

  // 🔒 Ops bootstrap: SEED_OPS_PHONE=0912xxxxxxx pnpm db:seed
  // The chicken-and-egg break for ADR-014 §1 — ops roles are granted from the
  // ops panel, which needs an ops user to log into. This is the ONLY path that
  // creates one without an existing super_admin, which is why it lives in the
  // seed (an operator with database access) and not behind an API route.
  const opsPhone = process.env.SEED_OPS_PHONE;
  if (opsPhone) {
    const normalized = opsPhone.startsWith('+') ? opsPhone : `+98${opsPhone.replace(/^0/, '')}`;
    const existing = (await db.select().from(users).where(eq(users.phone, normalized)))[0];
    const opsUser =
      existing ??
      (
        await db
          .insert(users)
          .values({ phone: normalized, displayName: 'اپراتور آراد', status: 'active', isOps: true })
          .returning()
      )[0];
    if (opsUser) {
      if (!opsUser.isOps) {
        await db.update(users).set({ isOps: true }).where(eq(users.id, opsUser.id));
      }
      await db
        .insert(opsUserRoles)
        .values({ userId: opsUser.id, role: 'super_admin' })
        .onConflictDoNothing({ target: [opsUserRoles.userId, opsUserRoles.role] });
      log(`[db] ops super_admin ${normalized} ready — login at the ops panel via OTP`);
    }
  }

  await closePool();
};

run().catch((err) => {
  console.error('[db] seed failed', err);
  process.exit(1);
});
