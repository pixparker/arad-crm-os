'use client';

// Admin guard: session required (401 → /login) and role must be one of the
// admin roles — sellers get a clear «دسترسی مدیر ندارید» instead of data holes.

import { AppShell } from '@/components/app-shell';
import { ErrorState, Skeleton, btnGhost } from '@/components/ui';
import { isAdminRole, useLogout, useMe } from '@/lib/api';
import { ROLE_LABELS } from '@/lib/format';
import { ApiError } from '@arad-crm/web-shared';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const me = useMe();
  const logout = useLogout();

  const unauthorized = me.error instanceof ApiError && me.error.status === 401;
  useEffect(() => {
    if (unauthorized) router.replace('/login');
  }, [unauthorized, router]);

  if (me.isPending || unauthorized) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-6 py-10">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (me.error) {
    return (
      <div className="mx-auto max-w-md px-6 py-16">
        <ErrorState error={me.error} onRetry={() => void me.refetch()} />
      </div>
    );
  }

  if (!isAdminRole(me.data.membership.role)) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-6">
        <div className="w-full max-w-sm rounded-md border border-border bg-surface shadow-card p-6 text-center">
          <p className="text-base font-bold text-danger">دسترسی مدیر ندارید</p>
          <p className="mt-2 text-sm text-fg-muted">
            نقش شما ({ROLE_LABELS[me.data.membership.role]}) به پنل مدیریت دسترسی ندارد. برای ورود
            با حساب دیگر ابتدا خارج شوید.
          </p>
          <button
            type="button"
            className={`${btnGhost} mt-4 w-full`}
            disabled={logout.isPending}
            onClick={() => logout.mutate(undefined, { onSettled: () => router.replace('/login') })}
          >
            {logout.isPending ? 'در حال خروج…' : 'خروج از حساب'}
          </button>
        </div>
      </div>
    );
  }

  return <AppShell me={me.data}>{children}</AppShell>;
}
