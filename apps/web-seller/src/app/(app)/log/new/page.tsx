'use client';

// ＋ «ثبت تماس / ثبت بازدید / یادداشت» — the account picker the ＋ rows imply.
// Every activity attaches to a file, so this asks which one and then hands off
// to the quick-log screen with the kind preselected («ثبت سریع» is where the
// <2-minute flow and the mandatory next action already live).

import { AccountPicker } from '@/components/account-picker';
import { FormShell } from '@/components/form-shell';
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

  // No `submitLabel`: picking a row IS the submit. The old hand-rolled header
  // here had no escape control at all — the shared shell always gives one.
  return (
    <FormShell title={copy?.title ?? ''} subtitle={copy?.subtitle ?? ''}>
      <AccountPicker
        onPick={(id) => router.push(`/accounts/${id}/log?kind=${kind}`)}
        emptyHint="فعالیت روی پروندهٔ موجود ثبت می‌شود — اول یک سرنخ یا مشتری بسازید."
      />
    </FormShell>
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
