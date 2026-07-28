'use client';

// Integration inbox — the producer→CRM event stream, its failures, and replay.
// Moved off web-admin (ADR-014 §2): a tenant surface should not be where Arad
// debugs another product's webhook.
//
// Replay is safe to press twice: every handler is idempotent and the
// commission ledger's uniqueness — not this button's discipline — is what
// prevents a double payout.

import { errorMessage, useInbox, useReplayEvent, useReplayFailed } from '@/lib/api';
import { faDateTimeOf } from '@/lib/format';
import {
  Chip,
  DataTable,
  EmptyState,
  ErrorState,
  FormError,
  PageHeader,
  TableSkeleton,
  btnGhost,
  btnRowAction,
  inputClass,
} from '@arad-crm/ui';
import { useState } from 'react';

const STATUS_LABELS: Record<string, string> = {
  pending: 'در انتظار',
  processed: 'پردازش شد',
  skipped: 'رد شد',
  failed: 'ناموفق',
  dead: 'متوقف',
};

export default function InboxPage() {
  const [status, setStatus] = useState('');
  const inbox = useInbox(status || undefined);
  const replay = useReplayEvent();
  const replayFailed = useReplayFailed();

  return (
    <>
      <PageHeader
        title="صندوق رویداد"
        subtitle="رویدادهای دریافتی از تولیدکننده‌ها. پخش مجدد بی‌خطر است — هر پردازشگر ایدمپوتنت است."
        actions={
          <button
            type="button"
            className={btnGhost}
            disabled={replayFailed.isPending}
            onClick={() => replayFailed.mutate()}
          >
            پخش مجدد همهٔ ناموفق‌ها
          </button>
        }
      />

      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs text-fg-muted">وضعیت:</span>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={`${inputClass} w-auto`}
        >
          <option value="">همه</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>

      <FormError>
        {replayFailed.error ? errorMessage(replayFailed.error) : null}
        {replay.error ? errorMessage(replay.error) : null}
      </FormError>
      {replayFailed.data ? (
        <p className="mb-3 text-sm text-success">
          {replayFailed.data.replayed} رویداد دوباره در صف قرار گرفت.
        </p>
      ) : null}

      {inbox.isPending ? (
        <TableSkeleton />
      ) : inbox.error ? (
        <ErrorState message={errorMessage(inbox.error)} onRetry={() => inbox.refetch()} />
      ) : inbox.data.length === 0 ? (
        <EmptyState title="رویدادی نیست" />
      ) : (
        <DataTable
          head={
            <tr>
              <th className="px-3 py-2 text-start font-medium">زمان</th>
              <th className="px-3 py-2 text-start font-medium">تولیدکننده</th>
              <th className="px-3 py-2 text-start font-medium">نوع</th>
              <th className="px-3 py-2 text-start font-medium">وضعیت</th>
              <th className="px-3 py-2 text-start font-medium">تلاش</th>
              <th className="px-3 py-2 text-start font-medium">خطا</th>
              <th className="px-3 py-2 text-start font-medium">عملیات</th>
            </tr>
          }
        >
          {inbox.data.map((ev) => (
            <tr key={ev.id}>
              <td className="whitespace-nowrap px-3 py-2 text-xs text-fg-muted">
                {faDateTimeOf(ev.received_at)}
              </td>
              <td className="px-3 py-2 font-mono text-xs">{ev.producer}</td>
              <td className="px-3 py-2 font-mono text-xs">
                {ev.type}@v{ev.version}
              </td>
              <td className="px-3 py-2">
                <Chip
                  tone={
                    ev.status === 'processed'
                      ? 'success'
                      : ev.status === 'pending'
                        ? 'neutral'
                        : ev.status === 'skipped'
                          ? 'warning'
                          : 'danger'
                  }
                >
                  {STATUS_LABELS[ev.status] ?? ev.status}
                </Chip>
              </td>
              <td className="px-3 py-2 tabular-nums">{ev.attempts}</td>
              <td
                className="px-3 py-2 max-w-xs truncate text-xs text-fg-muted"
                title={ev.error ?? ''}
              >
                {ev.error ?? '—'}
              </td>
              <td className="px-3 py-2">
                <button
                  type="button"
                  className={btnRowAction}
                  disabled={
                    replay.isPending || ev.status === 'processed' || ev.status === 'pending'
                  }
                  onClick={() => replay.mutate(ev.id)}
                >
                  پخش مجدد
                </button>
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </>
  );
}
