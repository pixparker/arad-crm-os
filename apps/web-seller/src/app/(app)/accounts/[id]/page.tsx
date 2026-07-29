'use client';

// «پروندهٔ مشتری» — prototype screen ۰۶. The one screen a seller opens standing
// in front of the café, so it leads with what to do, not with what is known:
// the quick-action row, then the next step, then the history.
//
// «قدم بعدی» is derived from the file's own timeline — the newest activity that
// left a dated promise — rather than being a field someone could edit to
// disagree with the log. Its «انجام شد» goes to the log screen instead of
// silently ticking: closing a commitment without recording what happened is how
// a CRM turns into a checklist 🔒.
//
// Departures from the prototype, each because the capability is not there:
//   · «پیامک» sends nothing — it opens the phone's own composer (sms:), which
//     is honest, and the outcome still gets logged like any other touch.
//   · «اسکن منو (۳۰ روز)» and «کمیسیون کسب‌شده» per file are not in the mirror
//     the product sends, so the card shows what is: plan, subscription, paid.

import { EmptyState } from '@/components/empty-state';
import { ClockIcon, NoteIcon, PhoneIcon, PlusIcon } from '@/components/icons';
import { Tag } from '@/components/list-bits';
import { ListSkeleton } from '@/components/skeleton';
import { Subhead } from '@/components/subhead';
import { faClock, faDate, faRelativeTime, formatToman, isToday, toFaDigits } from '@/lib/format';
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
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

// The reading column. Same as every sibling screen and, critically, the same as
// the one inside `Subhead` — otherwise from `md` up the header content and the
// body sit on two different axes.
const BODY = 'mx-auto w-full px-4 pb-6 md:max-w-3xl md:px-6';

const STATUS_TONE: Record<string, 'customer' | 'lead' | 'note'> = {
  customer: 'customer',
  in_funnel: 'lead',
  prospect: 'note',
  inactive: 'note',
};

function AccountDetail() {
  const params = useParams<{ id: string }>();
  const leadId = useSearchParams().get('lead');

  const detail = useQuery({
    queryKey: ['accounts', params.id],
    queryFn: () => apiFetch<AccountDetailResponse>(`/v1/accounts/${params.id}`),
  });

  if (detail.isPending) {
    return (
      <main className="min-h-dvh pb-28 md:pb-10">
        <div className="h-36 rounded-b-[24px] bg-canopy" />
        <div className={`${BODY} pt-5`}>
          <ListSkeleton rows={4} />
        </div>
      </main>
    );
  }
  if (detail.isError) {
    return (
      <main className="min-h-dvh px-4 pb-28 pt-16 md:pb-10">
        <EmptyState
          title="پرونده بارگیری نشد"
          hint="ممکن است خارج از دسترس شما باشد، یا اتصال قطع شده باشد."
          action={
            <Link
              href="/accounts"
              className="rounded-md bg-primary px-5 py-2.5 text-sm font-bold text-primary-fg"
            >
              بازگشت به فهرست
            </Link>
          }
        />
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
  // A file that is not yet a paying business has neither mirror nor claim, so
  // the second column would be empty — and an empty column is not neutral, it
  // squeezes the real content into 59% of the width and leaves a dead gutter.
  const hasAside = Boolean(account.mizro.business_ref) || Boolean(attribution);
  // The standing promise: the newest logged touch that scheduled something.
  const nextStep = timeline.find((ev) => ev.next_action_at && ev.next_action_type);
  const overdue = nextStep?.next_action_at
    ? new Date(nextStep.next_action_at).getTime() < Date.now()
    : false;

  return (
    <main className="min-h-dvh pb-28 md:pb-10">
      <Subhead
        title={account.name}
        back="/accounts"
        collapse
        subtitle={
          [account.region_text, account.contact_name].filter(Boolean).join(' · ') || undefined
        }
        // The persistent «ثبت». It appears only once the header folds — which is
        // exactly when the quick-action row has scrolled out of reach. That is
        // what the old fixed bottom bar was for, and the bar could not do it:
        // on a phone it sat UNDER the nav (measured — 66 of its 85px hidden,
        // its own centre not clickable), and on a tablet it centred on the
        // viewport rather than the content column, so it ran under the rail.
        trailing={
          <Link
            href={logHref}
            className="rounded-full bg-primary px-3.5 py-1.5 text-xs font-bold text-primary-fg"
          >
            ثبت
          </Link>
        }
      >
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <Tag tone={STATUS_TONE[account.status] ?? 'note'}>
            {ACCOUNT_STATUS_FA[account.status] ?? account.status}
          </Tag>
          {account.mizro.subscription_status ? (
            <Tag tone="customer">
              اشتراک{' '}
              {SUBSCRIPTION_STATUS_FA[account.mizro.subscription_status] ??
                account.mizro.subscription_status}
            </Tag>
          ) : null}
        </div>
      </Subhead>

      <div className={BODY}>
        {/* ── quick actions ───────────────────────────────────────────────── */}
        {/* Four separate tiles in normal flow, as in the prototype — NOT one
            card pulled up under the header. The header is `sticky z-30`, so a
            negative margin does not lift a card OVER it, it hides the card's
            top edge BEHIND it. */}
        <div className="mt-4 grid grid-cols-4 gap-2">
          <QuickAction
            href={account.phone ? `tel:${account.phone}` : undefined}
            disabledHint="شماره ندارد"
            label="تماس"
            tone="bg-primary-soft text-primary-ink"
          >
            <PhoneIcon className="h-[18px] w-[18px]" />
          </QuickAction>
          <QuickAction
            href={account.phone ? `sms:${account.phone}` : undefined}
            disabledHint="شماره ندارد"
            label="پیامک"
            tone="bg-surface-2 text-fg-muted"
          >
            <NoteIcon className="h-[18px] w-[18px]" />
          </QuickAction>
          <QuickAction
            href={`${logHref}${leadId ? '&' : '?'}kind=visit`}
            label="بازدید"
            tone="bg-info-soft text-info"
          >
            <PinGlyph />
          </QuickAction>
          <QuickAction
            href={`/opportunities/new?account=${account.id}`}
            label="فرصت"
            tone="bg-gold-soft text-gold"
          >
            <PlusIcon className="h-[18px] w-[18px]" />
          </QuickAction>
        </div>

        {/* From `md`, and only when there is something to put beside it, the
            prototype's own desktop split (`.deskgrid`, 1.35fr / 1fr): what to
            DO on the wide side, the read-only mirror next to it. On a phone the
            grid collapses and the DOM order is the reading order — promise,
            facts, history, then the mirror. */}
        <div
          className={
            hasAside
              ? 'md:grid md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] md:items-start md:gap-x-6'
              : undefined
          }
        >
          <div className="md:min-w-0">
            {/* ── the standing promise ──────────────────────────────────── */}
            {nextStep?.next_action_at && nextStep.next_action_type ? (
              <section
                className={`mt-5 rounded-md border p-4 ${
                  overdue ? 'border-danger/30 bg-danger-soft' : 'border-primary/25 bg-primary-soft'
                }`}
              >
                <p
                  className={`flex items-center gap-1.5 text-[11px] font-bold ${
                    overdue ? 'text-danger' : 'text-primary-ink'
                  }`}
                >
                  <ClockIcon className="h-3.5 w-3.5" />
                  {overdue ? 'قدم بعدی — عقب‌افتاده' : 'قدم بعدی'}
                </p>
                <p className="mt-1.5 text-[15px] font-bold">
                  {nextActionLabel(nextStep.next_action_type)}
                </p>
                <p className="num mt-0.5 text-xs text-fg-muted">
                  {faDate(nextStep.next_action_at)}
                  {isToday(nextStep.next_action_at) ? ` · ${faClock(nextStep.next_action_at)}` : ''}
                </p>
                <Link
                  href={logHref}
                  className="mt-3 inline-block rounded-full bg-surface px-4 py-2 text-[13px] font-bold text-primary-ink shadow-card"
                >
                  ثبت نتیجه
                </Link>
              </section>
            ) : (
              <section className="mt-5 rounded-md border border-warning/25 bg-warning-soft p-4">
                <p className="text-[13px] font-bold">قدم بعدی تعیین نشده</p>
                <p className="mt-1 text-xs leading-5 text-fg-muted">
                  هر پرونده‌ای باید یک اقدام تاریخ‌دار داشته باشد تا فراموش نشود.
                </p>
                <Link
                  href={logHref}
                  className="mt-3 inline-block rounded-full bg-surface px-4 py-2 text-[13px] font-bold text-primary-ink shadow-card"
                >
                  ثبت تماس / بازدید
                </Link>
              </section>
            )}

            {/* ── what the seller learned on site ─────────────────────────────── */}
            {/* A bare centred phone number and an unlabelled chip row read as
            debris between two cards. They are the same thing — what is known
            about this business — so they are one titled card. */}
            {account.phone || chips.length > 0 ? (
              <section className="mt-4 rounded-md border border-border bg-surface p-4 shadow-card">
                <h2 className="text-sm font-bold">دربارهٔ این کسب‌وکار</h2>
                {account.phone ? (
                  <a
                    href={`tel:${account.phone}`}
                    className="mt-2.5 flex items-center gap-2 text-[13px] font-semibold text-primary-ink"
                  >
                    <PhoneIcon className="h-4 w-4 flex-none" />
                    <span dir="ltr" className="num">
                      {toFaDigits(account.phone)}
                    </span>
                  </a>
                ) : null}
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
              </section>
            ) : null}

            {/* ── interaction timeline ─────────────────────────────────────────── */}
            <div className="mb-3 mt-6 flex items-center gap-2">
              <h2 className="text-[15px] font-bold">تاریخچهٔ تعامل</h2>
              {timeline.length > 0 && (
                <span className="num rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-fg-muted">
                  {new Intl.NumberFormat('fa-IR').format(timeline.length)}
                </span>
              )}
            </div>
            {timeline.length === 0 ? (
              <EmptyState title="هنوز تعاملی ثبت نشده" hint="اولین بازدید یا تماس را ثبت کن." />
            ) : (
              <ol className="overflow-hidden rounded-md border border-border bg-surface shadow-card">
                {timeline.map((ev, i) => (
                  <li key={ev.id} className={`p-3.5 ${i > 0 ? 'border-t border-border' : ''}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-bold">
                        {ACTIVITY_KIND_FA[ev.kind] ?? ev.kind}
                        {ev.outcome ? (
                          <span className="font-medium text-fg-muted">
                            {' '}
                            · {outcomeLabel(ev.outcome)}
                          </span>
                        ) : null}
                      </span>
                      <span className="flex-none text-[11px] text-fg-faint">
                        {faRelativeTime(ev.occurred_at)}
                      </span>
                    </div>
                    {ev.note ? <p className="mt-1 text-[13px] leading-6">{ev.note}</p> : null}
                    {ev.next_action_type && ev.next_action_at ? (
                      <p className="mt-1.5 flex items-center gap-1 text-[11px] text-primary-ink">
                        <ClockIcon className="h-3 w-3" />
                        اقدام بعدی: {nextActionLabel(ev.next_action_type)} —{' '}
                        <span className="num">{faDate(ev.next_action_at)}</span>
                      </p>
                    ) : null}
                    {ev.seller_name ? (
                      <p className="mt-1 text-[10px] text-fg-faint">{ev.seller_name}</p>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </div>

          {/* ── the read-only side: what the product says, and who owns it ──── */}
          <div className="md:min-w-0">
            {/* «وضعیت در میزرو» — mirror, never editable here */}
            {account.mizro.business_ref ? (
              <section className="mt-5 rounded-md border border-border bg-surface p-4 shadow-card">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-bold">وضعیت در میزرو</h2>
                  <Tag tone="note">فقط‌خواندنی</Tag>
                </div>
                <dl className="space-y-2.5 text-[13px]">
                  <Row label="پلن فعلی" value={account.mizro.plan ?? '—'} />
                  <Row
                    label="وضعیت اشتراک"
                    value={
                      account.mizro.subscription_status
                        ? (SUBSCRIPTION_STATUS_FA[account.mizro.subscription_status] ??
                          account.mizro.subscription_status)
                        : '—'
                    }
                  />
                  {account.mizro.subscription_ends_at ? (
                    <Row label="پایان اشتراک" value={faDate(account.mizro.subscription_ends_at)} />
                  ) : null}
                  <Row
                    label="مجموع پرداختی"
                    value={`${formatToman(account.mizro.total_paid_rial)} تومان`}
                    strong
                  />
                </dl>
              </section>
            ) : null}

            {/* ★ معرِّف — immutable attribution */}
            {attribution ? (
              <section className="mt-4 rounded-md border border-primary/25 bg-primary-soft p-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-bold text-primary-ink">★ معرِّف</h2>
                  <Tag tone="note">قفل‌شده</Tag>
                </div>
                <p className="mt-1.5 text-[13px] font-bold">{attribution.seller_name}</p>
                <p className="mt-1 text-[11px] leading-5 text-fg-muted">
                  از {faDate(attribution.first_touch_at)} — کمیسیون هر پرداخت این مشتری به او تعلق
                  می‌گیرد.
                </p>
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-fg-muted">{label}</dt>
      <dd className={`num text-end ${strong ? 'font-bold' : 'font-medium'}`}>{value}</dd>
    </div>
  );
}

function QuickAction({
  href,
  label,
  tone,
  disabledHint,
  children,
}: {
  href: string | undefined;
  label: string;
  tone: string;
  disabledHint?: string;
  children: React.ReactNode;
}) {
  const body = (
    <>
      <span className={`grid h-9 w-9 place-items-center rounded-md ${tone}`}>{children}</span>
      <span className="text-[11px] font-semibold">{label}</span>
    </>
  );
  // Each tile is its own surface (prototype `.quickacts button`), so a disabled
  // one still reads as a slot that exists rather than as a hole in a card.
  const shell =
    'flex flex-col items-center gap-1.5 rounded-md border border-border bg-surface py-3 shadow-card';
  if (!href) {
    return (
      <span title={disabledHint} className={`${shell} opacity-40`}>
        {body}
      </span>
    );
  }
  const external = href.startsWith('tel:') || href.startsWith('sms:');
  const className = `${shell} transition active:bg-surface-2`;
  return external ? (
    <a href={href} className={className}>
      {body}
    </a>
  ) : (
    <Link href={href} className={className}>
      {body}
    </Link>
  );
}

function PinGlyph() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="2.8" />
    </svg>
  );
}

export default function AccountDetailPage() {
  // useSearchParams needs a Suspense boundary in the app router.
  return (
    <Suspense fallback={<div className="min-h-dvh bg-bg" />}>
      <AccountDetail />
    </Suspense>
  );
}
