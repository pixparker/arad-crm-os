'use client';

// «درآمد من» — the append-only commission ledger, each row explainable (🔒
// transparency: tap to see the formula from the stored basis), plus the
// seller's immutable demo link (scan = permanent attribution).

import { EmptyState } from '@/components/empty-state';
import { CopyIcon } from '@/components/icons';
import { ListSkeleton, StatRowSkeleton } from '@/components/skeleton';
import { StatCard } from '@/components/stat-card';
import { useToast } from '@/components/toast';
import { faDate, formatToman, toFaDigits } from '@/lib/format';
import { COMMISSION_STATUS_FA } from '@/lib/labels';
import type { CommissionEntry, MyAttributionLink, MyCommissionResponse } from '@/lib/types';
import { apiFetch } from '@arad-crm/web-shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

export default function MoneyPage() {
  const commission = useQuery({
    queryKey: ['commission', 'my'],
    queryFn: () => apiFetch<MyCommissionResponse>('/v1/commission/my'),
  });
  const link = useQuery({
    queryKey: ['attribution', 'my-link'],
    queryFn: () => apiFetch<MyAttributionLink>('/v1/attribution/my-link'),
  });

  return (
    <main className="flex min-h-dvh flex-col px-4 pb-28 pt-6">
      <header className="mb-5">
        <h1 className="text-2xl font-bold">درآمد من</h1>
        <p className="mt-1 text-sm text-fg-muted">دفتر فقط‌افزودنی · بدون دستکاری دستی</p>
      </header>

      {commission.isPending ? (
        <>
          <StatRowSkeleton />
          <div className="mt-6">
            <ListSkeleton rows={3} />
          </div>
        </>
      ) : commission.isError ? (
        <EmptyState title="اطلاعات کمیسیون بارگیری نشد" hint="کمی بعد دوباره تلاش کن." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label="کل کسب‌شده"
              value={`${formatToman(commission.data.totals.earned_total_rial)}`}
              sub="تومان"
              tone="primary"
            />
            <StatCard
              label="پرداخت‌شده"
              value={formatToman(commission.data.totals.paid_rial)}
              sub="تومان"
              tone="success"
            />
            <StatCard
              label="در انتظار تسویه"
              value={formatToman(commission.data.totals.pending_rial)}
              sub="تومان"
            />
            <StatCard
              label="برگشت‌خورده (کلاوبک)"
              value={formatToman(commission.data.totals.reversed_rial)}
              sub="تومان"
              tone="danger"
            />
          </div>

          <DemoLinkCard link={link.data} loading={link.isPending} />

          <section className="mt-6">
            <h2 className="mb-1 text-base font-bold">دفتر کمیسیون</h2>
            <p className="mb-3 text-xs leading-5 text-fg-muted">
              هر ردیف = یک پرداخت واقعی در میزرو. روی هر ردیف بزن تا فرمول محاسبه را ببینی.
            </p>
            {commission.data.entries.length === 0 ? (
              <EmptyState
                title="هنوز کمیسیونی ثبت نشده"
                hint="با اولین پرداخت مشتریِ منتسب به تو، این‌جا یک ردیف اضافه می‌شود."
              />
            ) : (
              <ul className="space-y-2.5">
                {commission.data.entries.map((e) => (
                  <LedgerRow key={e.id} entry={e} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function DemoLinkCard({
  link,
  loading,
}: { link: MyAttributionLink | undefined; loading: boolean }) {
  const toast = useToast();
  if (loading || !link) return null;
  return (
    <section className="mt-5 rounded-lg border border-primary/30 bg-primary/5 p-4">
      <h2 className="text-sm font-bold text-primary">لینک دموی اختصاصی تو (معرِّف)</h2>
      <p className="mt-1 text-xs leading-5 text-fg-muted">
        اسکن مشتری = قفل دائمی اسناد به نام تو؛ کمیسیونِ هر پرداخت آینده از همین‌جا ردیابی می‌شود.
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
          className="flex shrink-0 items-center gap-1 rounded-md bg-gradient-primary shadow-card px-3 py-2 text-xs font-bold text-primary-fg"
        >
          <CopyIcon className="h-4 w-4" />
          کپی
        </button>
      </div>
    </section>
  );
}

function LedgerRow({ entry }: { entry: CommissionEntry }) {
  const [open, setOpen] = useState(false);
  const isReversal = entry.entry_type === 'reversal';
  const basis = entry.basis as { percentBp?: number; netAmountRial?: string };

  return (
    <li className="rounded-md border border-border bg-surface shadow-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 p-3.5 text-start"
      >
        <span className="min-w-0">
          <span className="block truncate font-medium">{entry.account_name ?? 'پرداخت'}</span>
          <span className="mt-0.5 flex items-center gap-2 text-[11px] text-fg-muted">
            {faDate(entry.created_at)}
            <span className="rounded-full bg-surface-2 px-2 py-0.5">
              {COMMISSION_STATUS_FA[entry.status] ?? entry.status}
            </span>
            {isReversal ? (
              <span className="rounded-full bg-danger/10 px-2 py-0.5 text-danger">کلاوبک</span>
            ) : null}
          </span>
        </span>
        <span className={`shrink-0 font-bold ${isReversal ? 'text-danger' : 'text-fg'}`}>
          {formatToman(entry.amount_rial)} ت
        </span>
      </button>
      {open && basis.netAmountRial && basis.percentBp ? (
        <div className="border-t border-border px-3.5 py-2.5 text-xs text-fg-muted">
          فرمول: {toFaDigits(String(basis.percentBp / 100))}٪ × مبلغ خالص{' '}
          {formatToman(basis.netAmountRial)} تومان ={' '}
          <span className="font-bold text-fg">{formatToman(entry.amount_rial)} تومان</span>
        </div>
      ) : null}
    </li>
  );
}
