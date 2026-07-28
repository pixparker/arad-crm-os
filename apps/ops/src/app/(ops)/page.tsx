'use client';

// Overview — the launch checklist, not a metrics dashboard. It answers the one
// question the control plane exists to answer during E01: is this platform
// ready for a seller to log in and work?
//
// Each row links to the screen that fixes it, so the checklist is also the
// setup path. The subtitle counts what is done rather than repeating the
// instruction, because after the first visit the instruction is noise.

import { useBusinesses, useConnections, useInbox, useProducerBindings, useUsers } from '@/lib/api';
import { faNumber } from '@/lib/format';
import { DataRowSkeleton, ListPage, StatusBadge } from '@arad/ops-kit';
import {
  Building2,
  CheckCircle2,
  ChevronLeft,
  CircleDashed,
  Plug,
  Radio,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-card">
      <h2 className="text-sm font-semibold text-fg">{title}</h2>
      <div className="mt-4 space-y-2">{children}</div>
    </section>
  );
}

function CheckRow({
  ok,
  icon: Icon,
  label,
  hint,
  href,
  pending,
}: {
  ok: boolean;
  icon: LucideIcon;
  label: string;
  hint: string;
  href: string;
  pending?: boolean;
}) {
  if (pending) return <DataRowSkeleton count={1} />;
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border border-border p-3 transition hover:border-border-strong hover:bg-surface-2"
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
          ok ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning'
        }`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-fg">{label}</span>
        <span className="block truncate text-xs text-fg-muted">{hint}</span>
      </span>
      <StatusBadge
        tone={ok ? 'emerald' : 'amber'}
        label={ok ? 'آماده' : 'انجام نشده'}
        {...(ok ? {} : { variant: 'pulse' as const })}
      />
      <ChevronLeft className="h-4 w-4 shrink-0 rotate-180 text-fg-faint transition group-hover:text-fg-muted" />
    </Link>
  );
}

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5">
      <span className="text-sm text-fg-muted">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${danger ? 'text-danger' : 'text-fg'}`}>
        {value}
      </span>
    </div>
  );
}

export default function OpsOverviewPage() {
  const businesses = useBusinesses();
  const users = useUsers();
  const connections = useConnections();
  const bindings = useProducerBindings();
  const failed = useInbox('failed');

  const hasBusiness = (businesses.data?.length ?? 0) > 0;
  const hasUser = (users.data?.length ?? 0) > 0;
  const otpConnection = connections.data?.some(
    (c) => c.status === 'active' && c.capabilities.includes('otp_send'),
  );
  const hasBinding = (bindings.data?.length ?? 0) > 0;
  const failedCount = failed.data?.length ?? 0;
  const ready = [hasBusiness, hasUser, Boolean(otpConnection), hasBinding].filter(Boolean).length;

  return (
    <ListPage
      title="نمای کلی"
      subtitle={
        businesses.isPending
          ? 'در حال بارگیری…'
          : ready === 4
            ? 'پلتفرم آمادهٔ کار است.'
            : `${faNumber(ready)} از ${faNumber(4)} قدم راه‌اندازی انجام شده — تا کامل نشود، فروشنده نمی‌تواند کار کند.`
      }
      bare
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="راه‌اندازی">
          <CheckRow
            pending={businesses.isPending}
            ok={hasBusiness}
            icon={Building2}
            label="کسب‌وکار ثبت شده"
            hint="هر کسب‌وکار یک فضای کاری جداست"
            href="/businesses"
          />
          <CheckRow
            pending={users.isPending}
            ok={hasUser}
            icon={Users}
            label="کاربر ساخته و به کسب‌وکار وصل شده"
            hint="ورود فقط با دعوت — هیچ ثبت‌نام آزادی وجود ندارد"
            href="/users"
          />
          <CheckRow
            pending={connections.isPending}
            ok={Boolean(otpConnection)}
            icon={Plug}
            label="اتصال پیامک فعال"
            hint="بدون آن، کد ورود ارسال نمی‌شود"
            href="/connections"
          />
          <CheckRow
            pending={bindings.isPending}
            ok={hasBinding}
            icon={Radio}
            label="اتصال تولیدکنندهٔ رویداد به کسب‌وکار"
            hint="تعیین می‌کند پرداخت‌های میزرو به کدام کسب‌وکار تعلق دارد"
            href="/businesses"
          />
        </Card>

        <Card title="سلامت">
          <Stat
            label="کسب‌وکارها"
            value={businesses.data ? faNumber(businesses.data.length) : '—'}
          />
          <Stat label="کاربران" value={users.data ? faNumber(users.data.length) : '—'} />
          <Stat
            label="اتصال‌های فعال"
            value={
              connections.data
                ? faNumber(connections.data.filter((c) => c.status === 'active').length)
                : '—'
            }
          />
          <Stat
            label="رویدادهای ناموفق"
            value={failed.data ? faNumber(failedCount) : '—'}
            danger={failedCount > 0}
          />
          {failedCount > 0 && (
            <Link
              href="/inbox"
              className="flex items-center justify-center gap-1.5 rounded-xl bg-danger-soft px-3 py-2.5 text-xs font-semibold text-danger transition hover:opacity-90"
            >
              <CircleDashed className="h-3.5 w-3.5" />
              بررسی صندوق رویداد
            </Link>
          )}
          {ready === 4 && failedCount === 0 && (
            <p className="flex items-center justify-center gap-1.5 rounded-xl bg-success-soft px-3 py-2.5 text-xs font-semibold text-success">
              <CheckCircle2 className="h-3.5 w-3.5" />
              همه‌چیز سرجای خودش است
            </p>
          )}
        </Card>
      </div>
    </ListPage>
  );
}
