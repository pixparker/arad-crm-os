// Arad CRM-OS schema — platform-core scaffold (ADR-003 module map).
// 🔒 ADR-004: every tenant-scoped table carries `organization_id` NOT NULL and
// is queried only through orgScope(). The org-scope CI guard derives the
// tenant-table list from this file (tables with an `organizationId` column).
// Sales-core tables (accounts, leads, opportunities, activities, attribution,
// commission) land with their modules per the Phase-1 build order.

import { jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
// extensionless on purpose: drizzle-kit's CJS loader can't resolve .js-suffixed
// TS imports (moduleResolution Bundler allows this form everywhere else too)
import { uuidv7 } from './uuid';

const id = () => uuid('id').primaryKey().$defaultFn(uuidv7);
const createdAt = () =>
  timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow();

// ─── organizations (tenancy root — not itself tenant-scoped) ────────────────

export const organizationStatus = pgEnum('organization_status', ['active', 'suspended']);

export const organizations = pgTable('organizations', {
  id: id(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  status: organizationStatus('status').notNull().default('active'),
  createdAt: createdAt(),
});

// ─── users (platform-level identity; org membership is the tenant link) ─────

export const userStatus = pgEnum('user_status', ['invited', 'active', 'disabled']);

export const users = pgTable('users', {
  id: id(),
  // Normalized Iranian mobile (@arad/auth-otp normalizeMobile) — unique login key.
  phone: text('phone').notNull().unique(),
  displayName: text('display_name').notNull().default(''),
  status: userStatus('status').notNull().default('invited'),
  createdAt: createdAt(),
});

// ─── org membership + teams (ADR-005 roles; 🔒 static catalog) ──────────────

export const orgMemberRole = pgEnum('org_member_role', [
  'visitor_seller',
  'followup_seller',
  'sales_manager',
  'owner_admin',
  'deployment_ops',
  'finance',
]);

export const teams = pgTable('teams', {
  id: id(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id),
  name: text('name').notNull(),
  createdAt: createdAt(),
});

export const orgMembers = pgTable(
  'org_members',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    role: orgMemberRole('role').notNull(),
    teamId: uuid('team_id').references(() => teams.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('org_members_org_user_unique').on(t.organizationId, t.userId)],
);

// ─── audit log (ADR-011 🔒 append-only; written in the same tx as the change) ─

export const auditLog = pgTable('audit_log', {
  id: id(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id),
  actorUserId: uuid('actor_user_id').references(() => users.id),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  before: jsonb('before'),
  after: jsonb('after'),
  reason: text('reason'),
  correlationId: text('correlation_id'),
  createdAt: createdAt(),
});
