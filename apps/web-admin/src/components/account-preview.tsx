'use client';

// Lightweight account preview (ops pattern: preview modal over full page) —
// used from the import-duplicates table to inspect the existing record.

import { Modal } from '@/components/modal';
import { Chip, ErrorState, TableSkeleton } from '@/components/ui';
import { useAccount } from '@/lib/api';
import { ACCOUNT_STATUS_LABELS, faDate, faNumber, sourceLabel } from '@/lib/format';

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border py-2 text-sm last:border-b-0">
      <span className="shrink-0 text-xs text-fg-muted">{label}</span>
      <span className="min-w-0 text-left">{value}</span>
    </div>
  );
}

export function AccountPreviewModal({
  accountId,
  onClose,
}: {
  accountId: string;
  onClose: () => void;
}) {
  const account = useAccount(accountId);

  return (
    <Modal title="پروندهٔ موجود" onClose={onClose}>
      {account.isPending ? (
        <TableSkeleton rows={5} />
      ) : account.error ? (
        <ErrorState error={account.error} onRetry={() => void account.refetch()} />
      ) : (
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-base font-bold">{account.data.account.name}</p>
            <Chip tone={account.data.account.status === 'customer' ? 'success' : 'neutral'}>
              {ACCOUNT_STATUS_LABELS[account.data.account.status] ?? account.data.account.status}
            </Chip>
          </div>
          <Row
            label="شماره"
            value={
              account.data.account.phone ? <span dir="ltr">{account.data.account.phone}</span> : '—'
            }
          />
          <Row label="منطقه" value={account.data.account.region_text ?? '—'} />
          <Row label="نوع کسب‌وکار" value={account.data.account.business_type ?? '—'} />
          <Row label="منبع" value={sourceLabel(account.data.account.source)} />
          <Row label="ثبت" value={faDate(account.data.account.created_at)} />
          <Row label="تعاملات ثبت‌شده" value={faNumber(account.data.timeline.length)} />
          {account.data.attribution ? (
            <Row
              label="معرِّف"
              value={`${account.data.attribution.seller_name} — ${faDate(
                account.data.attribution.first_touch_at,
              )}`}
            />
          ) : null}
        </div>
      )}
    </Modal>
  );
}
