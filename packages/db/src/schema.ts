// Arad CRM-OS schema — platform-core + sales-core (ADR-003 module map).
// 🔒 ADR-004: every tenant-scoped table carries `organization_id` NOT NULL and
// is queried only through orgScope(). The org-scope CI guard derives the
// tenant-table list from this file (tables with an `organizationId` column).
// 🔒 Money = bigint Rial. 🔒 commission_entries / audit tables are append-only
// (ledger-integrity CI guard). Vertical-specific vocab (outcomes, stages,
// findings) lives in @arad-crm/vertical-mizro and is validated at the service
// layer — the schema stays vertical-agnostic (headless core).

import { sql } from 'drizzle-orm';
import {
  bigint,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
// extensionless on purpose: drizzle-kit's CJS loader can't resolve .js-suffixed
// TS imports (moduleResolution Bundler allows this form everywhere else too)
import { uuidv7 } from './uuid';

const id = () => uuid('id').primaryKey().$defaultFn(uuidv7);
const createdAt = () =>
  timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow();
const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const rial = (name: string) => bigint(name, { mode: 'bigint' });

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
  // @arad/auth-otp session invalidation counter (bump = revoke all sessions)
  sessionVersion: integer('session_version').notNull().default(1),
  lastLoginAt: tstz('last_login_at'),
  createdAt: createdAt(),
});

// OTP login sessions (@arad/auth-otp OtpSessionRepo port shape)
export const otpSessions = pgTable(
  'otp_sessions',
  {
    id: id(),
    mobile: text('mobile').notNull(),
    codeHash: text('code_hash').notNull(),
    attempts: integer('attempts').notNull().default(0),
    expiresAt: tstz('expires_at').notNull(),
    consumedAt: tstz('consumed_at'),
    createdAt: createdAt(),
  },
  (t) => [index('otp_sessions_mobile_idx').on(t.mobile, t.createdAt)],
);

// ─── org membership + teams + territories (ADR-005; dev spec §15) ───────────

export const orgMemberRole = pgEnum('org_member_role', [
  'visitor_seller',
  'followup_seller',
  'sales_manager',
  'owner_admin',
  'deployment_ops',
  'finance',
]);

export const contractType = pgEnum('contract_type', ['full_time', 'part_time']);

export const territoryKind = pgEnum('territory_kind', ['city', 'region', 'neighborhood', 'custom']);

export const territories = pgTable('territories', {
  id: id(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id),
  name: text('name').notNull(),
  kind: territoryKind('kind').notNull().default('city'),
  parentId: uuid('parent_id'),
  createdAt: createdAt(),
});

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
    // 🔒 seller's area — pick/visibility restriction (founder req #2)
    territoryId: uuid('territory_id').references(() => territories.id),
    contractType: contractType('contract_type').notNull().default('full_time'),
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

// ─── accounts (the cafes — «پرونده‌ها») ─────────────────────────────────────

export const accountStatus = pgEnum('account_status', [
  'prospect', // imported/known, not yet worked
  'in_funnel', // has an open lead/opportunity
  'customer', // detected sale (payment event) 🔒
  'inactive', // closed/lost/churned
]);

export const accounts = pgTable(
  'accounts',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    name: text('name').notNull(),
    businessType: text('business_type'), // cafe | restaurant | ... (vertical vocab)
    // normalized E.164; dedupe key when present (import + manual + seller-introduced)
    phone: text('phone'),
    contactName: text('contact_name'),
    contactRole: text('contact_role'),
    instagram: text('instagram'),
    addressText: text('address_text'),
    regionText: text('region_text'),
    territoryId: uuid('territory_id').references(() => territories.id),
    source: text('source').notNull().default('manual'), // manual | csv_import | seller | website | map_*
    externalRating: text('external_rating'), // e.g. نشان ۴٫۶ (import metadata)
    status: accountStatus('status').notNull().default('prospect'),
    // vertical findings (validated by @arad-crm/vertical-mizro findingsSchema)
    attributes: jsonb('attributes').notNull().default({}),
    // ── Mizro integration mirror (read-only product state, from events) ──
    mizroBusinessRef: text('mizro_business_ref'),
    mizroPlan: text('mizro_plan'),
    mizroSubscriptionStatus: text('mizro_subscription_status'),
    mizroSubscriptionEndsAt: tstz('mizro_subscription_ends_at'),
    totalPaidRial: rial('total_paid_rial').notNull().default(sql`0`),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('accounts_org_phone_unique').on(t.organizationId, t.phone),
    uniqueIndex('accounts_org_mizro_ref_unique').on(t.organizationId, t.mizroBusinessRef),
    index('accounts_org_territory_idx').on(t.organizationId, t.territoryId),
  ],
);

// ─── leads (pre-qualification; hard split from opportunities 🔒) ────────────

export const leadStatus = pgEnum('lead_status', [
  'new', // captured, unassigned
  'assigned', // has a seller
  'in_progress', // worked (visits/calls logged)
  'qualified', // converted → opportunity exists
  'lost',
  'future_followup',
]);

export const leads = pgTable(
  'leads',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id),
    assignedTo: uuid('assigned_to').references(() => users.id),
    status: leadStatus('status').notNull().default('new'),
    source: text('source').notNull().default('manual'),
    // 🔒 open-lead invariant: dated next action OR a close reason — never rot
    nextActionType: text('next_action_type'),
    nextActionAt: tstz('next_action_at'),
    closeReason: text('close_reason'),
    requestedFeatures: jsonb('requested_features'), // website-lead payload (E49)
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('leads_org_assigned_idx').on(t.organizationId, t.assignedTo, t.status),
    index('leads_org_next_action_idx').on(t.organizationId, t.nextActionAt),
  ],
);

// ─── opportunities (confirmed need+fit; the funnel proper) ──────────────────

export const opportunityStatus = pgEnum('opportunity_status', ['open', 'won', 'lost']);

export const opportunities = pgTable(
  'opportunities',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id),
    leadId: uuid('lead_id').references(() => leads.id),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id),
    stage: text('stage').notNull(), // vertical preset code (validated in service)
    status: opportunityStatus('status').notNull().default('open'),
    amountEstimateRial: rial('amount_estimate_rial'),
    winReason: text('win_reason'),
    lossReason: text('loss_reason'),
    lossNote: text('loss_note'),
    wonAt: tstz('won_at'),
    lostAt: tstz('lost_at'),
    // 'auto_from_payment' when the sale event arrived with no recorded opp 🔒
    wonVia: text('won_via'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('opps_org_owner_status_idx').on(t.organizationId, t.ownerId, t.status)],
);

// ─── activities (visits/calls/notes — the field truth) ─────────────────────

export const activityKind = pgEnum('activity_kind', ['visit', 'call', 'sms', 'note', 'system']);

export const activities = pgTable(
  'activities',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id),
    leadId: uuid('lead_id').references(() => leads.id),
    opportunityId: uuid('opportunity_id').references(() => opportunities.id),
    sellerId: uuid('seller_id').references(() => users.id),
    kind: activityKind('kind').notNull(),
    outcome: text('outcome'), // vertical taxonomy code (validated in service)
    note: text('note'),
    findings: jsonb('findings'), // raw per-visit findings (vertical-validated)
    nextActionType: text('next_action_type'),
    nextActionAt: tstz('next_action_at'),
    occurredAt: tstz('occurred_at').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('activities_org_account_idx').on(t.organizationId, t.accountId, t.occurredAt),
    index('activities_org_seller_idx').on(t.organizationId, t.sellerId, t.occurredAt),
  ],
);

// ─── attribution (the linchpin 🔒 — immutable links, append-only claims) ────

export const attributionLinks = pgTable(
  'attribution_links',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    sellerId: uuid('seller_id')
      .notNull()
      .references(() => users.id),
    token: text('token').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('attribution_links_token_unique').on(t.token),
    uniqueIndex('attribution_links_org_seller_unique').on(t.organizationId, t.sellerId),
  ],
);

export const attributionClaims = pgTable(
  'attribution_claims',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id),
    sellerId: uuid('seller_id')
      .notNull()
      .references(() => users.id),
    linkId: uuid('link_id').references(() => attributionLinks.id),
    source: text('source').notNull(), // qr | manual_first_touch | event
    firstTouchAt: tstz('first_touch_at').notNull(),
    createdAt: createdAt(),
  },
  // 🔒 first-touch wins: exactly one immutable claim per account
  (t) => [uniqueIndex('attribution_claims_org_account_unique').on(t.organizationId, t.accountId)],
);

// ─── integration inbox (ADR-006 🔒 idempotent, at-least-once) ───────────────

export const inboxStatus = pgEnum('inbox_status', [
  'pending',
  'processed',
  'skipped',
  'failed',
  'dead',
]);

export const integrationEventsInbox = pgTable(
  'integration_events_inbox',
  {
    id: id(),
    producer: text('producer').notNull(),
    eventId: text('event_id').notNull(),
    type: text('type').notNull(),
    version: integer('version').notNull(),
    payload: jsonb('payload').notNull(),
    status: inboxStatus('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    error: text('error'),
    receivedAt: createdAt(),
    processedAt: tstz('processed_at'),
  },
  (t) => [uniqueIndex('inbox_producer_event_unique').on(t.producer, t.eventId)],
);

// ─── commission (the crown jewel 🔒 ADR-007) ────────────────────────────────

export const commissionEntryType = pgEnum('commission_entry_type', [
  'earn',
  'reversal',
  'adjustment',
]);

export const commissionEntryStatus = pgEnum('commission_entry_status', [
  'estimated',
  'pending_finalization',
  'earned',
  'approved',
  'payable',
  'paid',
  'reversed',
  'disputed',
]);

export const commissionPlans = pgTable('commission_plans', {
  id: id(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id),
  name: text('name').notNull(),
  active: integer('active').notNull().default(1),
  createdAt: createdAt(),
});

// 🔒 immutable rule snapshots — a new version NEVER recomputes the past
export const commissionPlanVersions = pgTable(
  'commission_plan_versions',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    planId: uuid('plan_id')
      .notNull()
      .references(() => commissionPlans.id),
    versionNo: integer('version_no').notNull(),
    rules: jsonb('rules').notNull(), // @arad-crm/commission planRulesSchema
    effectiveFrom: tstz('effective_from').notNull(),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('plan_versions_plan_no_unique').on(t.planId, t.versionNo)],
);

// 🔒 append-only. No UPDATE of amounts ever; status moves ONLY via the
// commission store's transition() (ledger-integrity CI guard enforces).
export const commissionEntries = pgTable(
  'commission_entries',
  {
    id: id(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    sourceEventId: text('source_event_id').notNull(), // producer envelope id
    paymentRef: text('payment_ref'), // producer payment id (clawback lookup)
    beneficiaryUserId: uuid('beneficiary_user_id')
      .notNull()
      .references(() => users.id),
    role: text('role').notNull(), // closer | visitor | referrer
    entryType: commissionEntryType('entry_type').notNull(),
    amountRial: rial('amount_rial').notNull(), // signed (reversals negative)
    planVersionId: uuid('plan_version_id').references(() => commissionPlanVersions.id),
    accountId: uuid('account_id').references(() => accounts.id),
    opportunityId: uuid('opportunity_id').references(() => opportunities.id),
    status: commissionEntryStatus('status').notNull().default('earned'),
    // 🔒 explainability: inputs snapshot the money panel renders the formula from
    basis: jsonb('basis').notNull(),
    reversesEntryId: uuid('reverses_entry_id'),
    reason: text('reason'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('commission_idempotency_unique').on(
      t.organizationId,
      t.sourceEventId,
      t.beneficiaryUserId,
      t.entryType,
    ),
    index('commission_org_beneficiary_idx').on(t.organizationId, t.beneficiaryUserId, t.createdAt),
  ],
);

// 🔒 append-only status audit (from_status NULL on the initial insert)
export const commissionEntryStatusAudit = pgTable('commission_entry_status_audit', {
  id: id(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id),
  entryId: uuid('entry_id')
    .notNull()
    .references(() => commissionEntries.id),
  fromStatus: commissionEntryStatus('from_status'),
  toStatus: commissionEntryStatus('to_status').notNull(),
  actorUserId: uuid('actor_user_id').references(() => users.id),
  reason: text('reason'),
  createdAt: createdAt(),
});
