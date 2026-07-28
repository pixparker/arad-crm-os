'use client';

// Audit — every mutating ops action, across every tenant. 🔒 This screen is
// the payoff for the same-transaction audit rule (ADR-014 §2): ops crosses
// tenant boundaries by definition, so the trail is the only control that
// survives a mistake.
//
// A real table, not rows: this is log data — six short facts per line, read by
// scanning down a column. `responsive` reflows it into cards on a phone rather
// than clipping, because an incident gets looked at from wherever you are.

import { errorMessage, useAudit, useBusinesses } from '@/lib/api';
import { faDateTimeOf } from '@/lib/format';
import {
  DataTable,
  type DataTableColumn,
  EmptyState,
  FilterBar,
  GradientButton,
  ListPage,
  SelectField,
} from '@arad/ops-kit';
import { RefreshCw, ScrollText } from 'lucide-react';
import { useState } from 'react';

type Row = NonNullable<ReturnType<typeof useAudit>['data']>[number];

export default function AuditPage() {
  const [orgFilter, setOrgFilter] = useState('');
  const audit = useAudit(orgFilter || undefined);
  const businesses = useBusinesses();

  const columns: DataTableColumn<Row>[] = [
    {
      key: 'at',
      header: 'زمان',
      priority: 'secondary',
      cell: (r) => (
        <span className="whitespace-nowrap text-slate-500">{faDateTimeOf(r.created_at)}</span>
      ),
    },
    {
      key: 'action',
      header: 'عمل',
      priority: 'primary',
      cell: (r) => (
        <span dir="ltr" className="font-mono text-slate-900">
          {r.action}
        </span>
      ),
    },
    {
      key: 'entity',
      header: 'موجودیت',
      cell: (r) => (
        <span dir="ltr" className="font-mono text-slate-500">
          {r.entity_type}
        </span>
      ),
    },
    {
      key: 'org',
      header: 'کسب‌وکار',
      cell: (r) => r.organization_name ?? <span className="text-slate-300">— پلتفرم —</span>,
    },
    {
      key: 'actor',
      header: 'اپراتور',
      cell: (r) => (
        <span dir="ltr" className="font-mono">
          {r.actor_phone ?? '—'}
        </span>
      ),
    },
    {
      key: 'detail',
      header: 'جزئیات',
      cell: (r) => (
        <details className="text-slate-500">
          <summary className="cursor-pointer select-none">نمایش</summary>
          <pre
            dir="ltr"
            className="ops-themed-scroll mt-1 max-h-64 max-w-md overflow-auto rounded-lg bg-slate-50 p-2 text-[11px] leading-5"
          >
            {JSON.stringify({ before: r.before, after: r.after }, null, 2)}
          </pre>
        </details>
      ),
    },
  ];

  return (
    <ListPage
      title="رخدادها"
      subtitle="هر تغییر اپراتوری در همان تراکنشِ خودِ تغییر ثبت می‌شود — نه بعد از آن."
      bare
      filterBar={
        <FilterBar
          hasActiveFilters={orgFilter !== ''}
          onClear={() => setOrgFilter('')}
          resultCount={audit.data?.length ?? 0}
          labels={{
            clear: 'حذف فیلتر',
            resultLine: (n) => `${n.toLocaleString('fa-IR')} رخداد`,
          }}
          filters={
            <SelectField
              label="کسب‌وکار"
              dir="rtl"
              value={orgFilter}
              onValueChange={setOrgFilter}
              options={[
                { value: '', label: 'همه' },
                ...(businesses.data ?? []).map((b) => ({ value: b.id, label: b.name })),
              ]}
            />
          }
        />
      }
    >
      {audit.error ? (
        <EmptyState
          icon={ScrollText}
          headline="رخدادها بارگیری نشد"
          description={errorMessage(audit.error)}
          cta={
            <GradientButton
              gradient="slate"
              icon={<RefreshCw className="h-4 w-4" />}
              onClick={() => audit.refetch()}
            >
              تلاش دوباره
            </GradientButton>
          }
        />
      ) : (
        <DataTable
          responsive
          columns={columns}
          data={audit.data ?? []}
          keyExtractor={(r) => r.id}
          isLoading={audit.isPending}
          emptyState={
            <EmptyState
              icon={ScrollText}
              headline="رخدادی ثبت نشده"
              description="هر تغییری که از این کنترل‌پنل انجام شود، این‌جا با نام اپراتورش می‌آید."
            />
          }
        />
      )}
    </ListPage>
  );
}
