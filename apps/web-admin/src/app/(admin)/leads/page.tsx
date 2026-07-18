'use client';

// تخصیص سرنخ — dense ops table with deep-linkable tabs (?view=unassigned|all)
// and per-row assignment via a seller-picker modal (territory-aware).

import { Modal } from '@/components/modal';
import {
  Chip,
  EmptyState,
  ErrorState,
  FormError,
  PageHeader,
  TableSkeleton,
  btnPrimary,
  btnRowAction,
  inputClass,
} from '@/components/ui';
import { type Lead, type TeamMember, useAssignLead, useLeads, useMe, useTeam } from '@/lib/api';
import {
  LEAD_STATUS_LABELS,
  LEAD_STATUS_TONES,
  ROLE_LABELS,
  faDate,
  nextActionLabel,
  normalizeDigits,
  sourceLabel,
} from '@/lib/format';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';

type View = 'unassigned' | 'all';

function AssignModal({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const team = useTeam();
  const assign = useAssignLead();
  const [sellerId, setSellerId] = useState<string | null>(null);

  const sellers = useMemo(
    () =>
      (team.data?.items ?? []).filter(
        (m: TeamMember) =>
          (m.role === 'visitor_seller' || m.role === 'followup_seller') && m.status !== 'disabled',
      ),
    [team.data],
  );

  const selected = sellers.find((s) => s.user_id === sellerId);
  const territoryMismatch =
    selected != null &&
    lead.territory_id != null &&
    selected.territory_id != null &&
    selected.territory_id !== lead.territory_id;

  return (
    <Modal title={`تخصیص «${lead.account_name}»`} onClose={onClose}>
      {team.isPending ? (
        <TableSkeleton rows={4} />
      ) : team.error ? (
        <ErrorState error={team.error} onRetry={() => void team.refetch()} />
      ) : sellers.length === 0 ? (
        <EmptyState
          title="فروشنده‌ای در تیم نیست"
          hint="ابتدا از صفحهٔ «تیم فروش» فروشنده اضافه کنید."
          action={
            <Link href="/team" className={btnPrimary}>
              تیم فروش
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-fg-muted">
            فروشنده را انتخاب کنید — منطقهٔ هر فروشنده کنار نامش آمده است.
          </p>
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {sellers.map((s) => (
              <label
                key={s.user_id}
                className={`flex cursor-pointer items-center justify-between gap-2 rounded-sm border px-3 py-2 text-sm ${
                  sellerId === s.user_id
                    ? 'tint-primary border-primary'
                    : 'border-border hover:bg-surface-2'
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <input
                    type="radio"
                    name="seller"
                    className="accent-current"
                    checked={sellerId === s.user_id}
                    onChange={() => setSellerId(s.user_id)}
                  />
                  <span className="truncate font-medium">{s.display_name}</span>
                  <span className="shrink-0 text-xs text-fg-muted">{ROLE_LABELS[s.role]}</span>
                </span>
                <span className="shrink-0 text-xs text-fg-muted">
                  {s.territory_name ?? 'بدون منطقه'}
                </span>
              </label>
            ))}
          </div>

          {territoryMismatch ? (
            <p className="tint-warning rounded-sm px-3 py-2 text-xs text-warning">
              منطقهٔ فروشنده با منطقهٔ سرنخ متفاوت است — تخصیص به‌عنوان «خارج از منطقه» با مجوز مدیر
              ثبت و ممیزی می‌شود.
            </p>
          ) : null}

          <FormError>{assign.error ? assign.error.message : null}</FormError>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              className={btnPrimary}
              disabled={sellerId === null || assign.isPending}
              onClick={() => {
                if (sellerId === null) return;
                assign.mutate(
                  { leadId: lead.id, seller_id: sellerId, override_territory: territoryMismatch },
                  { onSuccess: onClose },
                );
              }}
            >
              {assign.isPending ? 'در حال تخصیص…' : 'تخصیص سرنخ'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function LeadsTable({ view, canAssign }: { view: View; canAssign: boolean }) {
  const leadsQuery = useLeads(view);
  const [filter, setFilter] = useState('');
  const [assigning, setAssigning] = useState<Lead | null>(null);

  const now = Date.now();
  const items = useMemo(() => {
    const all = leadsQuery.data?.items ?? [];
    const q = normalizeDigits(filter).trim();
    if (!q) return all;
    return all.filter(
      (l) =>
        l.account_name.includes(q) ||
        (l.region_text ?? '').includes(q) ||
        (l.account_phone ?? '').includes(q) ||
        (l.assigned_to_name ?? '').includes(q),
    );
  }, [leadsQuery.data, filter]);

  if (leadsQuery.isPending) {
    return (
      <div className="rounded-md border border-border bg-surface shadow-card">
        <TableSkeleton rows={8} />
      </div>
    );
  }
  if (leadsQuery.error) {
    return <ErrorState error={leadsQuery.error} onRetry={() => void leadsQuery.refetch()} />;
  }

  if ((leadsQuery.data.items ?? []).length === 0) {
    return view === 'unassigned' ? (
      <EmptyState
        title="سرنخ تخصیص‌نیافته‌ای نیست"
        hint="همهٔ سرنخ‌ها تخصیص یافته‌اند؛ سرنخ تازه را از فایل وارد کنید."
        action={
          <Link href="/leads/import" className={btnPrimary}>
            وارد کردن از فایل
          </Link>
        }
      />
    ) : (
      <EmptyState
        title="هنوز سرنخی ثبت نشده"
        hint="فهرست کافه‌ها را از فایل (شیت) وارد کنید تا کار تخصیص شروع شود."
        action={
          <Link href="/leads/import" className={btnPrimary}>
            وارد کردن از فایل
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="جست‌وجو: نام، منطقه، شماره…"
          aria-label="جست‌وجو در سرنخ‌ها"
          className={`${inputClass} max-w-xs`}
        />
        <span className="text-xs text-fg-muted">
          {items.length === (leadsQuery.data.items ?? []).length
            ? `${items.length} سرنخ`
            : `${items.length} از ${(leadsQuery.data.items ?? []).length} سرنخ`}
        </span>
      </div>

      {items.length === 0 ? (
        <EmptyState title="نتیجه‌ای پیدا نشد" hint="عبارت جست‌وجو را کوتاه‌تر کنید." />
      ) : (
        <div className="overflow-x-auto rounded-md border border-border bg-surface shadow-card">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-right text-xs text-fg-muted">
                <th className="px-3 py-2 font-medium">کسب‌وکار</th>
                <th className="px-3 py-2 font-medium">منطقه</th>
                <th className="px-3 py-2 font-medium">منبع</th>
                <th className="px-3 py-2 font-medium">وضعیت</th>
                <th className="px-3 py-2 font-medium">فروشنده</th>
                <th className="px-3 py-2 font-medium">اقدام بعدی</th>
                <th className="px-3 py-2 font-medium">ثبت</th>
                {canAssign ? <th className="px-3 py-2 font-medium">اقدام</th> : null}
              </tr>
            </thead>
            <tbody>
              {items.map((lead) => {
                const overdue =
                  lead.next_action_at !== null && new Date(lead.next_action_at).getTime() < now;
                return (
                  <tr
                    key={lead.id}
                    className="border-b border-border last:border-b-0 hover:bg-surface-2"
                  >
                    <td className="px-3 py-2">
                      <p className="font-medium">{lead.account_name}</p>
                      {lead.account_phone ? (
                        <p className="text-xs text-fg-muted" dir="ltr">
                          {lead.account_phone}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-fg-muted">{lead.region_text ?? '—'}</td>
                    <td className="px-3 py-2">
                      <Chip>{sourceLabel(lead.source)}</Chip>
                    </td>
                    <td className="px-3 py-2">
                      <Chip tone={LEAD_STATUS_TONES[lead.status]}>
                        {LEAD_STATUS_LABELS[lead.status]}
                      </Chip>
                    </td>
                    <td className="px-3 py-2">{lead.assigned_to_name ?? '—'}</td>
                    <td className="px-3 py-2">
                      {lead.next_action_type ? (
                        <>
                          <p>{nextActionLabel(lead.next_action_type)}</p>
                          {lead.next_action_at ? (
                            <p
                              className={`text-xs ${overdue ? 'font-medium text-danger' : 'text-fg-muted'}`}
                            >
                              {faDate(lead.next_action_at)}
                              {overdue ? ' · گذشته' : ''}
                            </p>
                          ) : null}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-fg-muted">{faDate(lead.created_at)}</td>
                    {canAssign ? (
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          className={btnRowAction}
                          onClick={() => setAssigning(lead)}
                        >
                          {lead.assigned_to === null ? 'تخصیص' : 'تغییر فروشنده'}
                        </button>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {assigning ? <AssignModal lead={assigning} onClose={() => setAssigning(null)} /> : null}
    </div>
  );
}

function LeadsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const me = useMe();
  const role = me.data?.membership.role;
  const canAssign = role === 'sales_manager' || role === 'owner_admin';
  // finance can list ?view=all only — hide the manager-only tab for them
  const view: View = !canAssign ? 'all' : searchParams.get('view') === 'all' ? 'all' : 'unassigned';

  const tabs: { key: View; label: string }[] = canAssign
    ? [
        { key: 'unassigned', label: 'تخصیص‌نیافته' },
        { key: 'all', label: 'همه' },
      ]
    : [{ key: 'all', label: 'همه' }];

  return (
    <div className="space-y-4">
      <PageHeader
        title="تخصیص سرنخ"
        subtitle="سرنخ‌های واردشده را به فروشندهٔ منطقهٔ درست بسپارید"
        actions={
          canAssign ? (
            <Link href="/leads/import" className={btnPrimary}>
              وارد کردن از فایل
            </Link>
          ) : undefined
        }
      />

      <div role="tablist" aria-label="نمای سرنخ‌ها" className="flex gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={view === t.key}
            onClick={() => router.replace(`/leads?view=${t.key}`, { scroll: false })}
            className={`-mb-px rounded-t-sm border-b-2 px-4 py-2 text-sm ${
              view === t.key
                ? 'border-primary font-medium text-primary'
                : 'border-transparent text-fg-muted hover:text-fg'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <LeadsTable view={view} canAssign={canAssign} />
    </div>
  );
}

export default function LeadsPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-md border border-border bg-surface shadow-card">
          <TableSkeleton rows={8} />
        </div>
      }
    >
      <LeadsContent />
    </Suspense>
  );
}
