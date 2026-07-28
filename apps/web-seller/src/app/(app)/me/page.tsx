'use client';

// «پروفایل من» — prototype screen ۰۹. Who I am, where my money is, and the way
// out. Everything on it is read from the session and the ledger; nothing is
// decorative.
//
// The prototype's three hero stats («فروش امسال / معاملهٔ بسته / حفظ مشتری»)
// are replaced by three the system can actually prove: earned, settled and
// awaiting settlement. Retention and yearly sales need a targets/period model
// that does not exist — a number invented for a hero strip is worse than a
// smaller true one.
//
// «هدف و عملکرد» and «اعلان‌ها» are shown as coming, not as working switches: a
// toggle that changes nothing teaches the seller the app lies. Switching
// workspace is here and real, because a user in two businesses needs it.

import { GearIcon } from '@/components/icons';
import { Tag } from '@/components/list-bits';
import { SplashSkeleton } from '@/components/skeleton';
import { Subhead } from '@/components/subhead';
import { useToast } from '@/components/toast';
import { faNum, formatToman, toFaDigits } from '@/lib/format';
import { CONTRACT_TYPE_FA, ROLE_FA } from '@/lib/labels';
import type { MyCommissionResponse } from '@/lib/types';
import { useMe } from '@/lib/use-me';
import type { Workspace } from '@arad-crm/api-contracts';
import { apiFetch } from '@arad-crm/web-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useState } from 'react';

export default function ProfilePage() {
  const me = useMe();
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [switching, setSwitching] = useState(false);

  const commission = useQuery({
    queryKey: ['commission', 'my'],
    queryFn: () => apiFetch<MyCommissionResponse>('/v1/commission/my'),
  });

  const logout = useMutation({
    mutationFn: () => apiFetch<{ ok: true }>('/v1/auth/logout', { method: 'POST' }),
    // Whatever the server says, the local session is over — clearing the cache
    // matters more than the response, so a failed call still ends the session.
    onSettled: () => {
      queryClient.clear();
      router.replace('/login');
    },
  });

  const choose = useMutation({
    mutationFn: (organizationId: string) =>
      apiFetch<Workspace>('/v1/auth/workspace', {
        method: 'POST',
        body: { organization_id: organizationId },
      }),
    onSuccess: async () => {
      setSwitching(false);
      await queryClient.invalidateQueries();
      toast('کسب‌وکار تغییر کرد', 'success');
    },
    onError: () => toast('تغییر کسب‌وکار ناموفق بود', 'danger'),
  });

  if (me.isPending || !me.data) return <SplashSkeleton />;

  const { user, membership, workspaces } = me.data;
  const totals = commission.data?.totals;

  return (
    <main className="min-h-dvh pb-28">
      <Subhead title="پروفایل من" back="/">
        <div className="mt-4 flex items-center gap-3.5">
          <span className="grid h-16 w-16 flex-none place-items-center rounded-full bg-white/15 text-xl font-bold">
            {[...user.display_name.replace(/[‌\s]/g, '')].slice(0, 2).join('')}
          </span>
          <span className="min-w-0">
            <b className="block truncate text-[17px] font-bold">{user.display_name}</b>
            <small className="mt-0.5 block text-xs text-on-canopy-muted">
              {[
                ROLE_FA[membership.role] ?? membership.role,
                membership.territory_name ? `منطقهٔ ${membership.territory_name}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </small>
            <span className="num ltr mt-1 block text-xs text-on-canopy-muted" dir="ltr">
              {toFaDigits(user.phone)}
            </span>
          </span>
        </div>

        {totals ? (
          <div className="mt-5 grid grid-cols-3 gap-2 border-t border-white/15 pt-3.5">
            <HeroStat label="کل کسب‌شده" rial={totals.earned_total_rial} />
            <HeroStat label="تسویه‌شده" rial={totals.paid_rial} />
            <HeroStat label="در انتظار" rial={totals.pending_rial} />
          </div>
        ) : null}
      </Subhead>

      <div className="px-4 pt-5">
        <h2 className="mb-2.5 text-[15px] font-bold">حساب</h2>
        <div className="overflow-hidden rounded-md border border-border bg-surface shadow-card">
          <SettingRow
            href="/money"
            label="کمیسیون و تسویه"
            value={
              totals ? (
                <span className="num">{formatToman(totals.pending_rial)} در انتظار</span>
              ) : null
            }
            tone="bg-gold-soft text-gold"
          />
          <SettingRow
            label="کسب‌وکار فعال"
            value={membership.organization_name}
            tone="bg-primary-soft text-primary-ink"
            {...(workspaces.length > 1 ? { onClick: () => setSwitching((v) => !v) } : {})}
          />
          {switching && workspaces.length > 1 ? (
            <div className="border-t border-border bg-surface-2 p-2">
              {workspaces.map((w) => (
                <button
                  key={w.organization_id}
                  type="button"
                  disabled={choose.isPending}
                  onClick={() => choose.mutate(w.organization_id)}
                  className={`flex w-full items-center justify-between rounded-md p-3 text-start text-[13px] transition active:bg-surface disabled:opacity-60 ${
                    w.organization_id === membership.organization_id ? 'font-bold' : ''
                  }`}
                >
                  <span>{w.organization_name}</span>
                  <span className="text-[11px] text-fg-muted">
                    {ROLE_FA[w.role] ?? w.role}
                    {w.organization_id === membership.organization_id ? ' ✓' : ''}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
          <SettingRow
            label="نوع همکاری"
            value={CONTRACT_TYPE_FA[membership.contract_type] ?? membership.contract_type}
            tone="bg-info-soft text-info"
          />
          <SettingRow
            label="هدف و عملکرد"
            value={<Tag tone="note">به‌زودی</Tag>}
            tone="bg-surface-2 text-fg-muted"
          />
          <SettingRow
            label="اعلان‌ها و یادآورها"
            value={<Tag tone="note">به‌زودی</Tag>}
            tone="bg-surface-2 text-fg-muted"
          />
        </div>

        <h2 className="mb-2.5 mt-6 text-[15px] font-bold">کارها</h2>
        <div className="overflow-hidden rounded-md border border-border bg-surface shadow-card">
          <SettingRow
            href="/tasks"
            label="کارها و یادآورها"
            tone="bg-primary-soft text-primary-ink"
          />
          <SettingRow href="/pipeline" label="پایپلاین فروش" tone="bg-info-soft text-info" />
          <SettingRow href="/accounts" label="سرنخ‌ها و مشتریان" tone="bg-gold-soft text-gold" />
        </div>

        <button
          type="button"
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
          className="mt-6 w-full rounded-md border border-danger/30 bg-danger-soft py-3.5 text-sm font-bold text-danger transition active:bg-danger active:text-white disabled:opacity-60"
        >
          {logout.isPending ? 'در حال خروج…' : 'خروج از حساب'}
        </button>

        <p className="mt-5 text-center text-[11px] text-fg-faint">
          میزرو سِیلز · {faNum(1)}٫{faNum(0)}
        </p>
      </div>
    </main>
  );
}

function HeroStat({ label, rial }: { label: string; rial: string }) {
  return (
    <span className="block">
      <span className="num block text-[13px] font-bold">{formatToman(rial)}</span>
      <span className="mt-0.5 block text-[10px] text-on-canopy-muted">{label}</span>
    </span>
  );
}

function SettingRow({
  href,
  onClick,
  label,
  value,
  tone,
}: {
  href?: string;
  onClick?: () => void;
  label: string;
  value?: ReactNode;
  tone: string;
}) {
  const body = (
    <>
      <span className={`grid h-8 w-8 flex-none place-items-center rounded-md ${tone}`}>
        <GearIcon className="h-4 w-4" />
      </span>
      <span className="flex-1 text-[13px] font-semibold">{label}</span>
      {value ? <span className="text-[11px] text-fg-muted">{value}</span> : null}
      {href || onClick ? (
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="flex-none text-fg-faint"
        >
          <path d="m15 18-6-6 6-6" />
        </svg>
      ) : null}
    </>
  );
  const className =
    'flex w-full items-center gap-3 border-t border-border p-3.5 text-start first:border-t-0 transition active:bg-surface-2';

  if (href) {
    return (
      <Link href={href} className={className}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {body}
      </button>
    );
  }
  return <div className={className}>{body}</div>;
}
