// Preflight for a production env file: the first run of the deploy scripts is
// also their first test, and a bad `.env` is the likeliest way for it to fail —
// after images are built, pushed and restarted, in a form whose symptom (500s,
// no OTP, blocked CORS) is several steps from its cause.
//
// This validates a candidate file against the SAME `envSchema` the api boots
// with, then adds the production-only rules the schema deliberately leaves
// optional (JWT_SECRET is optional there because the web apps never need it).
//
//   pnpm env:check deploy/.env.production
//
// 🔒 Values are never printed — only key names and the reason. The file being
// checked holds every secret the deployment has.

import { readFileSync } from 'node:fs';
import { envSchema } from '@arad-crm/config';

const path = process.argv[2] ?? 'deploy/.env.production';

const parseEnvFile = (text: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value !== '') out[key] = value;
  }
  return out;
};

interface Problem {
  key: string;
  message: string;
}

const problems: Problem[] = [];
const warnings: Problem[] = [];

let text: string;
try {
  text = readFileSync(path, 'utf8');
} catch {
  console.error(`env:check — cannot read ${path}`);
  process.exit(1);
}

const env = parseEnvFile(text);

// mvpool writes these at `mvp:add` time and the deploy script rewrites the
// image pin per release, so a template that lacks them is not yet wrong.
const PROVISIONED = ['DATABASE_URL', 'REDIS_URL', 'REGISTRY', 'IMAGE_TAG'];
const filled = { ...env };
for (const key of PROVISIONED) {
  if (!filled[key]) {
    warnings.push({ key, message: 'absent — expected to be provisioned on the host' });
    // Satisfy the schema with a placeholder so the rest of the file is still
    // checked; the warning above is what the reader acts on.
    if (key === 'DATABASE_URL') filled[key] = 'postgres://placeholder@localhost:5432/placeholder';
    if (key === 'REDIS_URL') filled[key] = 'redis://localhost:6379/0';
  }
}

const parsed = envSchema.safeParse(filled);
if (!parsed.success) {
  for (const issue of parsed.error.errors) {
    problems.push({ key: issue.path.join('.') || '(root)', message: issue.message });
  }
}

const isProduction = filled.NODE_ENV === 'production';

if (isProduction) {
  // The api and ops both mint sessions; without this every login 500s.
  if (!filled.JWT_SECRET) {
    problems.push({ key: 'JWT_SECRET', message: 'required in production (session signing)' });
  }
  // 🔒 ADR-013 §3: set on both the write and the delete, or logout silently
  // does nothing — invisible in dev, where it is unset on purpose.
  if (!filled.COOKIE_DOMAIN) {
    problems.push({
      key: 'COOKIE_DOMAIN',
      message: 'required in production — logout cannot delete a cookie it cannot name',
    });
  } else if (!filled.COOKIE_DOMAIN.startsWith('.')) {
    warnings.push({
      key: 'COOKIE_DOMAIN',
      message: 'no leading dot — one login will not cover sibling subdomains',
    });
  }
  // 🔒 'fake' in production means a seller in the field never receives a code.
  if (filled.SMS_PROVIDER !== 'connect') {
    problems.push({
      key: 'SMS_PROVIDER',
      message: `must be 'connect' in production (found '${filled.SMS_PROVIDER ?? 'unset'}')`,
    });
  }
  if (!filled.MIZRO_WEBHOOK_SECRET) {
    warnings.push({
      key: 'MIZRO_WEBHOOK_SECRET',
      message: 'unset — /v1/integrations/events refuses with 503 until it is set',
    });
  }
  for (const origin of filled.WEB_ORIGINS?.split(',').map((o) => o.trim()) ?? []) {
    if (origin && !origin.startsWith('https://')) {
      problems.push({ key: 'WEB_ORIGINS', message: `non-https origin: ${origin}` });
    }
  }
}

// 🔒 The KEK seals every stored credential. A wrong-length key does not fail
// until the first credential is written, which is deep into the ops session.
if (filled.SMS_PROVIDER === 'connect') {
  const key = filled.CONNECT_MASTER_KEY;
  if (!key) {
    problems.push({
      key: 'CONNECT_MASTER_KEY',
      message: 'required with SMS_PROVIDER=connect — the api refuses to boot without it',
    });
  } else {
    const bytes = Buffer.from(key, 'base64');
    if (bytes.length !== 32) {
      problems.push({
        key: 'CONNECT_MASTER_KEY',
        message: `must decode to exactly 32 bytes (got ${bytes.length}) — openssl rand -base64 32`,
      });
    }
  }
}

const report = (label: string, rows: Problem[]): void => {
  for (const row of rows) console.log(`  ${label} ${row.key}: ${row.message}`);
};

console.log(`env:check ${path}`);
if (problems.length === 0 && warnings.length === 0) {
  console.log('✓ production env looks deployable');
  process.exit(0);
}
report('⚠', warnings);
report('✗', problems);

if (problems.length > 0) {
  console.log(`\n${problems.length} blocking problem(s) — fix before deploying.`);
  process.exit(1);
}
console.log('\n✓ no blocking problems (warnings above are informational).');
