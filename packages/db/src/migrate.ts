import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { closePool, db } from './client.js';

const here = dirname(fileURLToPath(import.meta.url));

const run = async (): Promise<void> => {
  await migrate(db, { migrationsFolder: join(here, '..', 'drizzle') });
  // biome-ignore lint/suspicious/noConsoleLog: CLI output
  console.log('[db] migrations applied');
  await closePool();
};

run().catch((err) => {
  console.error('[db] migration failed', err);
  process.exit(1);
});
