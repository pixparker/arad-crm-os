'use client';

// «دفتر کمیسیون» — the append-only ledger. Managers approve earned entries;
// finance/owner marks approved entries paid. Every row shows the formula from
// its stored basis. No amount is ever edited — reversals are their own rows.

import {
  Chip,
  EmptyState,
  ErrorState,
  PageHeader,
  TableSkeleton,
  Toman,
  btnRowAction,
} from '@/components/ui';
import {
  type CommissionEntry,
  useApproveEntry,
  useCommissionEntries,
  useMarkPaid,
  useMe,
} from '@/lib/api';
import {
  COMMISSION_STATUS_LABELS,
  COMMISSION_STATUS_TONES,
  ENTRY_TYPE_LABELS,
  faDate,
  formatToman,
} from '@/lib/format';
import { ApiError } from '@arad-crm/web-shared';
import { Fragment, useState } from 'react';

export default function CommissionPage() {
  const me = useMe();
  const entries = useCommissionEntries();
  const approve = useApproveEntry();
  const markPaid = useMarkPaid();
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const canPay =
    me.data?.membership.role === 'finance' || me.data?.membership.role === 'owner_admin';

  const act = (fn: { mutate: (v: { id: string }, o: object) => void }, id: string) => {
    setError('');
    fn.mutate(
      { id },
      {
        onError: (err: unknown) =>
          setError(err instanceof ApiError ? err.message : 'عملیات ناموفق بود'),
      },
    );
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="دفتر کمیسیون"
        subtitle="دفتر فقط‌افزودنی — هر ردیف یک پرداخت واقعی در میزرو. مبالغ هرگز دستکاری نمی‌شوند."
      />

      {error ? (
        <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-md border border-border bg-surface shadow-card">
        {entries.isPending ? (
          <TableSkeleton />
        ) : entries.isError ? (
          <ErrorState error={entries.error} onRetry={() => void entries.refetch()} />
        ) : entries.data.items.length === 0 ? (
          <EmptyState
            title="هنوز کمیسیونی ثبت نشده"
            hint="با اولین پرداخت مشتری در میزرو، خودکار یک ردیف اضافه می‌شود."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-start text-sm">
              <thead className="border-b border-border bg-surface-2 text-xs text-fg-muted">
                <tr>
                  <th className="px-3 py-2 text-start font-medium">تاریخ</th>
                  <th className="px-3 py-2 text-start font-medium">مشتری</th>
                  <th className="px-3 py-2 text-start font-medium">نوع</th>
                  <th className="px-3 py-2 text-start font-medium">مبلغ</th>
                  <th className="px-3 py-2 text-start font-medium">وضعیت</th>
                  <th className="px-3 py-2 text-start font-medium">اقدام</th>
                </tr>
              </thead>
              <tbody>
                {entries.data.items.map((e) => (
                  <Fragment key={e.id}>
                    <tr className="border-b border-border last:border-b-0">
                      <td className="px-3 py-2 text-fg-muted">{faDate(e.created_at)}</td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          className="font-medium underline decoration-dotted underline-offset-2"
                          onClick={() => setOpenId(openId === e.id ? null : e.id)}
                        >
                          {e.account_name ?? 'پرداخت'}
                        </button>
                      </td>
                      <td className="px-3 py-2">
                        {e.entry_type === 'reversal' ? (
                          <Chip tone="danger">{ENTRY_TYPE_LABELS[e.entry_type]}</Chip>
                        ) : (
                          <span className="text-fg-muted">{ENTRY_TYPE_LABELS[e.entry_type]}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <Toman rial={e.amount_rial} />
                      </td>
                      <td className="px-3 py-2">
                        <Chip tone={COMMISSION_STATUS_TONES[e.status]}>
                          {COMMISSION_STATUS_LABELS[e.status]}
                        </Chip>
                      </td>
                      <td className="px-3 py-2">
                        {e.status === 'earned' ? (
                          <button
                            type="button"
                            className={btnRowAction}
                            disabled={approve.isPending}
                            onClick={() => act(approve, e.id)}
                          >
                            تأیید
                          </button>
                        ) : e.status === 'approved' && canPay ? (
                          <button
                            type="button"
                            className={btnRowAction}
                            disabled={markPaid.isPending}
                            onClick={() => act(markPaid, e.id)}
                          >
                            پرداخت شد
                          </button>
                        ) : (
                          <span className="text-xs text-fg-muted">—</span>
                        )}
                      </td>
                    </tr>
                    {openId === e.id ? (
                      <tr className="bg-surface-2/50">
                        <td colSpan={6} className="px-3 py-2 text-xs text-fg-muted">
                          <CommissionFormula entry={e} />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function CommissionFormula({ entry }: { entry: CommissionEntry }) {
  const basis = entry.basis as { percentBp?: number; netAmountRial?: string; reason?: string };
  if (entry.entry_type === 'reversal') {
    return <span>کلاوبک — {entry.reason ?? basis.reason ?? 'برگشت وجه'}</span>;
  }
  if (basis.percentBp && basis.netAmountRial) {
    return (
      <span>
        فرمول: {new Intl.NumberFormat('fa-IR').format(basis.percentBp / 100)}٪ × مبلغ خالص{' '}
        {formatToman(basis.netAmountRial)} تومان ={' '}
        <span className="font-bold text-fg">{formatToman(entry.amount_rial)} تومان</span>
        {entry.payment_ref ? <span className="ms-2">· پرداخت {entry.payment_ref}</span> : null}
      </span>
    );
  }
  return <span>مبلغ ثابت</span>;
}
