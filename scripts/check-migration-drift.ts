/**
 * 🔒 ADR-011 guard: packages/db/src/schema.ts and packages/db/drizzle/ never
 * drift. Runs `drizzle-kit generate` (offline); if it produces a NEW migration,
 * the schema changed without `pnpm db:generate` — the probe output is removed
 * and the check fails. Git state stays untouched either way.
 */

import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const DRIZZLE_DIR = join(ROOT, 'packages/db/drizzle');

if (!existsSync(DRIZZLE_DIR)) {
  console.error(
    '✗ migration-drift guard: packages/db/drizzle missing — run `pnpm db:generate` and commit the initial migration.',
  );
  process.exit(1);
}

const snapshot = (): string[] => readdirSync(DRIZZLE_DIR, { recursive: true }) as string[];

const backup = mkdtempSync(join(tmpdir(), 'arad-crm-drizzle-'));
cpSync(DRIZZLE_DIR, backup, { recursive: true });
const before = new Set(snapshot());

try {
  execSync('pnpm --filter @arad-crm/db exec drizzle-kit generate --name drift_probe', {
    cwd: ROOT,
    stdio: 'pipe',
  });
} catch (err) {
  rmSync(DRIZZLE_DIR, { recursive: true, force: true });
  cpSync(backup, DRIZZLE_DIR, { recursive: true });
  rmSync(backup, { recursive: true, force: true });
  console.error('✗ migration-drift guard: drizzle-kit generate failed');
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

const drifted = snapshot().filter((f) => !before.has(f));

// restore the pre-probe state regardless of outcome
rmSync(DRIZZLE_DIR, { recursive: true, force: true });
cpSync(backup, DRIZZLE_DIR, { recursive: true });
rmSync(backup, { recursive: true, force: true });

if (drifted.length > 0) {
  console.error('✗ migration-drift guard: schema.ts changed without a generated migration');
  for (const f of drifted) {
    console.error(`  would create: packages/db/drizzle/${f}`);
  }
  console.error('  Fix: run `pnpm db:generate` and commit the migration WITH the schema change.');
  process.exit(1);
}

console.log('✓ migration-drift guard: schema and migrations in sync');
