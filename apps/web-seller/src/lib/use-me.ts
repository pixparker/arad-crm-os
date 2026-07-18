'use client';

import type { MeResponse } from '@arad-crm/api-contracts';
import { apiFetch } from '@arad-crm/web-shared';
import { useQuery } from '@tanstack/react-query';

/** Session probe — 401 (no retry via shared client) means «برو به ورود». */
export const useMe = () =>
  useQuery({
    queryKey: ['me'],
    queryFn: () => apiFetch<MeResponse>('/v1/auth/me'),
    staleTime: 5 * 60_000,
  });
