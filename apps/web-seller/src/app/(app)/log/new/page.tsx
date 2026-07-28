'use client';

// ＋ «ثبت تماس / ثبت بازدید / یادداشت» — the account picker the ＋ rows imply.
// Every activity attaches to a file, so this asks which one and then hands off
// to the quick-log screen with the kind preselected («ثبت سریع» is where the
// <2-minute flow and the mandatory next action already live).

import { AccountPicker } from '@/components/account-picker';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const TITLES: Record<string, { title: string; subtitle: string }> = {
  call: { title: 'ثبت تماس', subtitle: 'با کدام پرونده تماس گرفتید؟' },
  visit: { title: 'ثبت بازدید', subtitle: 'کدام پرونده را بازدید کردید؟' },
  note: { title: 'یادداشت جدید', subtitle: 'یادداشت روی کدام پرونده؟' },
};

function PickAccount() {
  const router = useRouter();
  const kind = useSearchParams().get('kind') ?? 'visit';
  const copy = TITLES[kind] ?? TITLES.visit;

  return (
    <main className="min-h-dvh bg-bg pb-28">
      <header className="border-b border-border bg-surface px-4 pb-4 pt-safe">
        <b className="block text-[17px] font-bold">{copy?.title}</b>
        <small className="block text-xs text-fg-muted">{copy?.subtitle}</small>
      </header>
      <div className="px-4 pt-5">
        <AccountPicker
          onPick={(id) => router.push(`/accounts/${id}/log?kind=${kind}`)}
          emptyHint="فعالیت روی پروندهٔ موجود ثبت می‌شود — اول یک سرنخ یا مشتری بسازید."
        />
      </div>
    </main>
  );
}

export default function LogPickerPage() {
  // useSearchParams needs a Suspense boundary in the app router.
  return (
    <Suspense fallback={<div className="min-h-dvh bg-bg" />}>
      <PickAccount />
    </Suspense>
  );
}
