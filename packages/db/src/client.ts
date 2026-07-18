import { config } from '@arad-crm/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

export const pool = new pg.Pool({ connectionString: config.DATABASE_URL });

export const db = drizzle(pool, { schema });

export type Db = typeof db;

export const closePool = async (): Promise<void> => {
  await pool.end();
};
