'use client';

// Auth-guarded shell for everything except /login: session probe → skeleton
// splash → redirect on 401. Bottom nav lives here (thumb zone, fixed).

import { BottomNav } from '@/components/bottom-nav';
import { SplashSkeleton } from '@/components/skeleton';
import { useMe } from '@/lib/use-me';
import { ApiError } from '@arad-crm/web-shared';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';

export default function AppLayout({ children }: { children: ReactNode }) {
  const me = useMe();
  const router = useRouter();
  const unauthorized = me.error instanceof ApiError && me.error.status === 401;

  useEffect(() => {
    if (unauthorized) router.replace('/login');
  }, [unauthorized, router]);

  if (me.isPending || unauthorized) return <SplashSkeleton />;

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
          className="mt-5 rounded-md bg-gradient-primary shadow-card px-6 py-2.5 text-sm font-bold text-primary-fg"
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
