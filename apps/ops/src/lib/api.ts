// react-query bindings for the control plane. Every call goes through
// apiFetch (cookie session, correlation id, contract-shaped errors) and every
// shape is inferred from @arad-crm/api-contracts — 🔒 the ops app never
// invents an endpoint or re-declares a response shape (ADR-008 / epic §5.1).

'use client';

import type {
  OpsMeResponse,
  OpsRole,
  auditEntrySchema,
  businessSchema,
  connectionEventSchema,
  connectionSchema,
  connectionTemplateSchema,
  inboxEventSchema,
  platformUserSchema,
  producerBindingSchema,
  providerSchema,
  settingViewSchema,
} from '@arad-crm/api-contracts';
import { ApiError, apiFetch } from '@arad-crm/web-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';

export type Business = z.infer<typeof businessSchema>;
export type PlatformUser = z.infer<typeof platformUserSchema>;
export type ProducerBinding = z.infer<typeof producerBindingSchema>;
export type ConnectionView = z.infer<typeof connectionSchema>;
export type ProviderView = z.infer<typeof providerSchema>;
export type ConnectionTemplate = z.infer<typeof connectionTemplateSchema>;
export type ConnectionEvent = z.infer<typeof connectionEventSchema>;
export type SettingView = z.infer<typeof settingViewSchema>;
export type AuditEntry = z.infer<typeof auditEntrySchema>;
export type InboxEvent = z.infer<typeof inboxEventSchema>;

export interface OpsStaff {
  id: string;
  phone: string;
  display_name: string;
  roles: OpsRole[];
  created_at: string;
}

export const qk = {
  me: ['ops', 'me'] as const,
  businesses: ['ops', 'businesses'] as const,
  bindings: ['ops', 'producer-bindings'] as const,
  users: (orgId?: string) => ['ops', 'users', orgId ?? 'all'] as const,
  staff: ['ops', 'ops-users'] as const,
  connections: ['ops', 'connections'] as const,
  providers: ['ops', 'providers'] as const,
  templates: (connectionId: string) => ['ops', 'connections', connectionId, 'templates'] as const,
  events: (connectionId: string) => ['ops', 'connections', connectionId, 'events'] as const,
  settings: ['ops', 'settings'] as const,
  audit: (orgId?: string) => ['ops', 'audit', orgId ?? 'all'] as const,
  inbox: (status?: string) => ['ops', 'inbox', status ?? 'all'] as const,
};

const list =
  <T>(path: string) =>
  () =>
    apiFetch<{ items: T[] }>(path).then((r) => r.items);

// ── identity ────────────────────────────────────────────────────────────────

/**
 * 401 here means "no ops axis", not "not logged in" — a tenant user with a
 * perfectly valid session gets it too. The layout turns it into a refusal
 * screen rather than a login loop.
 */
export const useOpsMe = () =>
  useQuery({
    queryKey: qk.me,
    queryFn: () => apiFetch<OpsMeResponse>('/v1/ops/me'),
    retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
    staleTime: 5 * 60_000,
  });

export const useLogout = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<{ ok: true }>('/v1/auth/logout', { method: 'POST' }),
    onSuccess: () => qc.clear(),
  });
};

// ── businesses ──────────────────────────────────────────────────────────────

export const useBusinesses = () =>
  useQuery({ queryKey: qk.businesses, queryFn: list<Business>('/v1/ops/businesses') });

export const useCreateBusiness = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; slug?: string; vertical_key?: string }) =>
      apiFetch<Business>('/v1/ops/businesses', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.businesses }),
  });
};

export const useSetBusinessStatus = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'suspended' }) =>
      apiFetch<Business>(`/v1/ops/businesses/${id}`, { method: 'PATCH', body: { status } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.businesses }),
  });
};

export const useProducerBindings = () =>
  useQuery({
    queryKey: qk.bindings,
    queryFn: list<ProducerBinding>('/v1/ops/businesses/producer-bindings'),
  });

export const useBindProducer = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      producer: 'mizro' | 'commerce' | 'crm';
      external_ref: string;
      organization_id: string;
      label?: string;
    }) =>
      apiFetch<ProducerBinding>('/v1/ops/businesses/producer-bindings', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.bindings }),
  });
};

// ── users & membership ──────────────────────────────────────────────────────

export const useUsers = (organizationId?: string) =>
  useQuery({
    queryKey: qk.users(organizationId),
    queryFn: list<PlatformUser>(
      organizationId ? `/v1/ops/users?organization_id=${organizationId}` : '/v1/ops/users',
    ),
  });

export const useCreateUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { phone: string; display_name: string }) =>
      apiFetch<PlatformUser>('/v1/ops/users', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ops', 'users'] }),
  });
};

export const useAssignMembership = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      userId,
      ...body
    }: {
      userId: string;
      organization_id: string;
      role: string;
      territory_id?: string | null;
    }) => apiFetch<PlatformUser>(`/v1/ops/users/${userId}/memberships`, { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ops', 'users'] }),
  });
};

export const useRemoveMembership = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, organizationId }: { userId: string; organizationId: string }) =>
      apiFetch<{ ok: true }>(`/v1/ops/users/${userId}/memberships/${organizationId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ops', 'users'] }),
  });
};

export const useSetUserStatus = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'disabled' }) =>
      apiFetch<PlatformUser>(`/v1/ops/users/${id}`, { method: 'PATCH', body: { status } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ops', 'users'] }),
  });
};

// ── ops staff (the second identity axis) ────────────────────────────────────

export const useOpsStaff = () =>
  useQuery({ queryKey: qk.staff, queryFn: list<OpsStaff>('/v1/ops/ops-users') });

export const useGrantOpsRole = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { user_id: string; role: OpsRole }) =>
      apiFetch<{ ok: true }>('/v1/ops/ops-users/grant', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.staff }),
  });
};

export const useRevokeOpsRole = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { user_id: string; role: OpsRole }) =>
      apiFetch<{ ok: true }>('/v1/ops/ops-users/revoke', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.staff }),
  });
};

// ── connected apps ──────────────────────────────────────────────────────────

export const useConnections = () =>
  useQuery({ queryKey: qk.connections, queryFn: list<ConnectionView>('/v1/ops/connections') });

export const useProviders = () =>
  useQuery({
    queryKey: qk.providers,
    queryFn: list<ProviderView>('/v1/ops/connections/providers'),
    staleTime: 60 * 60_000,
  });

// 🔒 `creds` travels one way only. Nothing in this file reads a credential
// back — the list response carries `cred_hint` and that is all there is.
export const useCreateConnection = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      provider: string;
      label: string;
      creds: Record<string, unknown>;
      type?: string;
    }) => apiFetch<ConnectionView>('/v1/ops/connections', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.connections }),
  });
};

export const useRotateCreds = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, creds }: { id: string; creds: Record<string, unknown> }) =>
      apiFetch<ConnectionView>(`/v1/ops/connections/${id}/rotate`, {
        method: 'POST',
        body: { creds },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.connections }),
  });
};

export const useSetConnectionStatus = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'disabled' }) =>
      apiFetch<ConnectionView>(`/v1/ops/connections/${id}/status`, {
        method: 'PATCH',
        body: { status },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.connections }),
  });
};

export interface TestResult {
  ok: boolean;
  latency_ms: number;
  error?: string;
  info?: string;
}

export const useTestConnection = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, to }: { id: string; to?: string }) =>
      apiFetch<TestResult>(`/v1/ops/connections/${id}/test`, {
        method: 'POST',
        body: to ? { to } : {},
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.connections }),
  });
};

export const useTemplates = (connectionId: string | null) =>
  useQuery({
    queryKey: qk.templates(connectionId ?? 'none'),
    queryFn: list<ConnectionTemplate>(`/v1/ops/connections/${connectionId}/templates`),
    enabled: Boolean(connectionId),
  });

export const useCreateTemplate = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      connectionId,
      ...body
    }: {
      connectionId: string;
      alias: string;
      provider_template_ref: string;
      code_var_name?: string | null;
      purpose?: string;
    }) =>
      apiFetch<ConnectionTemplate>(`/v1/ops/connections/${connectionId}/templates`, {
        method: 'POST',
        body,
      }),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: qk.templates(vars.connectionId) }),
  });
};

export const useTemplateTestSend = () =>
  useMutation({
    mutationFn: ({ templateId, to }: { templateId: string; to: string }) =>
      apiFetch<TestResult>(`/v1/ops/connections/templates/${templateId}/test-send`, {
        method: 'POST',
        body: { to },
      }),
  });

export const useConnectionEvents = (connectionId: string | null) =>
  useQuery({
    queryKey: qk.events(connectionId ?? 'none'),
    queryFn: list<ConnectionEvent>(`/v1/ops/connections/${connectionId}/events`),
    enabled: Boolean(connectionId),
  });

// ── platform settings ───────────────────────────────────────────────────────

export const useSettings = () =>
  useQuery({ queryKey: qk.settings, queryFn: list<SettingView>('/v1/ops/settings') });

export const useSetSetting = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) =>
      apiFetch<{ key: string; value: unknown }>(`/v1/ops/settings/${encodeURIComponent(key)}`, {
        method: 'PUT',
        body: { value },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.settings }),
  });
};

export const useResetSetting = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (key: string) =>
      apiFetch<{ key: string; value: unknown }>(`/v1/ops/settings/${encodeURIComponent(key)}`, {
        method: 'DELETE',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.settings }),
  });
};

// ── audit + integration inbox ───────────────────────────────────────────────

export const useAudit = (organizationId?: string) =>
  useQuery({
    queryKey: qk.audit(organizationId),
    queryFn: list<AuditEntry>(
      organizationId ? `/v1/ops/audit?organization_id=${organizationId}` : '/v1/ops/audit',
    ),
  });

export const useInbox = (status?: string) =>
  useQuery({
    queryKey: qk.inbox(status),
    queryFn: list<InboxEvent>(status ? `/v1/ops/inbox?status=${status}` : '/v1/ops/inbox'),
    refetchInterval: 30_000,
  });

export const useReplayEvent = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ ok: true }>(`/v1/ops/inbox/${id}/replay`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ops', 'inbox'] }),
  });
};

export const useReplayFailed = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ replayed: number }>('/v1/ops/inbox/replay-failed', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ops', 'inbox'] }),
  });
};

/** Turn any thrown value into a Persian line the ops screens can render. */
export const errorMessage = (err: unknown): string => {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'خطای ناشناخته';
};
