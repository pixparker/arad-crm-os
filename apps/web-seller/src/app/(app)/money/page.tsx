'use client';

// «کمیسیون من» — prototype screen ۰۸. The navy hero carries the year's total
// and its three-way split, then six Jalali months as bars, then the ledger.
//
// 🔒 Every number here is summed with BigInt over Rial digit-strings and
// divided by 10 for Toman. A reversal is a NEGATIVE row in the same
// append-only ledger, never a deletion — so the split shows کلاوبک as its own
// figure and the total still includes it. Rows explain themselves on tap: the
// stored `basis` is the formula, so the seller can check the arithmetic rather
// than trust it.
//
// The prototype's «فیلتر ماه» is a real filter here, driven by the entries the
// ledger actually contains — an empty month is not offered.

import { EmptyState } from '@/components/empty-state';
import { CopyIcon } from '@/components/icons';
import { Chip, ChipRow, Initials, Tag, type Tone } from '@/components/list-bits';
import { ListSkeleton } from '@/components/skeleton';
import { Subhead } from '@/components/subhead';
import { useToast } from '@/components/toast';
import { faDate, faNum, formatToman, toFaDigits } from '@/lib/format';
import { COMMISSION_STATUS_FA } from '@/lib/labels';
import type { CommissionEntry, MyAttributionLink, MyCommissionResponse } from '@/lib/types';
import { apiFetch } from '@arad-crm/web-shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

// Jalali month key + label, straight from Intl — no date library, no table.
const faMonth = new Intl.DateTimeFormat('fa-IR', { month: 'long' });
const monthKey = new Intl.DateTimeFormat('en-u-ca-persian', {
  year: 'numeric',
  month: 'numeric',
  timeZone: 'Asia/Tehran',
});

const keyOf = (iso: string): string => monthKey.format(new Date(iso));

/** ۲۸٫۶م — the hero's shoulder number. Integer division only 🔒. */
const compact = (rial: string): string => {
  const negative = rial.startsWith('-');
  const toman = BigInt(negative ? rial.slice(1) : rial) / 10n;
  const sign = negative ? '−' : '';
  if (toman >= 1_000_000n) {
    const tenths = toman / 100_000n;
    return toFaDigits(`${sign}${tenths / 10n}٫${tenths % 10n}م`);
  }
  return `${sign}${faNum(Number(toman))}`;
};

const STATUS_TONE: Record<string, Tone> = {
  paid: 'customer',
  approved: 'lead',
  payable: 'lead',
  earned: 'lead',
  reversed: 'danger',
  disputed: 'danger',
  estimated: 'note',
  pending_finalization: 'warn',
};

export default function MoneyPage() {
  const [month, setMonth] = useState<string | null>(null);

  const commission = useQuery({
    queryKey: ['commission', 'my'],
    queryFn: () => apiFetch<MyCommissionResponse>('/v1/commission/my'),
  });
  const link = useQuery({
    queryKey: ['attribution', 'my-link'],
    queryFn: () => apiFetch<MyAttributionLink>('/v1/attribution/my-link'),
  });

  const entries = commission.data?.entries ?? [];

  // The last six Jalali months that have a row, newest first — then reversed
  // for the chart, so time runs the way a chart's baseline expects.
  const months = [...new Set(entries.map((e) => keyOf(e.created_at)))].slice(0, 6);
  const buckets = months
    .map((key) => {
      const rows = entries.filter((e) => keyOf(e.created_at) === key);
      const total = rows.reduce((sum, e) => sum + BigInt(e.amount_rial), 0n);
      const at = rows[0]?.created_at;
      return { key, total, label: at ? faMonth.format(new Date(at)) : key, count: rows.length };
    })
    .reverse();
  const peak = buckets.reduce((max, b) => (b.total > max ? b.total : max), 1n);

  const shown = month ? entries.filter((e) => keyOf(e.created_at) === month) : entries;

  return (
    <main className="min-h-dvh pb-28">
      <Subhead
        title="کمیسیون من"
        back="/"
        subtitle="دفتر فقط‌افزودنی · بدون دستکاری دستی"
        trailing={
          commission.data ? (
            <span className="num flex-none text-[15px] font-bold">
              {compact(commission.data.totals.earned_total_rial)}
            </span>
          ) : undefined
        }
      >
        {commission.data ? (
          <div className="mt-5">
            <p className="text-[11px] text-on-canopy-muted">کل کسب‌شده</p>
            <p className="num mt-1 text-[30px] font-bold leading-none">
              {formatToman(commission.data.totals.earned_total_rial)}
              <small className="ms-1.5 text-[11px] font-medium opacity-70">تومان</small>
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/15 pt-3.5">
              <Split label="تسویه‌شده" rial={commission.data.totals.paid_rial} />
              <Split label="در انتظار" rial={commission.data.totals.pending_rial} />
              <Split
                label="کلاوبک"
                rial={commission.data.totals.reversed_rial}
                tone="text-danger-soft"
              />
            </div>
          </div>
        ) : null}
      </Subhead>

      <div className="px-4 pt-5">
        {commission.isPending ? (
          <ListSkeleton rows={4} />
        ) : commission.isError ? (
          <EmptyState
            title="اطلاعات کمیسیون بارگیری نشد"
            hint="اتصال را بررسی کن."
            action={
              <button
                type="button"
                onClick={() => commission.refetch()}
                className="rounded-md bg-primary px-5 py-2.5 text-sm font-bold text-primary-fg"
              >
                تلاش دوباره
              </button>
            }
          />
        ) : entries.length === 0 ? (
          <>
            <EmptyState
              title="هنوز کمیسیونی ثبت نشده"
              hint="با اولین پرداخت مشتریِ منتسب به تو، این‌جا یک ردیف اضافه می‌شود — خودکار، از رویداد پرداخت میزرو."
            />
            <DemoLinkCard link={link.data} />
          </>
        ) : (
          <>
            {buckets.length > 1 && (
              <>
                <h2 className="mb-3 text-[15px] font-bold">{faNum(buckets.length)} ماه گذشته</h2>
                <div className="flex items-end justify-between gap-2 rounded-md border border-border bg-surface p-4 shadow-card">
                  {buckets.map((b, i) => (
                    <span key={b.key} className="flex flex-1 flex-col items-center gap-2">
                      <span
                        className={`w-full rounded-t-sm ${
                          i === buckets.length - 1 ? 'bg-primary' : 'bg-primary/25'
                        }`}
                        style={{
                          // Percentage of the peak month, floored so a month with
                          // rows never renders as a zero-height nothing.
                          height: `${
                            b.total <= 0n ? 3 : Math.max(6, Number((b.total * 56n) / peak))
                          }px`,
                        }}
                      />
                      <span className="text-[10px] text-fg-muted">{b.label}</span>
                    </span>
                  ))}
                </div>
              </>
            )}

            <div className="mb-3 mt-6 flex items-center gap-2">
              <h2 className="text-[15px] font-bold">دفتر کمیسیون</h2>
              <span className="num rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-fg-muted">
                {faNum(shown.length)}
              </span>
            </div>

            {months.length > 1 && (
              <div className="mb-3">
                <ChipRow>
                  <Chip active={month === null} onClick={() => setMonth(null)}>
                    همهٔ ماه‌ها
                  </Chip>
                  {[...buckets].reverse().map((b) => (
                    <Chip
                      key={b.key}
                      active={month === b.key}
                      onClick={() => setMonth(month === b.key ? null : b.key)}
                      count={b.count}
                    >
                      {b.label}
                    </Chip>
                  ))}
                </ChipRow>
              </div>
            )}

            <ul className="overflow-hidden rounded-md border border-border bg-surface shadow-card">
              {shown.map((e, i) => (
                <LedgerRow key={e.id} entry={e} divided={i > 0} />
              ))}
            </ul>

            <p className="mt-4 text-center text-[11px] leading-5 text-fg-muted">
              هر ردیف = یک پرداخت واقعی در میزرو. تا وقتی مشتری فعال بماند، هر ماه یک ردیف اضافه
              می‌شود.
            </p>

            <DemoLinkCard link={link.data} />
          </>
        )}
      </div>
    </main>
  );
}

function Split({ label, rial, tone }: { label: string; rial: string; tone?: string }) {
  return (
    <span className="block">
      <span className={`num block text-[13px] font-bold ${tone ?? ''}`}>{compact(rial)}</span>
      <span className="mt-0.5 block text-[10px] text-on-canopy-muted">{label}</span>
    </span>
  );
}

function DemoLinkCard({ link }: { link: MyAttributionLink | undefined }) {
  const toast = useToast();
  if (!link) return null;
  return (
    <section className="mt-6 rounded-md border border-primary/25 bg-primary-soft p-4">
      <h2 className="text-sm font-bold text-primary-ink">لینک دموی اختصاصی تو (معرِّف)</h2>
      <p className="mt-1 text-[11px] leading-5 text-fg-muted">
        اسکن مشتری = قفل دائمی اسناد به نام تو؛ کمیسیون هر پرداخت آینده از همین‌جا ردیابی می‌شود.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <code dir="ltr" className="min-w-0 flex-1 truncate rounded-md bg-surface px-3 py-2 text-xs">
          {link.demo_url}
        </code>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(link.demo_url);
            toast('لینک کپی شد', 'success');
          }}
          className="flex flex-none items-center gap-1 rounded-md bg-gradient-primary px-3 py-2 text-xs font-bold text-primary-fg shadow-card"
        >
          <CopyIcon className="h-4 w-4" />
          کپی
        </button>
      </div>
    </section>
  );
}

function LedgerRow({ entry, divided }: { entry: CommissionEntry; divided: boolean }) {
  const [open, setOpen] = useState(false);
  const isReversal = entry.entry_type === 'reversal';
  const basis = entry.basis as { percentBp?: number; netAmountRial?: string };

  return (
    <li className={divided ? 'border-t border-border' : ''}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-3.5 text-start transition active:bg-surface-2"
      >
        <Initials name={entry.account_name ?? 'پرداخت'} tone={isReversal ? 'danger' : 'customer'} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold">{entry.account_name ?? 'پرداخت'}</span>
          <span className="num mt-0.5 block truncate text-[11px] text-fg-muted">
            {faDate(entry.created_at)}
            {basis.percentBp ? ` · نرخ ${toFaDigits(String(basis.percentBp / 100))}٪` : ''}
          </span>
        </span>
        <span className="flex flex-none flex-col items-end gap-1">
          <span className={`num text-[13px] font-bold ${isReversal ? 'text-danger' : 'text-fg'}`}>
            {isReversal ? '' : '+'}
            {formatToman(entry.amount_rial)}
          </span>
          <Tag tone={STATUS_TONE[entry.status] ?? 'note'}>
            {COMMISSION_STATUS_FA[entry.status] ?? entry.status}
          </Tag>
        </span>
      </button>
      {open ? (
        <div className="border-t border-border bg-surface-2 px-3.5 py-2.5 text-[11px] leading-5 text-fg-muted">
          {basis.netAmountRial && basis.percentBp ? (
            <>
              فرمول: {toFaDigits(String(basis.percentBp / 100))}٪ × مبلغ خالص{' '}
              <span className="num">{formatToman(basis.netAmountRial)}</span> تومان ={' '}
              <b className="num text-fg">{formatToman(entry.amount_rial)} تومان</b>
            </>
          ) : (
            'فرمول این ردیف ثبت نشده است.'
          )}
          {entry.reason ? <p className="mt-1">دلیل: {entry.reason}</p> : null}
          {entry.payment_ref ? (
            <p className="mt-1 truncate" dir="ltr">
              پرداخت: {entry.payment_ref}
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
