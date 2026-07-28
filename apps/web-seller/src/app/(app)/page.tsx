'use client';

// داشبورد — prototype screen ۰۲, the seller's home.
//
// Layout from the prototype: navy app bar (greeting + KPI strip), an overdue
// banner, today's tasks, «نیاز به توجه», the pipeline rollup. Data from
// `GET /v1/reports/dashboard` + `GET /v1/activities/today` — two requests
// because the day's list and the day's numbers change at different rates.
//
// Two deliberate departures from the prototype:
//   · «هدف این ماه» (۶ از ۸ معامله) is NOT here. Targets are not modelled
//     anywhere — no table, no endpoint — and a goal card with an invented
//     denominator is worse than no goal card. It lands with the targets module.
//   · «سرنخ‌های قابل برداشت» IS here, and the prototype has no such block. The
//     daily pick is founder requirement #2 and this is the only screen it lives
//     on; dropping it to match the mock would remove a feature, not a section.
//
// 🔒 Money arrives as a Rial digit-string and is displayed in Toman via BigInt
// division. Nothing on this screen parses an amount into a JS number.

import { EmptyState } from '@/components/empty-state';
import { ListSkeleton } from '@/components/skeleton';
import { useToast } from '@/components/toast';
import { faClock, faDate, faNum, formatToman, isToday, toFaDigits } from '@/lib/format';
import { nextActionLabel } from '@/lib/labels';
import type { LeadsResponse, TodayResponse } from '@/lib/types';
import { useCollapsedHeader } from '@/lib/use-collapsed-header';
import { useMe } from '@/lib/use-me';
import type { DashboardResponse } from '@arad-crm/api-contracts';
import { ApiError, apiFetch } from '@arad-crm/web-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';

const faWeekday = new Intl.DateTimeFormat('fa-IR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/** ۴۲٫۵ م. تومان — the headline number, read at arm's length. */
const compactToman = (rial: string): { value: string; unit: string } => {
  const toman = BigInt(rial) / 10n;
  if (toman >= 1_000_000n) {
    // one decimal of millions, derived by integer division — never a float on the rial
    const tenths = toman / 100_000n;
    const text = `${tenths / 10n}٫${tenths % 10n}`;
    return { value: toFaDigits(text), unit: 'م. تومان' };
  }
  return { value: faNum(Number(toman)), unit: 'تومان' };
};

export default function DashboardPage() {
  const compact = useCollapsedHeader();
  const me = useMe();
  const dash = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => apiFetch<DashboardResponse>('/v1/reports/dashboard'),
  });
  const today = useQuery({
    queryKey: ['today'],
    queryFn: () => apiFetch<TodayResponse>('/v1/activities/today'),
  });

  const firstName = me.data?.user.display_name.split(' ')[0] ?? '';
  const dueCount = dash.data?.due.today ?? today.data?.due_actions.length ?? 0;

  return (
    <main className="min-h-dvh pb-28">
      {/* ── app bar ─────────────────────────────────────────────────────────
          Pinned and collapsing, as in the prototype: past a nudge of scroll the
          KPI strip folds away and the greeting shrinks, so the day's list gets
          ~130px of screen back without losing the avatar or the header. */}
      <header
        data-compact={compact}
        className={`sticky top-0 z-30 rounded-b-[28px] bg-canopy px-5 pt-safe text-on-canopy transition-[padding] duration-300 ${
          compact ? 'pb-3' : 'pb-5'
        }`}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p
              className={`font-bold transition-all duration-300 ${compact ? 'text-[15px]' : 'text-lg'}`}
            >
              {firstName ? `سلام ${firstName} 👋` : 'سلام 👋'}
            </p>
            <p
              className={`overflow-hidden text-xs text-on-canopy-muted transition-all duration-300 ${
                compact ? 'mt-0 max-h-0 opacity-0' : 'mt-0.5 max-h-8 opacity-100'
              }`}
            >
              {faWeekday.format(new Date())}
              {dueCount > 0 ? ` · ${faNum(dueCount)} پیگیری برای امروز` : ' · پیگیری بازی نداری'}
            </p>
          </div>
          {/* The prototype puts the avatar here and routes it to the profile —
              the only way into «پروفایل» now that the tab bar has four tabs. */}
          <Link
            href="/me"
            aria-label="پروفایل من"
            className={`grid flex-none place-items-center rounded-full bg-white/15 font-bold transition-all duration-300 active:bg-white/25 ${
              compact ? 'h-8 w-8 text-[11px]' : 'h-10 w-10 text-[13px]'
            }`}
          >
            {me.data
              ? [...me.data.user.display_name.replace(/[‌\s]/g, '')].slice(0, 2).join('')
              : ''}
          </Link>
        </div>

        <div
          className={`grid grid-cols-3 gap-2 overflow-hidden transition-all duration-300 ${
            compact ? 'mt-0 max-h-0 opacity-0' : 'mt-5 max-h-32 opacity-100'
          }`}
        >
          {dash.isPending ? (
            [0, 1, 2].map((i) => (
              <div key={i} className="h-11 rounded-md bg-white/10" aria-hidden="true" />
            ))
          ) : dash.isError ? (
            <p className="col-span-3 text-xs text-on-canopy-muted">
              شاخص‌ها بارگیری نشد —{' '}
              <button
                type="button"
                onClick={() => dash.refetch()}
                className="font-semibold underline"
              >
                تلاش دوباره
              </button>
            </p>
          ) : (
            <>
              <Kpi {...compactToman(dash.data.kpis.pipeline_value_rial)} label="ارزش پایپلاین" />
              <Kpi value={faNum(dash.data.kpis.open_deals)} label="معاملهٔ باز" />
              <Kpi
                value={
                  dash.data.kpis.conversion_rate_pct === null
                    ? '—'
                    : `${faNum(dash.data.kpis.conversion_rate_pct)}٪`
                }
                label="نرخ تبدیل"
              />
            </>
          )}
        </div>
      </header>

      <div className="px-4">
        {/* ── overdue banner ────────────────────────────────────────────── */}
        {dash.data && dash.data.due.overdue > 0 && (
          <output className="mt-4 flex items-center gap-3 rounded-md border border-warning/25 bg-warning-soft p-3.5">
            <span className="grid h-9 w-9 flex-none place-items-center rounded-md bg-warning/15 text-warning">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M10.3 3.9 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
                <path d="M12 9v4M12 17v.2" />
              </svg>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-bold text-fg">
                {faNum(dash.data.due.overdue)} کار عقب افتاده
              </span>
              {dash.data.due.overdue_names.length > 0 && (
                <span className="mt-0.5 block truncate text-[11px] text-fg-muted">
                  {dash.data.due.overdue_names.join(' · ')}
                </span>
              )}
            </span>
          </output>
        )}

        {/* ── today's follow-ups ────────────────────────────────────────── */}
        <SectionHead title="کارهای امروز" count={today.data?.due_actions.length} />
        {today.isPending ? (
          <ListSkeleton rows={3} />
        ) : today.isError ? (
          <EmptyState
            title="برنامهٔ امروز بارگیری نشد"
            hint="اتصال را بررسی کن و دوباره تلاش کن."
            action={
              <button
                type="button"
                onClick={() => today.refetch()}
                className="rounded-md bg-primary px-5 py-2.5 text-sm font-bold text-primary-fg"
              >
                تلاش دوباره
              </button>
            }
          />
        ) : today.data.due_actions.length === 0 ? (
          <EmptyState
            tone="done"
            title="پیگیری بازی برای امروز نداری ✓"
            hint="با دکمهٔ ＋ سرنخ تازه ثبت کن یا از پایپلاین یک معامله را جلو ببر."
          />
        ) : (
          <ul className="overflow-hidden rounded-md border border-border bg-surface shadow-card">
            {today.data.due_actions.map((a, i) => (
              <li key={`${a.account_id}-${a.lead_id ?? 'account'}`}>
                <Link
                  href={`/accounts/${a.account_id}${a.lead_id ? `?lead=${a.lead_id}` : ''}`}
                  className={`flex items-start gap-3 p-3.5 transition active:bg-surface-2 ${
                    i > 0 ? 'border-t border-border' : ''
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{a.account_name}</span>
                    <span className="mt-1 block text-xs text-fg-muted">
                      {[a.action_type ? nextActionLabel(a.action_type) : null, a.region_text]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <span className="flex-none text-[11px] font-semibold">
                    {a.overdue ? (
                      <span className="rounded-full bg-danger-soft px-2 py-0.5 text-danger">
                        عقب‌افتاده
                      </span>
                    ) : a.due_at ? (
                      <span className="num text-fg-muted">
                        {isToday(a.due_at) ? faClock(a.due_at) : faDate(a.due_at)}
                      </span>
                    ) : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {/* ── needs attention ───────────────────────────────────────────── */}
        {dash.data && dash.data.attention.length > 0 && (
          <>
            <SectionHead title="نیاز به توجه" />
            <ul className="overflow-hidden rounded-md border border-border bg-surface shadow-card">
              {dash.data.attention.map((item, i) => (
                <li
                  key={`${item.kind}-${item.account_id ?? item.lead_id ?? i}`}
                  className={`flex items-center gap-3 p-3.5 ${i > 0 ? 'border-t border-border' : ''}`}
                >
                  <span
                    className={`h-2 w-2 flex-none rounded-full ${
                      item.severity === 'danger'
                        ? 'bg-danger'
                        : item.severity === 'warning'
                          ? 'bg-warning'
                          : 'bg-info'
                    }`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{item.title}</span>
                    <span className="mt-0.5 block truncate text-xs text-fg-muted">
                      {item.detail}
                    </span>
                  </span>
                  <span
                    className={`flex-none rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      item.severity === 'danger'
                        ? 'bg-danger-soft text-danger'
                        : item.severity === 'warning'
                          ? 'bg-warning-soft text-warning'
                          : 'bg-info-soft text-info'
                    }`}
                  >
                    {item.badge}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        {/* ── my pipeline ───────────────────────────────────────────────── */}
        <SectionHead title="پایپلاین من" href="/pipeline" hrefLabel="برد کامل" />
        {dash.isPending ? (
          <ListSkeleton rows={2} />
        ) : dash.isError ? null : (
          <div className="rounded-md border border-border bg-surface p-4 shadow-card">
            {dash.data.stages.map((stage) => {
              const max = Math.max(1, ...dash.data.stages.map((s) => s.count));
              const money = compactToman(stage.value_rial);
              return (
                <div key={stage.code} className="mb-3.5 last:mb-0">
                  <div className="flex items-baseline justify-between gap-2 text-[13px]">
                    <span className="font-medium">{stage.label}</span>
                    <span className="text-fg-muted">
                      <b className="num font-bold text-fg">{faNum(stage.count)}</b>
                      {stage.value_rial !== '0' && (
                        <>
                          {' · '}
                          <span className="num">{money.value}</span>
                          <span className="text-[11px]"> {money.unit}</span>
                        </>
                      )}
                    </span>
                  </div>
                  <span className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                    <span
                      className="block h-full rounded-full bg-primary"
                      style={{ width: `${Math.round((stage.count / max) * 100)}%` }}
                    />
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* ── commission this month ─────────────────────────────────────── */}
        {dash.data && (
          <>
            <SectionHead title="کمیسیون این ماه" href="/money" hrefLabel="دفتر کمیسیون" />
            <Link
              href="/money"
              className="flex items-center justify-between rounded-md border border-border bg-surface p-4 shadow-card"
            >
              <span>
                <span className="num block text-2xl font-bold">
                  {formatToman(dash.data.kpis.commission_month_rial)}
                </span>
                <span className="mt-0.5 block text-xs text-fg-muted">تومان — از ابتدای ماه</span>
              </span>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="text-fg-faint"
              >
                <path d="m15 18-6-6 6-6" />
              </svg>
            </Link>
          </>
        )}

        <PickableSection pickedToday={today.data?.picked_today ?? 0} />
      </div>
    </main>
  );
}

function Kpi({ value, unit, label }: { value: string; unit?: string; label: string }) {
  return (
    <span className="block">
      <span className="num block text-lg font-bold leading-tight">
        {value}
        {unit ? <small className="ms-1 text-[10px] font-medium opacity-70">{unit}</small> : null}
      </span>
      <span className="mt-0.5 block text-[11px] text-on-canopy-muted">{label}</span>
    </span>
  );
}

function SectionHead({
  title,
  count,
  href,
  hrefLabel,
}: {
  title: string;
  count?: number | undefined;
  href?: string;
  hrefLabel?: string;
}) {
  return (
    <div className="mb-3 mt-6 flex items-center gap-2">
      <h2 className="text-[15px] font-bold">{title}</h2>
      {count !== undefined && count > 0 && (
        <span className="num rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-fg-muted">
          {faNum(count)}
        </span>
      )}
      {href && (
        <Link
          href={href}
          className="ms-auto flex items-center gap-1 text-xs font-semibold text-primary-ink"
        >
          {hrefLabel}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
        </Link>
      )}
    </div>
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
      if (context?.previous) queryClient.setQueryData(['leads', 'pickable'], context.previous);
      if (err instanceof ApiError && err.status === 409) {
        toast('همین حالا توسط فروشندهٔ دیگری برداشته شد', 'danger');
      } else if (err instanceof ApiError && err.status === 403) {
        toast('این سرنخ خارج از منطقهٔ توست', 'danger');
      } else {
        toast('برداشتن سرنخ ناموفق بود — دوباره تلاش کن', 'danger');
      }
    },
    onSuccess: () => toast('سرنخ برداشته شد — به کارهای امروزت اضافه شد', 'success'),
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['leads', 'pickable'] }),
        queryClient.invalidateQueries({ queryKey: ['today'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
    },
  });

  if (pickable.isSuccess && pickable.data.items.length === 0) return null;

  return (
    <>
      <div className="mb-3 mt-6 flex items-center gap-2">
        <h2 className="text-[15px] font-bold">سرنخ‌های قابل برداشت</h2>
        {pickedToday > 0 && (
          <span className="ms-auto text-xs text-fg-muted">امروز {faNum(pickedToday)} برداشتی</span>
        )}
      </div>
      {pickable.isPending ? (
        <ListSkeleton rows={2} />
      ) : pickable.isError ? (
        <EmptyState title="فهرست سرنخ‌ها بارگیری نشد" hint="کمی بعد دوباره سر بزن." />
      ) : (
        <ul className="overflow-hidden rounded-md border border-border bg-surface shadow-card">
          {pickable.data.items.map((lead, i) => (
            <li
              key={lead.id}
              className={`flex items-center justify-between gap-3 p-3.5 ${
                i > 0 ? 'border-t border-border' : ''
              }`}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold">{lead.account_name}</span>
                <span className="mt-0.5 block text-xs text-fg-muted">
                  {lead.region_text ?? 'بدون منطقه'}
                </span>
              </span>
              <button
                type="button"
                disabled={pick.isPending}
                onClick={() => pick.mutate(lead.id)}
                className="flex-none rounded-full border border-primary px-4 py-2 text-[13px] font-bold text-primary-ink transition active:bg-primary active:text-primary-fg disabled:opacity-60"
              >
                برداشتن
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
