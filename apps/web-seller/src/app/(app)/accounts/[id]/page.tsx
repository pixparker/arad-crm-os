'use client';

// Account file: header + findings chips + «وضعیت در میزرو» read-only mirror +
// ★معرِّف immutable attribution + interaction timeline, with the primary
// action «ثبت بازدید / تماس». Everything a seller needs for the next touch.

import { EmptyState } from '@/components/empty-state';
import { ChevronLeftIcon, ClockIcon, NoteIcon, PhoneIcon } from '@/components/icons';
import { ListSkeleton } from '@/components/skeleton';
import { faDate, faRelativeTime, formatToman, toFaDigits } from '@/lib/format';
import {
  ACCOUNT_STATUS_FA,
  ACTIVITY_KIND_FA,
  SUBSCRIPTION_STATUS_FA,
  currentMenuLabel,
  nextActionLabel,
  offerHintLabel,
  outcomeLabel,
  segmentLabel,
} from '@/lib/labels';
import type { AccountDetailResponse } from '@/lib/types';
import { apiFetch } from '@arad-crm/web-shared';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';

const STATUS_TONE: Record<string, string> = {
  customer: 'bg-success/10 text-success',
  in_funnel: 'bg-primary/10 text-primary',
  prospect: 'bg-surface-2 text-fg-muted',
  inactive: 'bg-surface-2 text-fg-muted',
};

export default function AccountDetailPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const leadId = search.get('lead');

  const detail = useQuery({
    queryKey: ['accounts', params.id],
    queryFn: () => apiFetch<AccountDetailResponse>(`/v1/accounts/${params.id}`),
  });

  if (detail.isPending) {
    return (
      <main className="px-4 pb-28 pt-6">
        <div className="mb-6 h-24 animate-pulse rounded-md bg-surface-2" />
        <ListSkeleton rows={3} />
      </main>
    );
  }
  if (detail.isError) {
    return (
      <main className="px-4 pb-28 pt-6">
        <EmptyState title="پرونده بارگیری نشد" hint="کمی بعد دوباره تلاش کن." />
      </main>
    );
  }

  const { account, timeline, attribution } = detail.data;
  const attrs = account.attributes as {
    segment?: string;
    offer_hint?: string;
    current_menu?: string;
    interest_level?: number;
  };
  const chips: string[] = [];
  if (attrs.segment) chips.push(segmentLabel(attrs.segment));
  if (attrs.offer_hint) chips.push(`پیشنهاد ${offerHintLabel(attrs.offer_hint)}`);
  if (attrs.current_menu) chips.push(`منو: ${currentMenuLabel(attrs.current_menu)}`);
  const logHref = `/accounts/${account.id}/log${leadId ? `?lead=${leadId}` : ''}`;

  return (
    <main className="flex min-h-dvh flex-col px-4 pb-28 pt-6">
      <header className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="بازگشت"
          className="-ms-2 flex h-9 w-9 items-center justify-center rounded-full text-fg-muted active:bg-surface-2"
        >
          <ChevronLeftIcon className="h-6 w-6" />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-xl font-bold">{account.name}</h1>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
            STATUS_TONE[account.status] ?? 'bg-surface-2 text-fg-muted'
          }`}
        >
          {ACCOUNT_STATUS_FA[account.status] ?? account.status}
        </span>
      </header>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-fg-muted">
        {account.region_text ? <span>{account.region_text}</span> : null}
        {account.phone ? (
          <a
            href={`tel:${account.phone}`}
            dir="ltr"
            className="flex items-center gap-1 text-primary"
          >
            <PhoneIcon className="h-4 w-4" />
            {toFaDigits(account.phone)}
          </a>
        ) : null}
      </div>

      {chips.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {chips.map((c) => (
            <span
              key={c}
              className="rounded-full bg-surface-2 px-3 py-1 text-xs font-medium text-fg"
            >
              {c}
            </span>
          ))}
          {attrs.interest_level ? (
            <span className="rounded-full bg-surface-2 px-3 py-1 text-xs font-medium text-fg">
              علاقه {toFaDigits(String(attrs.interest_level))}/۵
            </span>
          ) : null}
        </div>
      ) : null}

      {/* «وضعیت در میزرو» — read-only product mirror */}
      {account.mizro.business_ref ? (
        <section className="mt-5 rounded-lg border border-border bg-surface shadow-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold">وضعیت در میزرو</h2>
            <span className="text-[11px] text-fg-muted">داده زندهٔ محصول · فقط‌خواندنی</span>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-fg-muted">پلن</dt>
              <dd className="font-medium">{account.mizro.plan ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-fg-muted">اشتراک</dt>
              <dd className="font-medium">
                {account.mizro.subscription_status
                  ? (SUBSCRIPTION_STATUS_FA[account.mizro.subscription_status] ??
                    account.mizro.subscription_status)
                  : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-fg-muted">مجموع پرداختی</dt>
              <dd className="font-bold">{formatToman(account.mizro.total_paid_rial)} ت</dd>
            </div>
          </dl>
        </section>
      ) : null}

      {/* ★معرِّف — immutable attribution */}
      {attribution ? (
        <section className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-primary">★ معرِّف (اسناد کمیسیون)</h2>
            <span className="text-[11px] font-medium text-fg-muted">🔒 غیرقابل‌تغییر</span>
          </div>
          <p className="mt-1.5 text-sm">
            {attribution.seller_name} — از {faDate(attribution.first_touch_at)}
          </p>
          <p className="mt-1 text-xs leading-5 text-fg-muted">
            این مشتری برای همیشه به این فروشنده منتسب است؛ کمیسیونِ هر پرداخت به او تعلق می‌گیرد.
          </p>
        </section>
      ) : null}

      {/* interaction timeline */}
      <section className="mt-6">
        <h2 className="mb-3 text-base font-bold">تاریخچهٔ تعامل</h2>
        {timeline.length === 0 ? (
          <EmptyState title="هنوز تعاملی ثبت نشده" hint="اولین بازدید یا تماس را ثبت کن." />
        ) : (
          <ol className="space-y-3">
            {timeline.map((ev) => (
              <li
                key={ev.id}
                className="rounded-md border border-border bg-surface shadow-card p-3.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <NoteIcon className="h-4 w-4 text-fg-muted" />
                    {ACTIVITY_KIND_FA[ev.kind] ?? ev.kind}
                    {ev.outcome ? (
                      <span className="text-fg-muted">· {outcomeLabel(ev.outcome)}</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-[11px] text-fg-muted">
                    {faRelativeTime(ev.occurred_at)}
                  </span>
                </div>
                {ev.note ? <p className="mt-1.5 text-sm leading-6">{ev.note}</p> : null}
                {ev.next_action_type && ev.next_action_at ? (
                  <p className="mt-1.5 flex items-center gap-1 text-xs text-primary">
                    <ClockIcon className="h-3.5 w-3.5" />
                    اقدام بعدی: {nextActionLabel(ev.next_action_type)} — {faDate(ev.next_action_at)}
                  </p>
                ) : null}
                {ev.seller_name ? (
                  <p className="mt-1 text-[11px] text-fg-muted">{ev.seller_name}</p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* primary action */}
      <div className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-md border-t border-border bg-surface p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <Link
          href={logHref}
          className="block w-full rounded-md bg-gradient-primary shadow-card py-3.5 text-center text-base font-bold text-primary-fg"
        >
          ثبت بازدید / تماس
        </Link>
      </div>
    </main>
  );
}
