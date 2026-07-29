'use client';

// «سرنخ‌ها و مشتریان» — prototype screen ۰۵. Every business the seller is
// allowed to see, in one list, with the three filters the prototype gives it.
//
// The segment («سرنخ / فرصت / مشتری») is asked of the server, because it is
// derived from facts the client cannot see: an open deal makes a file a فرصت,
// and a real payment 🔒 makes it a مشتری. The two chips beside it — «نیاز به
// پیگیری» and «بدون قدم بعدی» — are answered here from data already on each
// row, so they toggle instantly instead of round-tripping.
//
// Each row's tag is the row's most urgent truth, in this order: nothing owed →
// promise broken → due today → subscription about to lapse → next step dated.
// A file with no next step gets the loudest quiet tag on the screen, because
// that is the one the seller has to fix.

import { EmptyState } from '@/components/empty-state';
import { inputClass } from '@/components/field';
import { Chip, ChipRow, Initials, SegBar, Tag, type Tone } from '@/components/list-bits';
import { ListSkeleton } from '@/components/skeleton';
import { Subhead } from '@/components/subhead';
import { faClock, faDate, faNum, isToday, toFaDigits } from '@/lib/format';
import { nextActionLabel } from '@/lib/labels';
import type { AccountListItem, AccountListResponse } from '@/lib/types';
import { apiFetch } from '@arad-crm/web-shared';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';

type Segment = 'all' | 'lead' | 'opportunity' | 'customer';

const SEGMENTS = [
  { value: 'all', label: 'همه' },
  { value: 'lead', label: 'سرنخ' },
  { value: 'opportunity', label: 'فرصت' },
  { value: 'customer', label: 'مشتری' },
] as const satisfies readonly { value: Segment; label: string }[];

const DAY_MS = 86_400_000;
const STALE_DAYS = 6;

const toneFor = (row: AccountListItem): Tone => {
  if (row.status === 'customer') return 'customer';
  if (row.open_opportunities > 0) return 'opportunity';
  return 'lead';
};

/** ۴٫۲م — integer division on the Rial, never a float 🔒. */
const compact = (rial: string): string | null => {
  if (rial === '0') return null;
  const toman = BigInt(rial) / 10n;
  if (toman >= 1_000_000n) {
    const tenths = toman / 100_000n;
    return toFaDigits(`${tenths / 10n}٫${tenths % 10n}م`);
  }
  return faNum(Number(toman));
};

const daysUntil = (iso: string): number =>
  Math.ceil((new Date(iso).getTime() - Date.now()) / DAY_MS);

function RowTag({ row }: { row: AccountListItem }) {
  if (!row.next_action_at) {
    // The file has nothing owed on it. For a paying customer that is normal;
    // for anything else it is the thing to fix.
    if (row.status === 'customer') {
      const ends = row.mizro.subscription_ends_at;
      const left = ends ? daysUntil(ends) : null;
      if (left !== null && left >= 0 && left <= 14) {
        return <Tag tone="warn">{faNum(left)} روز تا تمدید</Tag>;
      }
      return <Tag tone="customer">مشتری فعال</Tag>;
    }
    const quiet = row.last_activity_at
      ? Math.floor((Date.now() - new Date(row.last_activity_at).getTime()) / DAY_MS)
      : null;
    if (quiet !== null && quiet >= STALE_DAYS) {
      return <Tag tone="danger">{faNum(quiet)} روز بی‌تماس</Tag>;
    }
    return <Tag tone="warn">بدون قدم بعدی</Tag>;
  }

  const due = new Date(row.next_action_at).getTime();
  if (due < Date.now()) return <Tag tone="danger">عقب‌افتاده</Tag>;
  const label = row.next_action_type ? nextActionLabel(row.next_action_type) : 'پیگیری';
  return (
    <Tag tone={isToday(row.next_action_at) ? 'lead' : 'note'}>
      {label}{' '}
      <span className="num">
        {isToday(row.next_action_at) ? faClock(row.next_action_at) : faDate(row.next_action_at)}
      </span>
    </Tag>
  );
}

export default function AccountsPage() {
  const [q, setQ] = useState('');
  const [segment, setSegment] = useState<Segment>('all');
  const [needsFollowup, setNeedsFollowup] = useState(false);
  const [noNextStep, setNoNextStep] = useState(false);

  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (segment !== 'all') params.set('segment', segment);
  const query = params.toString();

  const accounts = useQuery({
    queryKey: ['accounts', segment, q],
    queryFn: () => apiFetch<AccountListResponse>(`/v1/accounts${query ? `?${query}` : ''}`),
  });

  const all = accounts.data?.items ?? [];
  const dueSoon = all.filter(
    (a) => a.next_action_at !== null && new Date(a.next_action_at).getTime() < Date.now() + DAY_MS,
  );
  const stepless = all.filter((a) => a.next_action_at === null && a.status !== 'customer');

  let items = all;
  if (needsFollowup) items = items.filter((a) => dueSoon.includes(a));
  if (noNextStep) items = items.filter((a) => stepless.includes(a));

  const customers = all.filter((a) => a.status === 'customer').length;

  return (
    <main className="min-h-dvh pb-28 md:pb-10">
      <Subhead
        title="سرنخ‌ها و مشتریان"
        collapse
        subtitle={
          accounts.isSuccess
            ? `${faNum(all.length)} پرونده${customers > 0 ? ` · ${faNum(customers)} مشتری فعال` : ''}`
            : 'در حال بارگیری…'
        }
        // The count is the only thing this header gives up when it folds, so it
        // comes back as the one-line stand-in rather than being lost.
        trailing={
          accounts.isSuccess ? (
            <span className="num rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-bold text-on-canopy">
              {faNum(all.length)} پرونده
            </span>
          ) : undefined
        }
      />

      <div className="px-4 mx-auto w-full md:max-w-3xl md:px-6 pt-4">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="نام کسب‌وکار، شمارهٔ تماس یا شهر…"
          aria-label="جست‌وجوی پرونده"
          className={inputClass(false)}
        />

        <div className="mt-3">
          <SegBar
            label="نوع پرونده"
            options={SEGMENTS}
            value={segment}
            onChange={(v) => setSegment(v)}
          />
        </div>

        <div className="mt-3">
          <ChipRow>
            <Chip
              active={needsFollowup}
              onClick={() => setNeedsFollowup((v) => !v)}
              count={dueSoon.length}
            >
              نیاز به پیگیری
            </Chip>
            <Chip
              active={noNextStep}
              onClick={() => setNoNextStep((v) => !v)}
              count={stepless.length}
            >
              بدون قدم بعدی
            </Chip>
          </ChipRow>
        </div>

        <div className="mt-4">
          {accounts.isPending ? (
            <ListSkeleton rows={5} />
          ) : accounts.isError ? (
            <EmptyState
              title="فهرست پرونده‌ها بارگیری نشد"
              hint="اتصال را بررسی کن."
              action={
                <button
                  type="button"
                  onClick={() => accounts.refetch()}
                  className="rounded-md bg-primary px-5 py-2.5 text-sm font-bold text-primary-fg"
                >
                  تلاش دوباره
                </button>
              }
            />
          ) : items.length === 0 ? (
            <EmptyState
              title={
                q || segment !== 'all' || needsFollowup || noNextStep
                  ? 'چیزی پیدا نشد'
                  : 'هنوز پرونده‌ای نداری'
              }
              hint={
                q
                  ? 'با نام دیگری جست‌وجو کن، یا همین کسب‌وکار را به‌عنوان سرنخ تازه ثبت کن.'
                  : 'با دکمهٔ ＋ اولین سرنخ یا مشتری را ثبت کن.'
              }
              action={
                <Link
                  href="/leads/new"
                  className="rounded-md bg-primary px-5 py-2.5 text-sm font-bold text-primary-fg"
                >
                  ثبت سرنخ جدید
                </Link>
              }
            />
          ) : (
            <ul className="overflow-hidden rounded-md border border-border bg-surface shadow-card">
              {items.map((a, i) => {
                const value = compact(a.open_value_rial);
                return (
                  <li key={a.id}>
                    <Link
                      href={`/accounts/${a.id}`}
                      className={`flex items-center gap-3 p-3.5 transition active:bg-surface-2 ${
                        i > 0 ? 'border-t border-border' : ''
                      }`}
                    >
                      <Initials name={a.name} tone={toneFor(a)} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold">{a.name}</span>
                        <span className="mt-0.5 block truncate text-[11px] text-fg-muted">
                          {[a.region_text, a.contact_name, a.phone ? toFaDigits(a.phone) : null]
                            .filter(Boolean)
                            .join(' · ') || 'بدون اطلاعات تماس'}
                        </span>
                      </span>
                      <span className="flex flex-none flex-col items-end gap-1">
                        {value ? <span className="num text-[13px] font-bold">{value}</span> : null}
                        <RowTag row={a} />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}
