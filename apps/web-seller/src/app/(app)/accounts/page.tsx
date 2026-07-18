'use client';

// «پرونده‌ها» — the seller's accounts, searchable. Scope is enforced server-
// side (own territory only), so this is just a thin, fast list + search.

import { EmptyState } from '@/components/empty-state';
import { StoreIcon } from '@/components/icons';
import { ListSkeleton } from '@/components/skeleton';
import { ACCOUNT_STATUS_FA } from '@/lib/labels';
import type { AccountsResponse } from '@/lib/types';
import { apiFetch } from '@arad-crm/web-shared';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';

const STATUS_TONE: Record<string, string> = {
  customer: 'bg-success/10 text-success',
  in_funnel: 'bg-primary/10 text-primary',
  prospect: 'bg-surface-2 text-fg-muted',
  inactive: 'bg-surface-2 text-fg-muted',
};

export default function AccountsPage() {
  const [q, setQ] = useState('');
  const accounts = useQuery({
    queryKey: ['accounts', q],
    queryFn: () =>
      apiFetch<AccountsResponse>(`/v1/accounts${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  });

  return (
    <main className="flex min-h-dvh flex-col px-4 pb-28 pt-6">
      <header className="mb-4">
        <h1 className="text-2xl font-bold">پرونده‌ها</h1>
      </header>

      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="جستجوی کافه یا شماره…"
        className="mb-4 w-full rounded-md border border-border bg-surface px-3.5 py-3 text-base outline-none focus:border-primary"
      />

      {accounts.isPending ? (
        <ListSkeleton rows={4} />
      ) : accounts.isError ? (
        <EmptyState title="فهرست پرونده‌ها بارگیری نشد" hint="کمی بعد دوباره تلاش کن." />
      ) : accounts.data.items.length === 0 ? (
        <EmptyState
          title={q ? 'موردی پیدا نشد' : 'هنوز پرونده‌ای نداری'}
          hint={q ? 'عبارت دیگری را امتحان کن.' : 'از «امروز من» یک سرنخ بردار تا این‌جا ظاهر شود.'}
        />
      ) : (
        <ul className="space-y-2.5">
          {accounts.data.items.map((a) => (
            <li key={a.id}>
              <Link
                href={`/accounts/${a.id}`}
                className="flex items-center gap-3 rounded-md border border-border bg-surface shadow-card p-3.5 active:bg-surface-2"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg-muted">
                  <StoreIcon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{a.name}</span>
                  <span className="block truncate text-xs text-fg-muted">
                    {a.region_text ?? a.business_type ?? '—'}
                  </span>
                </span>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                    STATUS_TONE[a.status] ?? 'bg-surface-2 text-fg-muted'
                  }`}
                >
                  {ACCOUNT_STATUS_FA[a.status] ?? a.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
