'use client';

// «امروز من» — the seller's day (product doc §7): due follow-ups, pickable
// leads with optimistic pick, and the + FAB for seller-introduced leads.

import { EmptyState } from '@/components/empty-state';
import { ClockIcon, PlusIcon } from '@/components/icons';
import { ListSkeleton, StatRowSkeleton } from '@/components/skeleton';
import { StatCard } from '@/components/stat-card';
import { useToast } from '@/components/toast';
import { faClock, faDate, faDateFull, faNum, isToday } from '@/lib/format';
import { nextActionLabel } from '@/lib/labels';
import type { LeadsResponse, TodayResponse } from '@/lib/types';
import { useMe } from '@/lib/use-me';
import { ApiError, apiFetch } from '@arad-crm/web-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';

export default function TodayPage() {
  const me = useMe();
  const today = useQuery({
    queryKey: ['today'],
    queryFn: () => apiFetch<TodayResponse>('/v1/activities/today'),
  });

  const firstName = me.data?.user.display_name.split(' ')[0] ?? '';

  return (
    <main className="flex min-h-dvh flex-col px-4 pb-28 pt-6">
      <header className="mb-5">
        <h1 className="text-2xl font-bold">{firstName ? `سلام ${firstName} 👋` : 'امروز من'}</h1>
        <p className="mt-1 text-sm text-fg-muted">{faDateFull(new Date())}</p>
      </header>

      {today.isPending ? (
        <>
          <StatRowSkeleton />
          <div className="mt-6">
            <ListSkeleton rows={3} />
          </div>
        </>
      ) : today.isError ? (
        <EmptyState
          title="برنامهٔ امروز بارگیری نشد"
          hint="اتصال را بررسی کن و دوباره تلاش کن."
          action={
            <button
              type="button"
              onClick={() => today.refetch()}
              className="rounded-md bg-gradient-primary shadow-card px-5 py-2.5 text-sm font-bold text-primary-fg"
            >
              تلاش دوباره
            </button>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label="پیگیری امروز"
              value={faNum(today.data.due_actions.length)}
              tone={today.data.due_actions.some((a) => a.overdue) ? 'warning' : 'primary'}
            />
            <StatCard label="معاملات باز" value={faNum(today.data.open_opportunities)} />
          </div>

          <section className="mt-6">
            <h2 className="mb-3 text-base font-bold">پیگیری‌های امروز</h2>
            {today.data.due_actions.length === 0 ? (
              <EmptyState
                tone="done"
                title="پیگیری بازی برای امروز نداری ✓"
                hint="از «سرنخ‌های قابل برداشت» پایین یکی بردار یا با دکمهٔ + سرنخ تازه ثبت کن."
              />
            ) : (
              <ul className="space-y-3">
                {today.data.due_actions.map((a) => (
                  <li key={`${a.account_id}-${a.lead_id ?? 'x'}`}>
                    <Link
                      href={`/accounts/${a.account_id}${a.lead_id ? `?lead=${a.lead_id}` : ''}`}
                      className="block rounded-md border border-border bg-surface shadow-card p-4 transition-colors active:bg-surface-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-bold">{a.account_name}</p>
                        {a.overdue ? (
                          <span className="shrink-0 rounded-full bg-danger/10 px-2.5 py-0.5 text-[11px] font-bold text-danger">
                            عقب‌افتاده
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
                        {a.region_text ? <span>{a.region_text}</span> : null}
                        {a.action_type ? (
                          <span className="font-medium text-primary">
                            {nextActionLabel(a.action_type)}
                          </span>
                        ) : null}
                        {a.due_at ? (
                          <span className="flex items-center gap-1">
                            <ClockIcon className="h-3.5 w-3.5" />
                            {isToday(a.due_at) ? faClock(a.due_at) : faDate(a.due_at)}
                          </span>
                        ) : null}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <PickableSection pickedToday={today.data.picked_today} />
        </>
      )}

      <Link
        href="/leads/new"
        aria-label="ثبت سرنخ جدید"
        className="fixed bottom-24 end-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-fg shadow-lg transition-transform active:scale-95"
      >
        <PlusIcon className="h-7 w-7" />
      </Link>
    </main>
  );
}

function PickableSection({ pickedToday }: { pickedToday: number }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const pickable = useQuery({
    queryKey: ['leads', 'pickable'],
    queryFn: () => apiFetch<LeadsResponse>('/v1/leads?view=pickable'),
  });

  // optimistic pick (ux-best-practices/optimistic-ui): remove instantly,
  // roll back + explain on failure (409 = someone else won the race).
  const pick = useMutation({
    mutationFn: (leadId: string) =>
      apiFetch<{ ok: true }>(`/v1/leads/${leadId}/pick`, { method: 'POST' }),
    onMutate: async (leadId) => {
      await queryClient.cancelQueries({ queryKey: ['leads', 'pickable'] });
      const previous = queryClient.getQueryData<LeadsResponse>(['leads', 'pickable']);
      queryClient.setQueryData<LeadsResponse>(['leads', 'pickable'], (old) =>
        old ? { items: old.items.filter((l) => l.id !== leadId) } : old,
      );
      return { previous };
    },
    onError: (err, _leadId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['leads', 'pickable'], context.previous);
      }
      if (err instanceof ApiError && err.status === 409) {
        toast('همین حالا توسط فروشندهٔ دیگری برداشته شد', 'danger');
      } else if (err instanceof ApiError && err.status === 403) {
        toast('این سرنخ خارج از منطقهٔ توست', 'danger');
      } else {
        toast('برداشتن سرنخ ناموفق بود — دوباره تلاش کن', 'danger');
      }
    },
    onSuccess: () => {
      toast('سرنخ برداشته شد — به پیگیری‌های امروزت اضافه شد', 'success');
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['leads', 'pickable'] }),
        queryClient.invalidateQueries({ queryKey: ['today'] }),
      ]);
    },
  });

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-base font-bold">سرنخ‌های قابل برداشت</h2>
        {pickedToday > 0 ? (
          <span className="text-xs text-fg-muted">امروز {faNum(pickedToday)} برداشتی</span>
        ) : null}
      </div>
      {pickable.isPending ? (
        <ListSkeleton rows={2} />
      ) : pickable.isError ? (
        <EmptyState title="فهرست سرنخ‌ها بارگیری نشد" hint="کمی بعد دوباره سر بزن." />
      ) : pickable.data.items.length === 0 ? (
        <EmptyState
          title="فعلاً سرنخ تازه‌ای در منطقهٔ تو نیست"
          hint="کافه‌ای سراغ داری که در فهرست نیست؟ با دکمهٔ + خودت ثبتش کن — معرفی‌ها به نام خودت سند می‌خورد."
        />
      ) : (
        <ul className="space-y-3">
          {pickable.data.items.map((lead) => (
            <li
              key={lead.id}
              className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface shadow-card p-4"
            >
              <div className="min-w-0">
                <p className="truncate font-bold">{lead.account_name}</p>
                <p className="mt-1 text-xs text-fg-muted">{lead.region_text ?? 'بدون منطقه'}</p>
              </div>
              <button
                type="button"
                disabled={pick.isPending}
                onClick={() => pick.mutate(lead.id)}
                className="shrink-0 rounded-full border border-primary px-4 py-2 text-sm font-bold text-primary transition-colors active:bg-primary active:text-primary-fg disabled:opacity-60"
              >
                برداشتن
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
