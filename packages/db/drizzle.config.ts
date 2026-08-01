import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    // drizzle-kit generate is offline; url is only needed for push/studio.
    url: process.env.DATABASE_URL ?? 'postgres://arad:arad@localhost:5432/arad_crm',
  },
});
