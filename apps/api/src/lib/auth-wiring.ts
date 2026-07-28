// Concrete ports for @arad/auth-otp (ADR-005): drizzle-backed repos, fake SMS
// sender (dev), closed registration gate (invite-only pilot — sellers are
// created by team management, never by open signup 🔒).

import { config, requireJwtSecret } from '@arad-crm/config';
import { db, otpSessions, users } from '@arad-crm/db';
import {
  type AuthConfig,
  type AuthDeps,
  MemoryRateLimitStore,
  type SessionDeps,
  type User,
} from '@arad/auth-otp';
import { sendOtp as connectSendOtp } from '@arad/connect';
import { logger } from '@arad/logger';
import { and, desc, eq, gt, gte, isNull, sql } from 'drizzle-orm';

const toAuthUser = (row: typeof users.$inferSelect): User => ({
  id: row.id,
  mobile: row.phone,
  sessionVersion: row.sessionVersion,
});

export const authConfig: AuthConfig = {
  otpTtlSeconds: config.OTP_TTL_SECONDS,
  otpRequestCooldownSeconds: config.OTP_REQUEST_COOLDOWN_SECONDS,
  otpMaxRequestsPerMobileHour: 5,
  otpMaxRequestsPerIpHour: config.OTP_MAX_REQUESTS_PER_IP_HOUR,
  otpMaxVerifyAttempts: config.OTP_MAX_VERIFY_ATTEMPTS,
  otpLockoutSeconds: 3600,
  sessionTtlSeconds: config.SESSION_TTL_SECONDS,
  jwtSecret: requireJwtSecret(),
  jwtAudience: 'arad-crm',
};

const userRepo: AuthDeps['userRepo'] = {
  async findByMobile(mobile) {
    const row = (await db.select().from(users).where(eq(users.phone, mobile)))[0];
    return row ? toAuthUser(row) : null;
  },
  async findById(id) {
    const row = (await db.select().from(users).where(eq(users.id, id)))[0];
    return row ? toAuthUser(row) : null;
  },
  async upsertByMobile({ mobile, touchLastLoginAt }) {
    const existing = (await db.select().from(users).where(eq(users.phone, mobile)))[0];
    if (existing) {
      await db
        .update(users)
        .set({
          ...(touchLastLoginAt ? { lastLoginAt: touchLastLoginAt } : {}),
          ...(existing.status === 'invited' ? { status: 'active' as const } : {}),
        })
        .where(eq(users.id, existing.id));
      return { user: toAuthUser(existing), isNewUser: false };
    }
    // registration gate is closed, so this only runs for gate-approved cases
    const inserted = await db
      .insert(users)
      .values({
        phone: mobile,
        status: 'active',
        ...(touchLastLoginAt ? { lastLoginAt: touchLastLoginAt } : {}),
      })
      .returning();
    const row = inserted[0];
    if (!row) throw new Error('user insert failed');
    return { user: toAuthUser(row), isNewUser: true };
  },
  async bumpSessionVersion(id) {
    const rows = await db
      .update(users)
      .set({ sessionVersion: sql`${users.sessionVersion} + 1` })
      .where(eq(users.id, id))
      .returning({ v: users.sessionVersion });
    return rows[0]?.v ?? 0;
  },
};

const otpSessionRepo: AuthDeps['otpSessionRepo'] = {
  async create({ mobile, codeHash, expiresAt }) {
    const rows = await db.insert(otpSessions).values({ mobile, codeHash, expiresAt }).returning();
    const row = rows[0];
    if (!row) throw new Error('otp session insert failed');
    return row;
  },
  async latestActive(mobile, now) {
    const rows = await db
      .select()
      .from(otpSessions)
      .where(
        and(
          eq(otpSessions.mobile, mobile),
          gt(otpSessions.expiresAt, now),
          isNull(otpSessions.consumedAt),
        ),
      )
      .orderBy(desc(otpSessions.createdAt))
      .limit(1);
    return rows[0] ?? null;
  },
  async incrementAttempts(id) {
    const rows = await db
      .update(otpSessions)
      .set({ attempts: sql`${otpSessions.attempts} + 1` })
      .where(eq(otpSessions.id, id))
      .returning({ attempts: otpSessions.attempts });
    return rows[0]?.attempts ?? 0;
  },
  async markConsumed(id, at) {
    await db.update(otpSessions).set({ consumedAt: at }).where(eq(otpSessions.id, id));
  },
  async countRequestsSince(mobile, since) {
    const rows = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(otpSessions)
      .where(and(eq(otpSessions.mobile, mobile), gte(otpSessions.createdAt, since)));
    return rows[0]?.n ?? 0;
  },
};

// Single-instance pilot: in-memory limiter. Swap to RedisRateLimitStore when
// the api scales past one process.
const rateLimitStore = new MemoryRateLimitStore();

// 🔒 The pinned QA code. Two independent conditions, both required, neither
// inferred from the other: NOT production, and the fake sender. `config` refuses
// to parse at all if DEV_OTP_CODE is set in production, so this is the second
// of two locks rather than the only one.
//
// `undefined` here means @arad/auth-otp falls back to its CSPRNG generator —
// the property is omitted, not set to a no-op, so there is no code path where a
// half-configured override yields a weak code.
const devOtpCode =
  config.NODE_ENV !== 'production' && config.SMS_PROVIDER === 'fake' && config.DEV_OTP_CODE !== ''
    ? config.DEV_OTP_CODE
    : null;

if (devOtpCode) {
  logger.warn(
    { code: devOtpCode },
    'OTP codes are PINNED to a fixed value for QA — development only, and the api refuses to boot this way in production',
  );
}

export const authDeps: AuthDeps = {
  userRepo,
  otpSessionRepo,
  rateLimitStore,
  ...(devOtpCode ? { codeGenerator: () => devOtpCode } : {}),
  // 🔒 E01-F05 — real delivery. With SMS_PROVIDER=connect the code goes out
  // through @arad/connect: provider, credentials and OTP template all resolved
  // from the `connections` store that ops manages, never from env. A send
  // failure PROPAGATES (the identity route turns it into a 5xx) — falling back
  // to a log line would make a delivery outage look like a working login.
  otpSender: {
    async sendOtp({ to, code, ttlSeconds }) {
      if (config.SMS_PROVIDER === 'fake') {
        logger.info({ to, code, ttlSeconds, provider: 'fake' }, 'OTP (fake sender)');
        return { messageId: `fake-${Date.now()}` };
      }
      const result = await connectSendOtp({ to, code, ttlSeconds });
      logger.info(
        {
          to,
          provider: result.viaProvider,
          connectionId: result.viaConnectionId,
          failover: result.failover ?? false,
        },
        'OTP sent',
      );
      return { messageId: result.messageId };
    },
  },
  auditLogger: {
    async log(event) {
      logger.info({ audit: event }, 'auth audit');
    },
  },
  clock: { now: () => new Date() },
  logger,
  config: authConfig,
  // 🔒 invite-only: unknown phones never create accounts
  registrationGate: {
    async evaluate() {
      return { allow: false, reason: 'invitation_required' };
    },
  },
};

export const sessionDeps: SessionDeps = {
  config: authConfig,
  userRepo,
  clock: authDeps.clock,
};
