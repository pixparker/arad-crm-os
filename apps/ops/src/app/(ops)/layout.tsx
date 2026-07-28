'use client';

// The ops gate. 🔒 Authentication and the ops axis are different questions:
// no session → /login; a valid session without the ops axis → an explicit
// refusal, not a redirect loop (a Mizro seller logging in here must be told
// why, not bounced back to a form that will succeed and land them here again).

import { AppShell } from '@/components/app-shell';
import { useLogout, useOpsMe } from '@/lib/api';
import { ErrorState, TableSkeleton, btnGhost } from '@arad-crm/ui';
import { ApiError } from '@arad-crm/web-shared';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';

export default function OpsLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const me = useOpsMe();
  const logout = useLogout();

  const status = me.error instanceof ApiError ? me.error.status : null;
  const noSession = status === 401;

  useEffect(() => {
    if (noSession) router.replace('/login');
  }, [noSession, router]);

  if (me.isPending || noSession) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <TableSkeleton rows={4} />
      </main>
    );
  }

  if (me.error || !me.data) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <ErrorState
          message={me.error instanceof Error ? me.error.message : null}
          onRetry={() => me.refetch()}
        />
      </main>
    );
  }

  if (me.data.roles.length === 0) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 text-center">
        <h1 className="text-lg font-bold">دسترسی اپراتوری ندارید</h1>
        <p className="mt-2 text-sm text-fg-muted">
          حساب شما هیچ نقشی در کنترل‌پنل ندارد. اگر باید داشته باشید، از یک مدیر ارشد بخواهید نقش شما
          را اضافه کند.
        </p>
        <button
          type="button"
          onClick={() => logout.mutate(undefined, { onSettled: () => router.replace('/login') })}
          className={`${btnGhost} mt-5 self-center`}
        >
          خروج از حساب
        </button>
      </main>
    );
  }

  return <AppShell me={me.data}>{children}</AppShell>;
}
