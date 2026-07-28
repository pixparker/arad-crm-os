'use client';

// Ops login — the SAME OTP flow as the tenant apps (one platform identity),
// gated afterwards by the ops axis (ADR-014 §1). Nothing here checks a role:
// the layout does, so a tenant user who logs in gets a clear refusal instead
// of a login form that silently never succeeds.

import { qk } from '@/lib/api';
import { faNumber, normalizeDigits } from '@/lib/format';
import { FormError, btnPrimary, inputClass } from '@arad-crm/ui';
import { ApiError, apiFetch } from '@arad-crm/web-shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { type FormEvent, useRef, useState } from 'react';

const MOBILE_RE = /^09[0-9]{9}$/;

export default function OpsLoginPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [step, setStep] = useState<'mobile' | 'code'>('mobile');
  const [mobile, setMobile] = useState('');
  const [code, setCode] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  const requestOtp = useMutation({
    mutationFn: (m: string) =>
      apiFetch<{ ok: true; expires_at: string; cooldown_sec: number }>('/v1/auth/request-otp', {
        method: 'POST',
        body: { mobile: m },
      }),
    onSuccess: () => {
      setStep('code');
      setFieldError(null);
      setTimeout(() => codeRef.current?.focus(), 0);
    },
  });

  const verify = useMutation({
    mutationFn: (input: { mobile: string; code: string }) =>
      apiFetch<{ ok: true }>('/v1/auth/verify', { method: 'POST', body: input }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.me });
      router.replace('/');
    },
  });

  const normalizedMobile = normalizeDigits(mobile).replace(/\s/g, '');
  const mobileValid = MOBILE_RE.test(normalizedMobile);

  const submitMobile = (e: FormEvent) => {
    e.preventDefault();
    if (!mobileValid) {
      setFieldError('شمارهٔ موبایل را به شکل ۰۹۱۲۳۴۵۶۷۸۹ وارد کنید');
      return;
    }
    setFieldError(null);
    requestOtp.mutate(normalizedMobile);
  };

  const submitCode = (e: FormEvent) => {
    e.preventDefault();
    const normalizedCode = normalizeDigits(code).trim();
    if (normalizedCode.length < 4) {
      setFieldError('کد پیامک‌شده را وارد کنید');
      return;
    }
    setFieldError(null);
    verify.mutate({ mobile: normalizedMobile, code: normalizedCode });
  };

  const apiError = (err: unknown): string | null => {
    if (!(err instanceof ApiError)) return err ? 'خطای شبکه — دوباره تلاش کنید' : null;
    if (err.status === 429) {
      const retry = err.meta?.retry_after_sec;
      return typeof retry === 'number'
        ? `درخواست زیاد — ${faNumber(retry)} ثانیه دیگر تلاش کنید`
        : 'درخواست زیاد — کمی بعد تلاش کنید';
    }
    if (err.status === 401) {
      const remaining = err.meta?.attempts_remaining;
      return typeof remaining === 'number'
        ? `کد نادرست — ${faNumber(remaining)} تلاش باقی مانده`
        : 'کد نادرست است';
    }
    // The registration gate is closed: an unknown phone never becomes an
    // account (invite-only). Say so instead of implying a retry helps.
    if (err.status === 403)
      return 'این شماره دسترسی ندارد — از یک اپراتور بخواهید شما را اضافه کند';
    return err.message;
  };

  const pending = requestOtp.isPending || verify.isPending;
  const error = fieldError ?? apiError(requestOtp.error ?? verify.error);

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-md border border-border bg-surface p-6 shadow-card">
        <h1 className="text-lg font-bold">کنترل‌پنل آراد</h1>
        <p className="mt-1 text-xs text-fg-muted">
          {step === 'mobile'
            ? 'شمارهٔ موبایل خود را وارد کنید'
            : `کد پیامک‌شده به ${normalizedMobile} را وارد کنید`}
        </p>

        {step === 'mobile' ? (
          <form onSubmit={submitMobile} className="mt-5 space-y-3">
            <input
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              inputMode="numeric"
              autoComplete="tel"
              placeholder="۰۹۱۲۳۴۵۶۷۸۹"
              className={inputClass}
              aria-label="شمارهٔ موبایل"
            />
            <FormError>{error}</FormError>
            <button type="submit" disabled={pending} className={`${btnPrimary} w-full`}>
              {pending ? 'در حال ارسال…' : 'ارسال کد'}
            </button>
          </form>
        ) : (
          <form onSubmit={submitCode} className="mt-5 space-y-3">
            <input
              ref={codeRef}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="کد ۵ رقمی"
              className={inputClass}
              aria-label="کد ورود"
            />
            <FormError>{error}</FormError>
            <button type="submit" disabled={pending} className={`${btnPrimary} w-full`}>
              {pending ? 'در حال بررسی…' : 'ورود'}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep('mobile');
                setCode('');
                setFieldError(null);
              }}
              className="w-full text-xs text-fg-muted hover:text-fg"
            >
              تغییر شماره
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
