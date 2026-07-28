'use client';

// ＋ «مشتری» — a file for a business the seller already knows, with no lead
// pipeline entry behind it (the registry's `customer` entry).
//
// 🔒 There is no status field. `customer` means a detected payment event and is
// written by the worker; a file created here starts in the funnel and is
// promoted by a real sale, never by a form.

import { TextField } from '@/components/field';
import { FormShell } from '@/components/form-shell';
import { useToast } from '@/components/toast';
import { normalizeDigits, toFaDigits } from '@/lib/format';
import type { Account, AccountLookupResponse } from '@arad-crm/api-contracts';
import { ApiError, apiFetch } from '@arad-crm/web-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

export default function NewAccountPage() {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    business_name: '',
    contact_name: '',
    contact_role: '',
    phone: '',
    city: '',
    region_text: '',
    business_type: '',
    instagram: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const phoneDigits = normalizeDigits(form.phone).replace(/\D/g, '');
  const lookup = useQuery({
    queryKey: ['account-lookup', phoneDigits],
    queryFn: () => apiFetch<AccountLookupResponse>(`/v1/accounts/lookup?phone=${phoneDigits}`),
    enabled: phoneDigits.length === 11,
    staleTime: 60_000,
  });

  const create = useMutation({
    mutationFn: () =>
      apiFetch<Account>('/v1/accounts', {
        method: 'POST',
        body: {
          business_name: form.business_name.trim(),
          ...(phoneDigits ? { phone: phoneDigits } : {}),
          region_text: [form.city.trim(), form.region_text.trim()].filter(Boolean).join(' · '),
          ...(form.contact_name.trim() ? { contact_name: form.contact_name.trim() } : {}),
          ...(form.contact_role.trim() ? { contact_role: form.contact_role.trim() } : {}),
          ...(form.business_type.trim() ? { business_type: form.business_type.trim() } : {}),
          ...(form.instagram.trim() ? { instagram: form.instagram.trim() } : {}),
        },
      }),
    onSuccess: async (account) => {
      await queryClient.invalidateQueries({ queryKey: ['accounts'] });
      toast('پرونده ثبت شد ✓', 'success');
      router.replace(`/accounts/${account.id}`);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        setErrors({ phone: 'کسب‌وکاری با این شماره از قبل ثبت شده است' });
        return;
      }
      if (err instanceof ApiError && err.status === 403) {
        toast('ثبت پرونده در منطقهٔ دیگر مجاز نیست', 'danger');
        return;
      }
      toast('ثبت ناموفق بود — دوباره تلاش کن', 'danger');
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (form.business_name.trim().length < 2) next.business_name = 'نام کسب‌وکار را وارد کنید';
    if (phoneDigits.length > 0 && phoneDigits.length !== 11) {
      next.phone = 'شمارهٔ موبایل ۱۱ رقمی وارد کنید';
    }
    setErrors(next);
    if (Object.keys(next).length === 0) create.mutate();
  };

  return (
    <FormShell
      title="مشتری جدید"
      subtitle="پرونده‌ای که از قبل می‌شناسید — بدون سرنخ"
      submitLabel="ثبت پرونده"
      onSubmit={onSubmit}
      busy={create.isPending}
    >
      <TextField
        label="نام کافه / رستوران"
        required
        placeholder="مثلاً کافه لونا"
        value={form.business_name}
        onChange={(e) => setForm((f) => ({ ...f, business_name: e.target.value }))}
        error={errors.business_name}
      />
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="فرد رابط"
          placeholder="نام و نام خانوادگی"
          value={form.contact_name}
          onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))}
        />
        <TextField
          label="سمت"
          placeholder="مدیر، مالک…"
          value={form.contact_role}
          onChange={(e) => setForm((f) => ({ ...f, contact_role: e.target.value }))}
        />
      </div>
      <TextField
        label="شمارهٔ موبایل"
        dir="ltr"
        inputMode="numeric"
        className="num"
        placeholder="۰۹۱۲۳۴۵۶۷۸۹"
        hint="اختیاری — ولی تنها راه تشخیص پروندهٔ تکراری است."
        value={toFaDigits(form.phone)}
        onChange={(e) =>
          setForm((f) => ({
            ...f,
            phone: normalizeDigits(e.target.value).replace(/\D/g, '').slice(0, 11),
          }))
        }
        error={errors.phone}
      />

      {lookup.data?.found && (
        <p
          className={`rounded-md border p-3 text-[13px] ${
            lookup.data.visible_to_me
              ? 'border-warning/30 bg-warning-soft text-fg'
              : 'border-border bg-surface-2 text-fg-muted'
          }`}
        >
          {lookup.data.visible_to_me ? (
            <>
              «{lookup.data.name}» با این شماره ثبت شده است.{' '}
              <Link
                href={`/accounts/${lookup.data.account_id}`}
                className="font-semibold text-primary-ink"
              >
                رفتن به پرونده
              </Link>
            </>
          ) : (
            lookup.data.message
          )}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="شهر"
          placeholder="تهران"
          value={form.city}
          onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
        />
        <TextField
          label="منطقه"
          placeholder="مثلاً ونک"
          value={form.region_text}
          onChange={(e) => setForm((f) => ({ ...f, region_text: e.target.value }))}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="نوع کسب‌وکار"
          placeholder="کافه، رستوران…"
          value={form.business_type}
          onChange={(e) => setForm((f) => ({ ...f, business_type: e.target.value }))}
        />
        <TextField
          label="اینستاگرام"
          dir="ltr"
          placeholder="@cafe"
          value={form.instagram}
          onChange={(e) => setForm((f) => ({ ...f, instagram: e.target.value }))}
        />
      </div>
    </FormShell>
  );
}
