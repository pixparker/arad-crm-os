'use client';

// «عملکرد» — the keep-or-cut table (the founder's core question: who is
// profitable, who isn't). Sortable by attributed revenue, conversion, or
// efficiency (net revenue per field activity — normalizes part-time vs
// full-time). Below-median efficiency is flagged, not hidden.

import { Chip, EmptyState, ErrorState, PageHeader, TableSkeleton, Toman } from '@/components/ui';
import { type PerformanceRow, useTeamPerformance } from '@/lib/api';
import { CONTRACT_LABELS, faNumber } from '@/lib/format';
import { useMemo, useState } from 'react';

type SortKey = 'revenue' | 'conversion' | 'efficiency';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'revenue', label: 'درآمد منتسب' },
  { key: 'conversion', label: 'نرخ تبدیل' },
  { key: 'efficiency', label: 'بهره‌وری' },
];

const sortValue = (r: PerformanceRow, key: SortKey): bigint | number => {
  if (key === 'revenue') return BigInt(r.attributed_net_revenue_rial);
  if (key === 'efficiency') return BigInt(r.revenue_per_activity_rial);
  return r.conversion_pct;
};

const median = (nums: bigint[]): bigint => {
  if (nums.length === 0) return 0n;
  const sorted = [...nums].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const mid = Math.floor(sorted.length / 2);
  return sorted[mid] ?? 0n;
};

export default function PerformancePage() {
  const perf = useTeamPerformance();
  const [sort, setSort] = useState<SortKey>('revenue');

  const rows = useMemo(() => {
    const list = perf.data?.rows ?? [];
    return [...list].sort((a, b) => {
      const av = sortValue(a, sort);
      const bv = sortValue(b, sort);
      return av < bv ? 1 : av > bv ? -1 : 0;
    });
  }, [perf.data, sort]);

  const efficiencyMedian = useMemo(
    () => median(rows.map((r) => BigInt(r.revenue_per_activity_rial))),
    [rows],
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="رتبه‌بندی و عملکرد تیم"
        subtitle="کدام فروشنده بهتر عمل می‌کند — فروش، تبدیل، و بهره‌وری (درآمد بر هر بازدید/تماس)."
        actions={
          <div className="flex items-center gap-1 rounded-sm border border-border bg-surface p-0.5">
            {SORTS.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setSort(s.key)}
                className={`rounded-sm px-2.5 py-1 text-xs font-medium ${
                  sort === s.key ? 'bg-primary text-primary-fg' : 'text-fg-muted hover:bg-surface-2'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        }
      />

      <p className="rounded-md bg-surface-2 px-3 py-2 text-xs leading-5 text-fg-muted">
        «درآمد بر تعامل» = بهره‌وری هر بازدید/تماس. چون کمیسیون روی هر پرداخت است، فروشندهٔ خوب فقط
        نمی‌فروشد — مشتری را هم زنده نگه می‌دارد. ردیف‌های زیر میانهٔ بهره‌وری با هشدار مشخص‌اند.
      </p>

      <div className="overflow-hidden rounded-md border border-border bg-surface shadow-card">
        {perf.isPending ? (
          <TableSkeleton />
        ) : perf.isError ? (
          <ErrorState error={perf.error} onRetry={() => void perf.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="هنوز داده‌ای برای رتبه‌بندی نیست"
            hint="با ثبت اولین فعالیت‌ها پر می‌شود."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-start text-sm">
              <thead className="border-b border-border bg-surface-2 text-xs text-fg-muted">
                <tr>
                  <th className="px-3 py-2 text-start font-medium">#</th>
                  <th className="px-3 py-2 text-start font-medium">فروشنده</th>
                  <th className="px-3 py-2 text-start font-medium">بازدید ۳۰ر</th>
                  <th className="px-3 py-2 text-start font-medium">تماس ۳۰ر</th>
                  <th className="px-3 py-2 text-start font-medium">سرنخ باز</th>
                  <th className="px-3 py-2 text-start font-medium">باز/برنده</th>
                  <th className="px-3 py-2 text-start font-medium">تبدیل</th>
                  <th className="px-3 py-2 text-start font-medium">درآمد منتسب</th>
                  <th className="px-3 py-2 text-start font-medium">کمیسیون</th>
                  <th className="px-3 py-2 text-start font-medium">درآمد/تعامل</th>
                  <th className="px-3 py-2 text-start font-medium">مشتری فعال</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const lowEfficiency =
                    efficiencyMedian > 0n && BigInt(r.revenue_per_activity_rial) < efficiencyMedian;
                  return (
                    <tr
                      key={r.seller_id}
                      className={`border-b border-border last:border-b-0 ${
                        lowEfficiency ? 'bg-warning/5' : ''
                      }`}
                    >
                      <td className="px-3 py-2 font-bold text-fg-muted">{faNumber(i + 1)}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{r.display_name}</div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-fg-muted">
                          {r.territory_name ?? '—'}
                          <Chip tone="neutral">{CONTRACT_LABELS[r.contract_type]}</Chip>
                        </div>
                      </td>
                      <td className="px-3 py-2 tabular-nums">{faNumber(r.visits_30d)}</td>
                      <td className="px-3 py-2 tabular-nums">{faNumber(r.calls_30d)}</td>
                      <td className="px-3 py-2 tabular-nums">{faNumber(r.leads_assigned_open)}</td>
                      <td className="px-3 py-2 tabular-nums text-fg-muted">
                        {faNumber(r.opps_open)} / {faNumber(r.opps_won_total)}
                      </td>
                      <td className="px-3 py-2 font-medium tabular-nums">
                        {faNumber(r.conversion_pct)}٪
                      </td>
                      <td className="px-3 py-2">
                        <Toman rial={r.attributed_net_revenue_rial} />
                      </td>
                      <td className="px-3 py-2">
                        <Toman rial={r.commission_earned_rial} />
                      </td>
                      <td className="px-3 py-2">
                        <span className={lowEfficiency ? 'font-medium text-warning' : ''}>
                          <Toman rial={r.revenue_per_activity_rial} />
                        </span>
                      </td>
                      <td className="px-3 py-2 tabular-nums">{faNumber(r.active_customers)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
