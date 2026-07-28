// CRM-OS environment schema — product-specific by design (ADR-002); the
// foundation stays neutral. Boot-time validation: fail fast and loud.

import { z } from 'zod';
import { loadDotenv } from './load-env.js';

loadDotenv();

export const envSchema = z
  .object({
    // @invariant-allow: local-enum env-config vocabulary, not an API shape
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),

    // api (Hono) listen port — 41xx block, offset from Mizro's 4000.
    API_PORT: z.coerce.number().int().positive().default(6100),

    // Session JWT secret. Optional at schema layer (web apps never need it);
    // surfaces that consume it call requireJwtSecret().
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 chars').optional(),
    SESSION_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(60 * 60 * 24 * 30),
    // Cookie Domain attr — unset on localhost (browsers reject Domain on bare
    // hostnames); set to the apex in lab/prod.
    COOKIE_DOMAIN: z.string().optional(),

    // OTP knobs — consumed by the identity module's @arad/auth-otp wiring.
    OTP_TTL_SECONDS: z.coerce.number().int().positive().default(180),
    OTP_REQUEST_COOLDOWN_SECONDS: z.coerce.number().int().positive().default(60),
    OTP_MAX_VERIFY_ATTEMPTS: z.coerce.number().int().positive().default(5),
    // Per-IP hourly cap on OTP requests. Configurable because behind a CDN edge
    // whose ranges aren't yet in Caddy's trusted_proxies, every user resolves to
    // the same edge IP and shares one bucket (ADR-013 / deploy/caddy) — a cap
    // sized for one user then locks out the whole team. The per-mobile cap (5/h)
    // is the real per-user protection; this is defence-in-depth.
    OTP_MAX_REQUESTS_PER_IP_HOUR: z.coerce.number().int().positive().default(30),

    // 🔒 Pinned login code for QA. Applies ONLY when SMS_PROVIDER=fake AND
    // NODE_ENV is not production — both conditions are re-checked at the wiring
    // site, and the api refuses to boot if this is set in production, because a
    // predictable code is a login for anyone who knows a phone number.
    //
    // Defaults to 1234 rather than being opt-in: with the fake sender the code
    // was already only as secret as stdout, and a QA pass that has to read a
    // server log for every login attempt is one people stop doing. Set it empty
    // (DEV_OTP_CODE=) to go back to random codes in dev.
    DEV_OTP_CODE: z
      .string()
      .regex(/^\d{4}$/, 'DEV_OTP_CODE must be exactly 4 digits')
      .or(z.literal(''))
      .default('1234'),

    // 'fake' logs codes to stdout (dev only). 'connect' routes through
    // @arad/connect: the provider, its credentials and its OTP template all live
    // in the `connections` store and are managed from the ops panel — never in
    // env (ADR-014 §3). 🔒 There is deliberately no third value: adding a
    // provider means registering an adapter, not adding an env vocabulary word.
    // @invariant-allow: local-enum env-config vocabulary, not an API shape
    SMS_PROVIDER: z.enum(['fake', 'connect']).default('fake'),

    // 🔒 Connect's master key (KEK): base64 of exactly 32 random bytes
    // (`openssl rand -base64 32`). Seals every per-connection DEK, so LOSING IT
    // MEANS LOSING EVERY STORED CREDENTIAL — back it up outside the host, and
    // rotate by re-sealing (the DEKs themselves never change). Required
    // whenever SMS_PROVIDER=connect; validated by @arad/connect at boot.
    CONNECT_MASTER_KEY: z.string().optional(),

    // ADR-006 integration: HMAC shared secret for the Mizro producer. Unset ⇒
    // the events endpoint refuses (503) — never accept unsigned events.
    MIZRO_WEBHOOK_SECRET: z.string().min(16).optional(),
    // Seller demo links: <DEMO_LINK_BASE>?ref=<attribution token> 🔒
    DEMO_LINK_BASE: z.string().url().default('https://mizro.ir/demo'),

    // Browser origins allowed to call the api with credentials (CORS). The web
    // apps are cross-ORIGIN (different port) though same-site on localhost, so an
    // explicit allowlist is required — '*' is illegal with credentials. Comma-
    // separated; lab/prod set their real hosts.
    //
    // All THREE dev apps, ops included: the default left `apps/ops` out, so a
    // developer with no WEB_ORIGINS in their .env got a CORS wall on the control
    // plane and nothing to explain it.
    WEB_ORIGINS: z
      .string()
      .default('http://localhost:6101,http://localhost:6102,http://localhost:6103')
      .transform((s) =>
        s
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean),
      ),
  })
  // 🔒 Cross-field: a pinned OTP code must never survive into production, and
  // neither must the fake sender. Both are refusals at BOOT rather than checks
  // at login — a misconfigured deploy fails to start, loudly, instead of
  // serving a login anyone can pass. The `.default('1234')` above means this
  // fires on a production deploy that simply never thought about the variable,
  // which is precisely the case a warning would not have caught.
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    if (env.DEV_OTP_CODE !== '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DEV_OTP_CODE'],
        message: 'must be empty in production — a pinned OTP code is a login for anyone',
      });
    }
    if (env.SMS_PROVIDER === 'fake') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SMS_PROVIDER'],
        message: "must not be 'fake' in production — codes would go to stdout, not to the user",
      });
    }
  });

export type Config = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const summary = parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('\n  ');
  // biome-ignore lint/suspicious/noConsoleLog: pre-logger boot phase
  console.log(`[config] invalid environment:\n  ${summary}`);
  process.exit(1);
}

export const config: Config = parsed.data;

/** Assert + return JWT_SECRET for surfaces that actually consume it. */
export const requireJwtSecret = (): string => {
  if (!config.JWT_SECRET) {
    throw new Error('[config] JWT_SECRET is required for this surface (auth/session).');
  }
  return config.JWT_SECRET;
};
