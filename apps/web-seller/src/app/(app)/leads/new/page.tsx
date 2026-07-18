'use client';

// «سرنخ جدید» — کم‌فیلد اما دقیق (mock): the 3 starred fields are enough to
// start; a seller-introduced lead is theirs from birth (backend stamps it).
// On a duplicate phone the server 409s with a pointer to the existing account.

import { TextField } from '@/components/field';
import { ChevronLeftIcon } from '@/components/icons';
import { useToast } from '@/components/toast';
import { normalizeDigits } from '@/lib/format';
import type { Lead } from '@/lib/types';
import { ApiError, apiFetch } from '@arad-crm/web-shared';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

export default function NewLeadPage() {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState({
    business_name: '',
    phone: '',
    region_text: '',
    contact_name: '',
    business_type: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dupAccountId, setDupAccountId] = useState<string | null>(null);

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: '' }));
    if (dupAccountId) setDupAccountId(null);
  };

  const create = useMutation({
    mutationFn: (body: Record<string, string>) =>
      apiFetch<Lead>('/v1/leads', { method: 'POST', body }),
    onSuccess: (lead) => {
      toast('سرنخ ثبت شد — به نام خودت سند خورد', 'success');
      router.replace(`/accounts/${lead.account_id}?lead=${lead.id}`);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        const existing = err.meta?.existing_account_id;
        setDupAccountId(typeof existing === 'string' ? existing : null);
        setErrors((prev) => ({ ...prev, phone: 'این کسب‌وکار قبلاً ثبت شده است' }));
      } else {
        toast('ثبت سرنخ ناموفق بود — دوباره تلاش کن', 'danger');
      }
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (form.business_name.trim().length < 2) next.business_name = 'نام کسب‌وکار را وارد کن';
    const phone = normalizeDigits(form.phone.trim()).replace(/[^0-9+]/g, '');
    if (phone.length < 10) next.phone = 'شمارهٔ تماس را کامل وارد کن';
    if (form.region_text.trim().length < 1) next.region_text = 'شهر یا منطقه را وارد کن';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    create.mutate({
      business_name: form.business_name.trim(),
      phone,
      region_text: form.region_text.trim(),
      ...(form.contact_name.trim() ? { contact_name: form.contact_name.trim() } : {}),
      ...(form.business_type.trim() ? { business_type: form.business_type.trim() } : {}),
    });
  };

  return (
    <main className="flex min-h-dvh flex-col px-4 pb-28 pt-6">
      <header className="mb-5 flex items-center gap-2">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="بازگشت"
          className="-ms-2 flex h-9 w-9 items-center justify-center rounded-full text-fg-muted active:bg-surface-2"
        >
          <ChevronLeftIcon className="h-6 w-6" />
        </button>
        <h1 className="text-xl font-bold">سرنخ جدید</h1>
      </header>

      <p className="mb-5 rounded-md bg-surface-2 p-3 text-xs leading-6 text-fg-muted">
        همین سه فیلد ستاره‌دار برای شروع کافی است؛ بقیه در اولین تماس کامل می‌شود. اگر شماره تکراری
        باشد سیستم خودش هشدار می‌دهد.
      </p>

      <form onSubmit={submit} className="space-y-4" noValidate>
        <TextField
          label="نام کسب‌وکار"
          required
          value={form.business_name}
          onChange={set('business_name')}
          error={errors.business_name}
          placeholder="مثلاً کافه لونا"
        />
        <TextField
          label="شمارهٔ تماس"
          required
          dir="ltr"
          type="tel"
          inputMode="tel"
          value={form.phone}
          onChange={set('phone')}
          error={errors.phone}
          placeholder="۰۹۱۲ ۱۲۳ ۴۵۶۷"
        />
        {dupAccountId ? (
          <Link
            href={`/accounts/${dupAccountId}`}
            className="-mt-2 block text-sm font-medium text-primary underline"
          >
            مشاهدهٔ پروندهٔ موجود ←
          </Link>
        ) : null}
        <TextField
          label="شهر / منطقه"
          required
          value={form.region_text}
          onChange={set('region_text')}
          error={errors.region_text}
          placeholder="مثلاً تهران، جردن"
        />
        <TextField
          label="نام رابط"
          value={form.contact_name}
          onChange={set('contact_name')}
          hint="اختیاری"
          placeholder="مثلاً خانم مرادی"
        />
        <TextField
          label="نوع کسب‌وکار"
          value={form.business_type}
          onChange={set('business_type')}
          hint="اختیاری — کافه، رستوران، …"
        />
      </form>

      <div className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-md border-t border-border bg-surface p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <button
          type="button"
          onClick={submit}
          disabled={create.isPending}
          className="w-full rounded-md bg-gradient-primary shadow-card py-3.5 text-base font-bold text-primary-fg disabled:opacity-60"
        >
          {create.isPending ? 'در حال ثبت…' : 'ثبت سرنخ'}
        </button>
      </div>
    </main>
  );
}
