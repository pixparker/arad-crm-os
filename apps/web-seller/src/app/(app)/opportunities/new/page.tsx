'use client';

// ＋ «فرصت» — confirmed need and fit on a file that already exists. Two steps,
// because a deal without an account is not a deal: pick the file, then say what
// stage it is at and what it is worth. Arriving from a file («فرصت» on the
// record screen) skips step one — the seller already answered it.
//
// 🔒 `status` is not on this form at all. A deal becomes `won` when a payment
// event arrives from Mizro — never because someone tapped a button. And the
// estimate is typed in Toman but sent in Rial as a digit-string.

import { AccountPicker } from '@/components/account-picker';
import { ChoiceChip, TextField } from '@/components/field';
import { FormShell } from '@/components/form-shell';
import { useToast } from '@/components/toast';
import { faNum, normalizeDigits, toFaDigits } from '@/lib/format';
import type { AccountDetailResponse } from '@/lib/types';
import type { Opportunity } from '@arad-crm/api-contracts';
import { OPPORTUNITY_STAGES } from '@arad-crm/vertical-mizro';
import { apiFetch } from '@arad-crm/web-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, Suspense, useState } from 'react';

function NewOpportunityForm() {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const preselected = useSearchParams().get('account');

  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);
  const [cleared, setCleared] = useState(false);

  // Only fetched when the ＋ was pressed from a file and nothing is picked yet.
  const prefill = useQuery({
    queryKey: ['accounts', preselected],
    queryFn: () => apiFetch<AccountDetailResponse>(`/v1/accounts/${preselected}`),
    enabled: Boolean(preselected) && !picked && !cleared,
  });

  const account =
    picked ??
    (!cleared && prefill.data
      ? { id: prefill.data.account.id, name: prefill.data.account.name }
      : null);

  const setAccount = (next: { id: string; name: string } | null) => {
    setPicked(next);
    if (next === null) setCleared(true);
  };
  const [stage, setStage] = useState(OPPORTUNITY_STAGES[0]?.code ?? 'qualified');
  const [toman, setToman] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const tomanDigits = normalizeDigits(toman).replace(/\D/g, '');

  const create = useMutation({
    mutationFn: () =>
      apiFetch<Opportunity>('/v1/opportunities', {
        method: 'POST',
        body: {
          account_id: account?.id,
          stage,
          // 🔒 Toman → Rial as strings, so a big estimate never touches a float
          ...(tomanDigits ? { amount_estimate_rial: `${tomanDigits}0` } : {}),
        },
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['opportunities'] }),
      ]);
      toast('فرصت ثبت شد ✓', 'success');
      router.replace(account ? `/accounts/${account.id}` : '/pipeline');
    },
    onError: () => toast('ثبت فرصت ناموفق بود — دوباره تلاش کن', 'danger'),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!account) {
      setErrors({ account: 'ابتدا پرونده را انتخاب کنید' });
      return;
    }
    setErrors({});
    create.mutate();
  };

  if (!account) {
    return (
      <FormShell
        title="فرصت جدید"
        subtitle="کدام پرونده؟"
        submitLabel="ابتدا پرونده را انتخاب کنید"
        onSubmit={(e) => e.preventDefault()}
        disabled
      >
        <AccountPicker
          onPick={(id, name) => setAccount({ id, name })}
          emptyHint="فرصت روی پروندهٔ موجود ثبت می‌شود — اول یک سرنخ یا مشتری بسازید."
        />
        {errors.account ? <p className="text-sm text-danger">{errors.account}</p> : null}
      </FormShell>
    );
  }

  return (
    <FormShell
      title="فرصت جدید"
      subtitle={account.name}
      submitLabel="ثبت فرصت"
      onSubmit={onSubmit}
      busy={create.isPending}
      note={
        tomanDigits ? (
          <>
            ارزش تخمینی: <b className="num text-fg">{faNum(Number(tomanDigits))}</b> تومان
          </>
        ) : null
      }
    >
      <button
        type="button"
        onClick={() => setAccount(null)}
        className="flex w-full items-center justify-between rounded-md border border-border bg-surface p-3.5 text-start"
      >
        <span>
          <span className="block text-[11px] text-fg-muted">پرونده</span>
          <span className="block text-sm font-bold">{account.name}</span>
        </span>
        <span className="text-xs font-semibold text-primary-ink">تغییر</span>
      </button>

      <div>
        <p className="mb-2 text-sm font-medium">مرحله</p>
        <div className="flex flex-wrap gap-2">
          {OPPORTUNITY_STAGES.map((s) => (
            <ChoiceChip key={s.code} selected={stage === s.code} onClick={() => setStage(s.code)}>
              {s.label}
            </ChoiceChip>
          ))}
        </div>
      </div>

      <TextField
        label="ارزش تخمینی (تومان)"
        dir="ltr"
        inputMode="numeric"
        className="num"
        placeholder="۴۲۵۰۰۰۰"
        hint="اختیاری — روی «ارزش پایپلاین» در خانه اثر می‌گذارد."
        value={toFaDigits(toman)}
        onChange={(e) => setToman(normalizeDigits(e.target.value).replace(/\D/g, '').slice(0, 12))}
      />
    </FormShell>
  );
}

export default function NewOpportunityPage() {
  // useSearchParams needs a Suspense boundary in the app router.
  return (
    <Suspense fallback={<div className="min-h-dvh bg-bg" />}>
      <NewOpportunityForm />
    </Suspense>
  );
}
