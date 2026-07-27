// Ops control-plane wire shapes (ADR-014). 🔒 The ops axis is separate from
// the tenant axis: nothing here reuses `roleSchema` (org membership) for ops
// authorization, and nothing on the tenant surface accepts an `opsRoleSchema`.
//
// 🔒 Credentials are write-only. A connection response carries `cred_hint`
// ("…1234") and never a credential — there is no response schema in this file
// with a field a secret could travel in.

import { z } from 'zod';
import { roleSchema } from './auth.js';

// ─── ops identity ───────────────────────────────────────────────────────────

export const opsRoleSchema = z.enum(['super_admin', 'onboarding_agent', 'support', 'finance']);
export type OpsRole = z.infer<typeof opsRoleSchema>;

export const opsMeResponseSchema = z.object({
  user: z.object({ id: z.string(), phone: z.string(), display_name: z.string() }),
  roles: z.array(opsRoleSchema),
});
export type OpsMeResponse = z.infer<typeof opsMeResponseSchema>;

export const grantOpsRoleBodySchema = z.object({
  user_id: z.string().uuid(),
  role: opsRoleSchema,
});

export const revokeOpsRoleBodySchema = grantOpsRoleBodySchema;

export const opsUserSchema = z.object({
  id: z.string(),
  phone: z.string(),
  display_name: z.string(),
  roles: z.array(opsRoleSchema),
  created_at: z.string().datetime(),
});
export type OpsUser = z.infer<typeof opsUserSchema>;

// ─── businesses (= organizations) ───────────────────────────────────────────

export const organizationStatusSchema = z.enum(['active', 'suspended']);

export const businessSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  status: organizationStatusSchema,
  vertical_key: z.string(),
  member_count: z.number().int(),
  created_at: z.string().datetime(),
});
export type Business = z.infer<typeof businessSchema>;

export const createBusinessBodySchema = z.object({
  name: z.string().min(2).max(120),
  // Optional: derived from the name when it is Latin-alphanumeric, required
  // when it is not (a Persian name slugifies to nothing — @arad/ops-tenant).
  slug: z.string().min(3).max(40).optional(),
  vertical_key: z.string().min(2).max(40).default('mizro'),
});

export const updateBusinessBodySchema = z.object({
  name: z.string().min(2).max(120).optional(),
  status: organizationStatusSchema.optional(),
});

// ─── users & membership ─────────────────────────────────────────────────────

export const userStatusSchema = z.enum(['invited', 'active', 'disabled']);

export const membershipSchema = z.object({
  organization_id: z.string(),
  organization_name: z.string(),
  role: roleSchema,
  territory_id: z.string().nullable(),
  created_at: z.string().datetime(),
});

export const platformUserSchema = z.object({
  id: z.string(),
  phone: z.string(),
  display_name: z.string(),
  status: userStatusSchema,
  is_ops: z.boolean(),
  memberships: z.array(membershipSchema),
  last_login_at: z.string().datetime().nullable(),
  created_at: z.string().datetime(),
});
export type PlatformUser = z.infer<typeof platformUserSchema>;

export const createUserBodySchema = z.object({
  // Any Iranian-mobile spelling; the api normalizes before storing.
  phone: z.string().min(10).max(20),
  display_name: z.string().max(120).default(''),
});

export const assignMembershipBodySchema = z.object({
  organization_id: z.string().uuid(),
  role: roleSchema,
  territory_id: z.string().uuid().nullable().optional(),
  contract_type: z.enum(['full_time', 'part_time']).default('full_time'),
});

export const updateUserBodySchema = z.object({
  display_name: z.string().max(120).optional(),
  status: userStatusSchema.optional(),
});

// ─── producer bindings (which tenant a producer's events belong to) ─────────

export const producerBindingSchema = z.object({
  id: z.string(),
  producer: z.string(),
  external_ref: z.string(),
  organization_id: z.string(),
  organization_name: z.string(),
  label: z.string(),
  created_at: z.string().datetime(),
});

export const createProducerBindingBodySchema = z.object({
  // @arad/platform-events producer vocabulary.
  producer: z.enum(['mizro', 'commerce', 'crm']),
  // The producer-side instance identifier; 'default' while one shared webhook
  // secret is still the door (ADR-014 §4).
  external_ref: z.string().min(1).max(80).default('default'),
  organization_id: z.string().uuid(),
  label: z.string().max(120).default(''),
});

// ─── connected apps ─────────────────────────────────────────────────────────

export const connectionCapabilitySchema = z.enum(['otp_send', 'sms_send']);
export const connectionTypeSchema = z.enum(['communication', 'payment', 'ai']);
export const connectionStatusSchema = z.enum(['active', 'disabled', 'error']);
export const templatePurposeSchema = z.enum(['otp', 'transactional', 'marketing']);

export const connectionHealthSchema = z.object({
  last_test_at: z.string().optional(),
  last_test_result: z.enum(['success', 'failure']).optional(),
  last_success_at: z.string().optional(),
  recent_errors: z
    .array(
      z.object({
        at: z.string(),
        class: z.string(),
        capability: z.string(),
        message: z.string().optional(),
      }),
    )
    .optional(),
});

export const connectionSchema = z.object({
  id: z.string(),
  type: connectionTypeSchema,
  provider: z.string(),
  label: z.string(),
  status: connectionStatusSchema,
  capabilities: z.array(connectionCapabilitySchema),
  health: connectionHealthSchema,
  // 🔒 The only credential-derived value that ever leaves the store.
  cred_hint: z.string().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type ConnectionView = z.infer<typeof connectionSchema>;

// Rendered by the ops add/rotate forms so a new provider ships its own form.
export const credFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  secret: z.boolean(),
  required: z.boolean(),
  placeholder: z.string().optional(),
  hint: z.string().optional(),
  kind: z.enum(['text', 'boolean']).optional(),
});

export const providerSchema = z.object({
  provider: z.string(),
  type: connectionTypeSchema,
  capabilities: z.array(connectionCapabilitySchema),
  template_support: z.enum(['required', 'optional', 'unsupported']),
  cred_fields: z.array(credFieldSchema),
});

export const createConnectionBodySchema = z.object({
  type: connectionTypeSchema.default('communication'),
  provider: z.string().min(2).max(40),
  label: z.string().min(1).max(120),
  // Write-only: shape is the adapter's `cred_fields`, validated by the adapter.
  creds: z.record(z.unknown()),
});

export const rotateCredsBodySchema = z.object({ creds: z.record(z.unknown()) });

export const updateConnectionStatusBodySchema = z.object({ status: connectionStatusSchema });

export const testConnectionBodySchema = z.object({
  // Falls back to the `connect.test_recipient_mobile` platform setting.
  to: z.string().min(10).max(20).optional(),
});

export const testResultSchema = z.object({
  ok: z.boolean(),
  latency_ms: z.number().int(),
  error: z.string().optional(),
  info: z.string().optional(),
});

export const connectionTemplateSchema = z.object({
  id: z.string(),
  connection_id: z.string(),
  alias: z.string(),
  purpose: templatePurposeSchema,
  provider_template_ref: z.string(),
  code_var_name: z.string().nullable(),
  is_active: z.boolean(),
  created_at: z.string().datetime(),
});

export const createTemplateBodySchema = z.object({
  alias: z.string().min(1).max(64),
  purpose: templatePurposeSchema.default('otp'),
  provider_template_ref: z.string().min(1).max(200),
  code_var_name: z.string().max(64).nullable().optional(),
});

export const updateTemplateBodySchema = z.object({
  alias: z.string().min(1).max(64).optional(),
  provider_template_ref: z.string().min(1).max(200).optional(),
  code_var_name: z.string().max(64).nullable().optional(),
  is_active: z.boolean().optional(),
});

export const templateTestSendBodySchema = z.object({ to: z.string().min(10).max(20) });

export const connectionEventSchema = z.object({
  id: z.string(),
  connection_id: z.string(),
  event: z.string(),
  actor_ops_user_id: z.string().nullable(),
  // Scrubbed at write time by @arad/connect — safe to render.
  meta: z.record(z.unknown()),
  created_at: z.string().datetime(),
});

// ─── platform settings ──────────────────────────────────────────────────────

export const settingViewSchema = z.object({
  key: z.string(),
  type: z.enum(['int', 'float', 'bool', 'string', 'enum', 'string[]', 'json']),
  value: z.unknown(),
  default: z.unknown(),
  group: z.string(),
  description: z.string(),
  access_level: z.enum(['ops_read', 'ops_write', 'founder_only']),
  constraints: z.record(z.unknown()),
  edit_note: z.string().nullable(),
  updated_at: z.string().datetime().nullable(),
  updated_by: z.string().nullable(),
  is_overridden: z.boolean(),
});

export const setSettingBodySchema = z.object({ value: z.unknown() });

// ─── audit + integration inbox ──────────────────────────────────────────────

export const auditEntrySchema = z.object({
  id: z.string(),
  organization_id: z.string().nullable(),
  organization_name: z.string().nullable(),
  actor_user_id: z.string().nullable(),
  actor_phone: z.string().nullable(),
  action: z.string(),
  entity_type: z.string(),
  entity_id: z.string(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  reason: z.string().nullable(),
  correlation_id: z.string().nullable(),
  created_at: z.string().datetime(),
});

export const inboxStatusSchema = z.enum(['pending', 'processed', 'skipped', 'failed', 'dead']);

export const inboxEventSchema = z.object({
  id: z.string(),
  producer: z.string(),
  event_id: z.string(),
  type: z.string(),
  version: z.number().int(),
  status: inboxStatusSchema,
  attempts: z.number().int(),
  error: z.string().nullable(),
  received_at: z.string().datetime(),
  processed_at: z.string().datetime().nullable(),
});
