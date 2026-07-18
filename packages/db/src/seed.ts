// Idempotent dev seed: the pilot organization. Sellers arrive via invites
// (ADR-005), not seeds.

import { closePool, db } from './client.js';
import { organizations } from './schema.js';

const run = async (): Promise<void> => {
  const inserted = await db
    .insert(organizations)
    .values({ name: 'آراد', slug: 'arad' })
    .onConflictDoNothing({ target: organizations.slug })
    .returning({ id: organizations.id });
  // biome-ignore lint/suspicious/noConsoleLog: CLI output
  console.log(
    inserted.length > 0
      ? `[db] seeded org arad (${inserted[0]?.id})`
      : '[db] org arad already present',
  );
  await closePool();
};

run().catch((err) => {
  console.error('[db] seed failed', err);
  process.exit(1);
});
