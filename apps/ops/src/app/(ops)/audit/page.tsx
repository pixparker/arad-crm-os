'use client';

// Audit — every mutating ops action, across every tenant. 🔒 This screen is
// the payoff for the same-transaction audit rule (ADR-014 §2): ops crosses
// tenant boundaries by definition, so the trail is the only control that
// survives a mistake.

import { errorMessage, useAudit, useBusinesses } from '@/lib/api';
import { faDateTimeOf } from '@/lib/format';
import {
  DataTable,
  EmptyState,
  ErrorState,
  PageHeader,
  TableSkeleton,
  inputClass,
} from '@arad-crm/ui';
import { useState } from 'react';

export default function AuditPage() {
  const [orgFilter, setOrgFilter] = useState('');
  const audit = useAudit(orgFilter || undefined);
  const businesses = useBusinesses();

  return (
    <>
      <PageHeader
        title="رخدادها"
        subtitle="هر تغییر اپراتوری در همان تراکنشِ خودِ تغییر ثبت می‌شود — نه بعد از آن."
      />

      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs text-fg-muted">کسب‌وکار:</span>
        <select
          value={orgFilter}
          onChange={(e) => setOrgFilter(e.target.value)}
          className={`${inputClass} w-auto`}
        >
          <option value="">همه</option>
          {businesses.data?.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      {audit.isPending ? (
        <TableSkeleton />
      ) : audit.error ? (
        <ErrorState message={errorMessage(audit.error)} onRetry={() => audit.refetch()} />
      ) : audit.data.length === 0 ? (
        <EmptyState title="رخدادی ثبت نشده" />
      ) : (
        <DataTable
          head={
            <tr>
              <th className="px-3 py-2 text-start font-medium">زمان</th>
              <th className="px-3 py-2 text-start font-medium">عمل</th>
              <th className="px-3 py-2 text-start font-medium">موجودیت</th>
              <th className="px-3 py-2 text-start font-medium">کسب‌وکار</th>
              <th className="px-3 py-2 text-start font-medium">اپراتور</th>
              <th className="px-3 py-2 text-start font-medium">جزئیات</th>
            </tr>
          }
        >
          {audit.data.map((row) => (
            <tr key={row.id}>
              <td className="whitespace-nowrap px-3 py-2 text-xs text-fg-muted">
                {faDateTimeOf(row.created_at)}
              </td>
              <td className="px-3 py-2 font-mono text-xs">{row.action}</td>
              <td className="px-3 py-2 font-mono text-xs text-fg-muted">{row.entity_type}</td>
              <td className="px-3 py-2 text-xs">
                {row.organization_name ?? <span className="text-fg-faint">— پلتفرم —</span>}
              </td>
              <td className="px-3 py-2 font-mono text-xs">{row.actor_phone ?? '—'}</td>
              <td className="px-3 py-2 text-xs text-fg-muted">
                <details>
                  <summary className="cursor-pointer">نمایش</summary>
                  <pre className="mt-1 max-w-md overflow-x-auto rounded-sm bg-surface-2 p-2 text-[11px]">
                    {JSON.stringify({ before: row.before, after: row.after }, null, 2)}
                  </pre>
                </details>
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </>
  );
}
