'use client';

// Auth-guarded shell for everything except /login: session probe → skeleton
// splash → redirect on 401. Bottom nav + ＋ live here (thumb zone, fixed).
//
// 🔒 409 `workspace_selection_required` is a CHOICE, not an outage. A user who
// belongs to more than one business gets that status from `/v1/auth/me` (F06),
// and before this it fell into the generic error branch — "سرور در دسترس نیست"
// on a perfectly healthy server. The picker below is deliberately plain: the
// designed selector is still to come, and a wrong-looking screen beats a
// lying one.

import { BottomNav } from '@/components/bottom-nav';
import { SplashSkeleton } from '@/components/skeleton';
import { ROLE_FA } from '@/lib/labels';
import { useMe } from '@/lib/use-me';
import type { Workspace } from '@arad-crm/api-contracts';
import { ApiError, apiFetch } from '@arad-crm/web-shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';

const workspacesFrom = (error: unknown): Workspace[] | null => {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  const list = error.meta?.workspaces;
  return Array.isArray(list) ? (list as Workspace[]) : [];
};

export default function AppLayout({ children }: { children: ReactNode }) {
  const me = useMe();
  const router = useRouter();
  const unauthorized = me.error instanceof ApiError && me.error.status === 401;
  const choices = workspacesFrom(me.error);

  useEffect(() => {
    if (unauthorized) router.replace('/login');
  }, [unauthorized, router]);

  if (me.isPending || unauthorized) return <SplashSkeleton />;

  if (choices !== null) return <WorkspacePicker workspaces={choices} />;

  if (me.isError) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-6 text-center">
        <p className="font-medium">اتصال برقرار نشد</p>
        <p className="mt-2 text-sm text-fg-muted">
          سرور در دسترس نیست — اینترنت را بررسی کن و دوباره تلاش کن.
        </p>
        <button
          type="button"
          onClick={() => me.refetch()}
          className="mt-5 rounded-md bg-primary px-6 py-2.5 text-sm font-bold text-primary-fg shadow-card"
        >
          تلاش دوباره
        </button>
      </main>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md">
      {children}
      <BottomNav />
    </div>
  );
}

function WorkspacePicker({ workspaces }: { workspaces: Workspace[] }) {
  const queryClient = useQueryClient();
  const choose = useMutation({
    mutationFn: (organizationId: string) =>
      apiFetch<Workspace>('/v1/auth/workspace', {
        method: 'POST',
        body: { organization_id: organizationId },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me'] }),
  });

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6">
      <h1 className="text-xl font-bold">کدام کسب‌وکار؟</h1>
      <p className="mt-1.5 text-sm text-fg-muted">
        شما عضو بیش از یک کسب‌وکار هستید — یکی را انتخاب کنید.
      </p>
      <ul className="mt-6 overflow-hidden rounded-md border border-border bg-surface shadow-card">
        {workspaces.map((w, i) => (
          <li key={w.organization_id}>
            <button
              type="button"
              disabled={choose.isPending}
              onClick={() => choose.mutate(w.organization_id)}
              className={`flex w-full items-center justify-between p-4 text-start transition active:bg-surface-2 disabled:opacity-60 ${
                i > 0 ? 'border-t border-border' : ''
              }`}
            >
              <span className="font-bold">{w.organization_name}</span>
              <span className="text-xs text-fg-muted">{ROLE_FA[w.role] ?? w.role}</span>
            </button>
          </li>
        ))}
      </ul>
      {choose.isError && (
        <p className="mt-4 text-sm text-danger">انتخاب ثبت نشد — دوباره تلاش کنید.</p>
      )}
    </main>
  );
}
