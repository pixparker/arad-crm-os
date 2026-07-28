'use client';

// Integration inbox — the producer→CRM event stream, its failures, and replay.
// Moved off web-admin (ADR-014 §2): a tenant surface should not be where Arad
// debugs another product's webhook.
//
// Replay is safe to press twice: every handler is idempotent and the
// commission ledger's uniqueness — not this button's discipline — is what
// prevents a double payout. So replay is a plain button with no confirm; the
// confirm would teach caution about an action that does not need it.

import { errorMessage, useInbox, useReplayEvent, useReplayFailed } from '@/lib/api';
import { faDateTimeOf, faNumber } from '@/lib/format';
import {
  DataTable,
  type DataTableColumn,
  EmptyState,
  FilterBar,
  GradientButton,
  ListPage,
  SelectField,
  StatusBadge,
  type StatusBadgeTone,
} from '@arad/ops-kit';
import { Inbox, RefreshCw, RotateCcw } from 'lucide-react';
import { useState } from 'react';

const STATUS_LABELS: Record<string, string> = {
  pending: 'در انتظار',
  processed: 'پردازش شد',
  skipped: 'رد شد',
  failed: 'ناموفق',
  dead: 'متوقف',
};

const STATUS_TONE: Record<string, StatusBadgeTone> = {
  processed: 'emerald',
  pending: 'slate',
  skipped: 'amber',
  failed: 'rose',
  dead: 'rose',
};

type Row = NonNullable<ReturnType<typeof useInbox>['data']>[number];

export default function InboxPage() {
  const [status, setStatus] = useState('');
  const inbox = useInbox(status || undefined);
  const replay = useReplayEvent();
  const replayFailed = useReplayFailed();

  const failedCount = inbox.data?.filter(
    (e) => e.status === 'failed' || e.status === 'dead',
  ).length;

  const columns: DataTableColumn<Row>[] = [
    {
      key: 'at',
      header: 'زمان',
      priority: 'secondary',
      cell: (r) => (
        <span className="whitespace-nowrap text-fg-muted">{faDateTimeOf(r.received_at)}</span>
      ),
    },
    {
      key: 'type',
      header: 'رویداد',
      priority: 'primary',
      cell: (r) => (
        <span dir="ltr" className="font-mono text-fg">
          {r.producer}/{r.type}@v{r.version}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'وضعیت',
      cell: (r) => (
        <StatusBadge
          tone={STATUS_TONE[r.status] ?? 'slate'}
          label={STATUS_LABELS[r.status] ?? r.status}
        />
      ),
    },
    {
      key: 'attempts',
      header: 'تلاش',
      cell: (r) => <span className="tabular-nums">{faNumber(r.attempts)}</span>,
    },
    {
      key: 'error',
      header: 'خطا',
      cell: (r) =>
        r.error ? (
          <span dir="ltr" className="block max-w-xs truncate text-danger" title={r.error}>
            {r.error}
          </span>
        ) : (
          <span className="text-fg-faint">—</span>
        ),
    },
    {
      key: 'actions',
      header: '',
      cell: (r) => (
        <button
          type="button"
          disabled={replay.isPending || r.status === 'processed' || r.status === 'pending'}
          onClick={() => replay.mutate(r.id)}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-fg-muted transition hover:bg-surface-2 hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          پخش مجدد
        </button>
      ),
    },
  ];

  return (
    <ListPage
      title="صندوق رویداد"
      subtitle="رویدادهای دریافتی از تولیدکننده‌ها. پخش مجدد بی‌خطر است — هر پردازشگر ایدمپوتنت است."
      bare
      action={
        <GradientButton
          gradient="slate"
          icon={<RotateCcw className="h-4 w-4" />}
          loading={replayFailed.isPending}
          disabled={failedCount === 0}
          onClick={() => replayFailed.mutate()}
        >
          پخش مجدد ناموفق‌ها
        </GradientButton>
      }
      filterBar={
        <FilterBar
          hasActiveFilters={status !== ''}
          onClear={() => setStatus('')}
          resultCount={inbox.data?.length ?? 0}
          labels={{
            clear: 'حذف فیلتر',
            resultLine: (n) => `${n.toLocaleString('fa-IR')} رویداد`,
          }}
          filters={
            <SelectField
              label="وضعیت"
              dir="rtl"
              value={status}
              onValueChange={setStatus}
              options={[
                { value: '', label: 'همه' },
                ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
              ]}
            />
          }
        />
      }
      footer={
        <>
          {(replayFailed.error || replay.error) && (
            <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
              {errorMessage(replayFailed.error ?? replay.error)}
            </p>
          )}
          {replayFailed.data && (
            <p className="rounded-xl bg-success-soft px-4 py-3 text-sm text-success">
              {faNumber(replayFailed.data.replayed)} رویداد دوباره در صف قرار گرفت.
            </p>
          )}
        </>
      }
    >
      {inbox.error ? (
        <EmptyState
          icon={Inbox}
          headline="صندوق بارگیری نشد"
          description={errorMessage(inbox.error)}
          cta={
            <GradientButton
              gradient="slate"
              icon={<RefreshCw className="h-4 w-4" />}
              onClick={() => inbox.refetch()}
            >
              تلاش دوباره
            </GradientButton>
          }
        />
      ) : (
        <DataTable
          responsive
          columns={columns}
          data={inbox.data ?? []}
          keyExtractor={(r) => r.id}
          isLoading={inbox.isPending}
          emptyState={
            <EmptyState
              icon={Inbox}
              headline={status ? 'رویدادی با این وضعیت نیست' : 'رویدادی نیست'}
              description="وقتی میزرو اولین پرداخت را بفرستد، این‌جا ظاهر می‌شود."
            />
          }
        />
      )}
    </ListPage>
  );
}
