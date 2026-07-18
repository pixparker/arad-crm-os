// react-query bindings for the admin surface — every HTTP call goes through
// apiFetch (cookie session, correlation id, contract-shaped errors).

'use client';

import type {
  MeResponse,
  Role,
  commissionEntrySchema,
  funnelResponseSchema,
  importLeadsResponseSchema,
  leadSchema,
  teamMemberSchema,
  teamPerformanceResponseSchema,
  territorySchema,
} from '@arad-crm/api-contracts';
import { apiFetch } from '@arad-crm/web-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';

export type Lead = z.infer<typeof leadSchema>;
export type Territory = z.infer<typeof territorySchema>;
export type TeamMember = z.infer<typeof teamMemberSchema>;
export type CommissionEntry = z.infer<typeof commissionEntrySchema>;
export type FunnelResponse = z.infer<typeof funnelResponseSchema>;
export type TeamPerformanceResponse = z.infer<typeof teamPerformanceResponseSchema>;
export type PerformanceRow = TeamPerformanceResponse['rows'][number];
export type ImportResult = z.infer<typeof importLeadsResponseSchema>;

export const ADMIN_ROLES: readonly Role[] = ['sales_manager', 'owner_admin', 'finance'];
export const isAdminRole = (role: Role): boolean => ADMIN_ROLES.includes(role);

export const qk = {
  me: ['me'] as const,
  funnel: ['reports', 'funnel'] as const,
  performance: ['reports', 'team-performance'] as const,
  leads: (view: 'all' | 'unassigned') => ['leads', view] as const,
  territories: ['org', 'territories'] as const,
  team: ['org', 'team'] as const,
  commission: ['commission', 'entries'] as const,
  account: (id: string) => ['accounts', id] as const,
};

// ── queries ─────────────────────────────────────────────────────────────────

export const useMe = () =>
  useQuery({
    queryKey: qk.me,
    queryFn: () => apiFetch<MeResponse>('/v1/auth/me'),
    staleTime: 5 * 60_000,
  });

export const useFunnel = () =>
  useQuery({
    queryKey: qk.funnel,
    queryFn: () => apiFetch<FunnelResponse>('/v1/reports/funnel'),
  });

export const useTeamPerformance = () =>
  useQuery({
    queryKey: qk.performance,
    queryFn: () => apiFetch<TeamPerformanceResponse>('/v1/reports/team-performance'),
  });

export const useLeads = (view: 'all' | 'unassigned') =>
  useQuery({
    queryKey: qk.leads(view),
    queryFn: () => apiFetch<{ items: Lead[] }>(`/v1/leads?view=${view}`),
  });

export const useTerritories = () =>
  useQuery({
    queryKey: qk.territories,
    queryFn: () => apiFetch<{ items: Territory[] }>('/v1/org/territories'),
  });

export const useTeam = () =>
  useQuery({
    queryKey: qk.team,
    queryFn: () => apiFetch<{ items: TeamMember[] }>('/v1/org/team'),
  });

export const useCommissionEntries = () =>
  useQuery({
    queryKey: qk.commission,
    queryFn: () => apiFetch<{ items: CommissionEntry[] }>('/v1/commission/entries'),
  });

export interface AccountDetail {
  account: {
    id: string;
    name: string;
    business_type: string | null;
    phone: string | null;
    region_text: string | null;
    address_text: string | null;
    source: string;
    status: string;
    created_at: string;
  };
  timeline: { id: string; kind: string; occurred_at: string; seller_name: string | null }[];
  attribution: { seller_id: string; seller_name: string; first_touch_at: string } | null;
}

export const useAccount = (id: string | null) =>
  useQuery({
    queryKey: qk.account(id ?? 'none'),
    queryFn: () => apiFetch<AccountDetail>(`/v1/accounts/${id}`),
    enabled: id !== null,
  });

// ── mutations ───────────────────────────────────────────────────────────────

export const useAssignLead = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { leadId: string; seller_id: string; override_territory: boolean }) =>
      apiFetch<{ ok: true }>(`/v1/leads/${input.leadId}/assign`, {
        method: 'POST',
        body: { seller_id: input.seller_id, override_territory: input.override_territory },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['leads'] });
      void qc.invalidateQueries({ queryKey: qk.funnel });
    },
  });
};

export interface ImportRow {
  business_name: string;
  phone?: string;
  region_text?: string;
  address_text?: string;
  business_type?: string;
  external_rating?: string;
}

export const useImportLeads = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { default_territory_id?: string; rows: ImportRow[] }) =>
      apiFetch<ImportResult>('/v1/leads/import', {
        method: 'POST',
        body: { source: 'csv_import', ...input },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });
};

export const useCreateTerritory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string }) =>
      apiFetch<Territory>('/v1/org/territories', {
        method: 'POST',
        body: { name: input.name, kind: 'city' },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.territories });
    },
  });
};

export interface CreateMemberInput {
  phone: string;
  display_name: string;
  role: Role;
  contract_type: 'full_time' | 'part_time';
  territory_id?: string;
}

export const useCreateMember = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMemberInput) =>
      apiFetch<{ ok: true; user_id: string }>('/v1/org/team', { method: 'POST', body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.team });
    },
  });
};

export const useApproveEntry = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; reason?: string }) =>
      apiFetch<{ ok: true; status: string }>(`/v1/commission/entries/${input.id}/approve`, {
        method: 'POST',
        body: input.reason ? { reason: input.reason } : {},
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.commission });
    },
  });
};

export const useMarkPaid = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string }) =>
      apiFetch<{ ok: true; status: string }>(`/v1/commission/entries/${input.id}/mark-paid`, {
        method: 'POST',
        body: {},
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.commission });
    },
  });
};

export const useLogout = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<{ ok: true }>('/v1/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      qc.clear();
    },
  });
};
