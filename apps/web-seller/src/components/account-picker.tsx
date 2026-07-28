'use client';

// «کدام پرونده؟» — the step the prototype's ＋ rows imply but never draw: a
// call, a visit, a note and an opportunity all attach to an existing account,
// and the seller has to say which one before there is a form to fill.
//
// Searches the same endpoint the list screen uses, so what appears here is
// exactly what the seller is allowed to see (own territory for a seller).

import { EmptyState } from '@/components/empty-state';
import { inputClass } from '@/components/field';
import { ListSkeleton } from '@/components/skeleton';
import type { AccountsResponse } from '@/lib/types';
import { apiFetch } from '@arad-crm/web-shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

export function AccountPicker({
  onPick,
  emptyHint,
}: {
  onPick: (accountId: string, name: string) => void;
  emptyHint?: string;
}) {
  const [q, setQ] = useState('');
  const accounts = useQuery({
    queryKey: ['accounts', q],
    queryFn: () =>
      apiFetch<AccountsResponse>(`/v1/accounts${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  });

  return (
    <div className="space-y-3">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="جست‌وجوی نام یا شماره…"
        aria-label="جست‌وجوی پرونده"
        className={inputClass(false)}
      />

      {accounts.isPending ? (
        <ListSkeleton rows={3} />
      ) : accounts.isError ? (
        <EmptyState title="فهرست پرونده‌ها بارگیری نشد" hint="اتصال را بررسی کن." />
      ) : accounts.data.items.length === 0 ? (
        <EmptyState
          title={q ? 'پرونده‌ای پیدا نشد' : 'هنوز پرونده‌ای ندارید'}
          hint={emptyHint ?? 'با دکمهٔ ＋ یک سرنخ یا مشتری ثبت کنید.'}
        />
      ) : (
        <ul className="overflow-hidden rounded-md border border-border bg-surface">
          {accounts.data.items.map((a, i) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => onPick(a.id, a.name)}
                className={`flex w-full items-center justify-between gap-3 p-3.5 text-start transition active:bg-surface-2 ${
                  i > 0 ? 'border-t border-border' : ''
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold">{a.name}</span>
                  <span className="mt-0.5 block truncate text-xs text-fg-muted">
                    {[a.region_text, a.phone].filter(Boolean).join(' · ') || 'بدون اطلاعات تماس'}
                  </span>
                </span>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="flex-none text-fg-faint"
                >
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
