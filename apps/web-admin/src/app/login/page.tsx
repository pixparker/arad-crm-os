'use client';

// OTP login (ADR-005): mobile → code → session cookie → /.
// Inline validation on blur; fa digits normalized before submit.

import { FormError, btnPrimary, inputClass } from '@/components/ui';
import { qk } from '@/lib/api';
import { faNumber, normalizeDigits } from '@/lib/format';
import { ApiError, apiFetch } from '@arad-crm/web-shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { type FormEvent, useRef, useState } from 'react';

const MOBILE_RE = /^09[0-9]{9}$/;

export default function LoginPage() {
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
        ? `کد نادرست است (${faNumber(remaining)} تلاش باقی‌مانده)`
        : 'کد نادرست یا منقضی است';
    }
    return err.message;
  };

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold">آراد CRM</h1>
          <p className="mt-1 text-sm text-fg-muted">پنل مدیریت فروش — ورود با شمارهٔ موبایل</p>
        </div>

        <div className="rounded-md border border-border bg-surface shadow-card p-5">
          {step === 'mobile' ? (
            <form onSubmit={submitMobile} className="space-y-3" noValidate>
              <label htmlFor="mobile" className="block text-sm font-medium">
                شمارهٔ موبایل
              </label>
              <input
                id="mobile"
                name="mobile"
                type="tel"
                dir="ltr"
                inputMode="tel"
                autoComplete="tel-national"
                placeholder="09123456789"
                className={`${inputClass} text-center`}
                value={mobile}
                onChange={(e) => {
                  setMobile(e.target.value);
                  if (fieldError) setFieldError(null);
                }}
                onBlur={() => {
                  if (mobile && !mobileValid)
                    setFieldError('شمارهٔ موبایل را به شکل ۰۹۱۲۳۴۵۶۷۸۹ وارد کنید');
                }}
                aria-invalid={fieldError ? true : undefined}
                aria-describedby={fieldError ? 'mobile-error' : undefined}
              />
              <div id="mobile-error">
                <FormError>{fieldError ?? apiError(requestOtp.error)}</FormError>
              </div>
              <button
                type="submit"
                className={`${btnPrimary} w-full`}
                disabled={requestOtp.isPending}
              >
                {requestOtp.isPending ? 'در حال ارسال…' : 'دریافت کد ورود'}
              </button>
            </form>
          ) : (
            <form onSubmit={submitCode} className="space-y-3" noValidate>
              <label htmlFor="otp" className="block text-sm font-medium">
                کد ورود
              </label>
              <p className="text-xs text-fg-muted">
                کد پیامک‌شده به <span dir="ltr">{normalizedMobile}</span> را وارد کنید.
              </p>
              <input
                id="otp"
                name="otp"
                type="text"
                dir="ltr"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="· · · · ·"
                className={`${inputClass} text-center tracking-widest`}
                ref={codeRef}
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  if (fieldError) setFieldError(null);
                }}
                aria-invalid={fieldError ? true : undefined}
                aria-describedby={fieldError ? 'otp-error' : undefined}
              />
              <div id="otp-error">
                <FormError>{fieldError ?? apiError(verify.error)}</FormError>
              </div>
              <button type="submit" className={`${btnPrimary} w-full`} disabled={verify.isPending}>
                {verify.isPending ? 'در حال بررسی…' : 'ورود'}
              </button>
              <button
                type="button"
                className="w-full text-center text-xs text-fg-muted hover:text-fg"
                onClick={() => {
                  setStep('mobile');
                  setCode('');
                  setFieldError(null);
                  verify.reset();
                }}
              >
                اصلاح شماره / ارسال دوباره
              </button>
            </form>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-fg-muted">
          ورود فقط برای اعضای دعوت‌شدهٔ سازمان فعال است.
        </p>
      </div>
    </main>
  );
}
