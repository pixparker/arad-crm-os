'use client';

// داشبورد — KPI row + horizontal funnel (OPPORTUNITY_STAGES order, width by
// count). Values are Rial on the wire → Toman on screen.

import { ErrorState, PageHeader, Skeleton, Toman } from '@/components/ui';
import { useFunnel } from '@/lib/api';
import { faNumber } from '@/lib/format';
import { OPPORTUNITY_STAGES } from '@arad-crm/vertical-mizro';

function KpiCard({
  label,
  value,
  hint,
  valueClass = '',
}: {
  label: string;
  value: number;
  hint: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-md border border-border bg-surface shadow-card p-4">
      <p className="text-xs text-fg-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${valueClass}`}>{faNumber(value)}</p>
      <p className="mt-0.5 text-[11px] text-fg-muted">{hint}</p>
    </div>
  );
}

export default function DashboardPage() {
  const funnel = useFunnel();

  if (funnel.isPending) {
    return (
      <div className="space-y-4">
        <PageHeader title="داشبورد" subtitle="نمای مدیر — سرنخ‌ها و قیف فروش" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {['a', 'b', 'c', 'd'].map((k) => (
            <Skeleton key={k} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (funnel.error) {
    return (
      <div className="space-y-4">
        <PageHeader title="داشبورد" subtitle="نمای مدیر — سرنخ‌ها و قیف فروش" />
        <ErrorState error={funnel.error} onRetry={() => void funnel.refetch()} />
      </div>
    );
  }

  const data = funnel.data;
  const byCode = new Map(data.stages.map((s) => [s.stage, s]));
  // presets define the order; unknown stages (defensive) go to the end
  const known = OPPORTUNITY_STAGES.map((s) => ({
    code: s.code,
    label: s.label,
    count: byCode.get(s.code)?.count ?? 0,
    value_rial: byCode.get(s.code)?.value_rial ?? '0',
  }));
  const extras = data.stages
    .filter((s) => !OPPORTUNITY_STAGES.some((k) => k.code === s.stage))
    .map((s) => ({ code: s.stage, label: s.stage, count: s.count, value_rial: s.value_rial }));
  const stages = [...known, ...extras];
  const maxCount = Math.max(...stages.map((s) => s.count), 1);
  const totalOpen = stages.reduce((sum, s) => sum + s.count, 0);

  return (
    <div className="space-y-5">
      <PageHeader title="داشبورد" subtitle="نمای مدیر — سرنخ‌ها و قیف فروش" />

      <section aria-label="شاخص‌ها" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="سرنخ‌های تازه" value={data.leads_new} hint="در انتظار تخصیص" />
        <KpiCard label="در حال پیگیری" value={data.leads_assigned} hint="تخصیص‌یافته به فروشنده" />
        <KpiCard
          label="معاملات برنده"
          value={data.won_count}
          hint="از ابتدا تاکنون"
          valueClass="text-success"
        />
        <KpiCard
          label="از دست رفته"
          value={data.lost_count}
          hint="با دلیل ثبت‌شده"
          valueClass="text-danger"
        />
      </section>

      <section className="rounded-md border border-border bg-surface shadow-card p-5">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <div>
            <h2 className="text-base font-bold">قیف فروش</h2>
            <p className="mt-0.5 text-xs text-fg-muted">معاملات باز به تفکیک مرحله</p>
          </div>
          <p className="text-xs text-fg-muted">
            مجموع: <span className="font-medium text-fg">{faNumber(totalOpen)}</span> معامله
          </p>
        </div>

        {totalOpen === 0 ? (
          <div className="rounded-sm border border-dashed border-border px-4 py-10 text-center">
            <p className="text-sm font-medium">هنوز معامله‌ای در قیف نیست</p>
            <p className="mt-1 text-xs text-fg-muted">
              با تخصیص سرنخ به فروشنده‌ها و ثبت بازدید، معامله‌ها این‌جا شکل می‌گیرند.
            </p>
          </div>
        ) : (
          <ol className="space-y-2">
            {stages.map((s, i) => (
              <li key={s.code} className="flex items-center gap-3">
                <span className="w-32 shrink-0 truncate text-sm">{s.label}</span>
                <div className="h-8 min-w-0 flex-1 overflow-hidden rounded-sm bg-surface-2">
                  <div
                    className="flex h-full items-center rounded-sm bg-primary px-2"
                    style={{
                      width: `${s.count === 0 ? 0 : Math.max((s.count / maxCount) * 100, 6)}%`,
                      opacity: 1 - i * 0.1,
                    }}
                  >
                    {s.count > 0 ? (
                      <span className="text-xs font-bold text-primary-fg">{faNumber(s.count)}</span>
                    ) : null}
                  </div>
                </div>
                <span className="w-40 shrink-0 text-left text-xs text-fg-muted tabular-nums">
                  {s.count === 0 ? '—' : <Toman rial={s.value_rial} />}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
