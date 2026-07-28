'use client';

// Overview — the launch checklist, not a metrics dashboard. It answers the one
// question the control plane exists to answer during E01: is this platform
// ready for a seller to log in and work?

import { useBusinesses, useConnections, useInbox, useProducerBindings, useUsers } from '@/lib/api';
import { Chip, PageHeader, Skeleton } from '@arad-crm/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-md border border-border bg-surface p-4 shadow-card">
      <h2 className="text-sm font-bold">{title}</h2>
      <div className="mt-3 space-y-2 text-sm">{children}</div>
    </section>
  );
}

function CheckRow({
  ok,
  label,
  hint,
  href,
  pending,
}: {
  ok: boolean;
  label: string;
  hint: string;
  href: string;
  pending?: boolean;
}) {
  if (pending) return <Skeleton className="h-9 w-full" />;
  return (
    <Link
      href={href}
      className="flex items-start justify-between gap-3 rounded-sm border border-border px-3 py-2 hover:bg-surface-2"
    >
      <span className="min-w-0">
        <span className="block text-sm">{label}</span>
        <span className="block text-xs text-fg-muted">{hint}</span>
      </span>
      <Chip tone={ok ? 'success' : 'warning'}>{ok ? 'آماده' : 'انجام نشده'}</Chip>
    </Link>
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

  return (
    <>
      <PageHeader
        title="نمای کلی"
        subtitle="وضعیت راه‌اندازی پلتفرم — تا وقتی همهٔ موارد آماده نشده‌اند، فروشنده نمی‌تواند کار کند."
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="راه‌اندازی">
          <CheckRow
            pending={businesses.isPending}
            ok={hasBusiness}
            label="کسب‌وکار ثبت شده"
            hint="هر کسب‌وکار یک فضای کاری جداست"
            href="/businesses"
          />
          <CheckRow
            pending={users.isPending}
            ok={hasUser}
            label="کاربر ساخته و به کسب‌وکار وصل شده"
            hint="ورود فقط با دعوت — هیچ ثبت‌نام آزادی وجود ندارد"
            href="/users"
          />
          <CheckRow
            pending={connections.isPending}
            ok={Boolean(otpConnection)}
            label="اتصال پیامک فعال"
            hint="بدون آن، کد ورود ارسال نمی‌شود"
            href="/connections"
          />
          <CheckRow
            pending={bindings.isPending}
            ok={hasBinding}
            label="اتصال تولیدکنندهٔ رویداد به کسب‌وکار"
            hint="تعیین می‌کند پرداخت‌های میزرو به کدام کسب‌وکار تعلق دارد"
            href="/businesses"
          />
        </Card>

        <Card title="سلامت">
          <div className="flex items-center justify-between">
            <span className="text-sm text-fg-muted">کسب‌وکارها</span>
            <span className="tabular-nums">{businesses.data?.length ?? '—'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-fg-muted">کاربران</span>
            <span className="tabular-nums">{users.data?.length ?? '—'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-fg-muted">اتصال‌های فعال</span>
            <span className="tabular-nums">
              {connections.data?.filter((c) => c.status === 'active').length ?? '—'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-fg-muted">رویدادهای ناموفق</span>
            <span className="tabular-nums">
              {failed.data ? (
                <Chip tone={failed.data.length > 0 ? 'danger' : 'success'}>
                  {failed.data.length}
                </Chip>
              ) : (
                '—'
              )}
            </span>
          </div>
        </Card>
      </div>
    </>
  );
}
