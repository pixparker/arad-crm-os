'use client';

// ورود — phone OTP in two steps. Errors surface inline next to the field
// (ux-best-practices/inline-form-validation), 429 cooldown counts down live.

import { inputClass } from '@/components/field';
import { faNum, normalizeDigits } from '@/lib/format';
import type { RequestOtpResponse } from '@/lib/types';
import { useMe } from '@/lib/use-me';
import type { MeResponse } from '@arad-crm/api-contracts';
import { ApiError, apiFetch } from '@arad-crm/web-shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';

const metaNumber = (err: unknown, key: string): number | null => {
  if (err instanceof ApiError && typeof err.meta?.[key] === 'number') {
    return err.meta[key] as number;
  }
  return null;
};

export default function LoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const me = useMe();

  const [step, setStep] = useState<'mobile' | 'code'>('mobile');
  const [mobile, setMobile] = useState('');
  const [code, setCode] = useState('');
  const [mobileError, setMobileError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  // already signed in → straight to «امروز من»
  useEffect(() => {
    if (me.data) router.replace('/');
  }, [me.data, router]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const requestOtp = useMutation({
    mutationFn: (m: string) =>
      apiFetch<RequestOtpResponse>('/v1/auth/request-otp', { method: 'POST', body: { mobile: m } }),
    onSuccess: (data) => {
      setStep('code');
      setCode('');
      setCodeError(null);
      setCooldown(data.cooldown_sec);
    },
    onError: (err) => {
      const retryAfter = metaNumber(err, 'retry_after_sec');
      if (err instanceof ApiError && err.status === 429) {
        setCooldown(retryAfter ?? 60);
        setMobileError(
          retryAfter
            ? `درخواست زیاد بود — ${faNum(retryAfter)} ثانیه دیگر دوباره تلاش کن`
            : 'درخواست زیاد بود — کمی بعد دوباره تلاش کن',
        );
        // a code is already on its way? let them type it
        if (err.meta?.has_pending_code === true) setStep('code');
      } else {
        setMobileError('ارسال کد ناموفق بود — اتصال اینترنت را بررسی کن');
      }
    },
  });

  const verify = useMutation({
    mutationFn: (input: { mobile: string; code: string }) =>
      apiFetch<{ ok: true }>('/v1/auth/verify', { method: 'POST', body: input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      router.replace('/');
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 401) {
        const remaining = metaNumber(err, 'attempts_remaining');
        setCodeError(
          remaining !== null && remaining > 0
            ? `کد درست نیست — ${faNum(remaining)} تلاش دیگر باقی مانده`
            : 'کد درست نیست یا منقضی شده — دوباره کد بگیر',
        );
      } else {
        setCodeError('تأیید ناموفق بود — دوباره تلاش کن');
      }
    },
  });

  const submitMobile = (e: FormEvent) => {
    e.preventDefault();
    const normalized = normalizeDigits(mobile.trim()).replace(/[^0-9+]/g, '');
    if (normalized.length < 10) {
      setMobileError('شمارهٔ موبایل را کامل وارد کن (مثلاً ۰۹۱۲۱۲۳۴۵۶۷)');
      return;
    }
    setMobileError(null);
    setMobile(normalized);
    requestOtp.mutate(normalized);
  };

  const submitCode = (e: FormEvent) => {
    e.preventDefault();
    const normalized = normalizeDigits(code.trim());
    if (normalized.length < 4) {
      setCodeError('کد پیامک‌شده را کامل وارد کن');
      return;
    }
    setCodeError(null);
    verify.mutate({ mobile, code: normalized });
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 pb-16">
      <header className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-primary text-2xl font-bold text-primary-fg">
          آ
        </div>
        <h1 className="text-2xl font-bold">آراد CRM</h1>
        <p className="mt-2 text-sm text-fg-muted">برنامهٔ روزانهٔ فروشنده — با شماره‌ات وارد شو</p>
      </header>

      {step === 'mobile' ? (
        <form onSubmit={submitMobile} className="space-y-4" noValidate>
          <div>
            <label htmlFor="mobile" className="mb-1.5 block text-sm font-medium">
              شمارهٔ موبایل
            </label>
            <input
              id="mobile"
              dir="ltr"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="۰۹۱۲ ۱۲۳ ۴۵۶۷"
              value={mobile}
              onChange={(e) => {
                setMobile(e.target.value);
                if (mobileError) setMobileError(null);
              }}
              aria-invalid={mobileError ? true : undefined}
              aria-describedby={mobileError ? 'mobile-error' : undefined}
              className={`${inputClass(Boolean(mobileError))} text-center tracking-widest`}
            />
            {mobileError ? (
              <p id="mobile-error" className="mt-1.5 text-xs text-danger">
                {mobileError}
              </p>
            ) : null}
          </div>
          <button
            type="submit"
            disabled={requestOtp.isPending || cooldown > 0}
            className="w-full rounded-md bg-gradient-primary shadow-card py-3.5 text-base font-bold text-primary-fg transition-opacity disabled:opacity-60"
          >
            {requestOtp.isPending
              ? 'در حال ارسال…'
              : cooldown > 0
                ? `دریافت کد (${faNum(cooldown)})`
                : 'دریافت کد ورود'}
          </button>
        </form>
      ) : (
        <form onSubmit={submitCode} className="space-y-4" noValidate>
          <p className="text-center text-sm text-fg-muted">
            کد تأیید به شمارهٔ <span dir="ltr">{mobile}</span> پیامک شد
          </p>
          <div>
            <label htmlFor="otp" className="sr-only">
              کد تأیید
            </label>
            <input
              id="otp"
              dir="ltr"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              placeholder="— — — — —"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                if (codeError) setCodeError(null);
              }}
              aria-invalid={codeError ? true : undefined}
              aria-describedby={codeError ? 'code-error' : undefined}
              className={`${inputClass(Boolean(codeError))} text-center text-xl tracking-[0.5em]`}
            />
            {codeError ? (
              <p id="code-error" className="mt-1.5 text-center text-xs text-danger">
                {codeError}
              </p>
            ) : null}
          </div>
          <button
            type="submit"
            disabled={verify.isPending}
            className="w-full rounded-md bg-gradient-primary shadow-card py-3.5 text-base font-bold text-primary-fg transition-opacity disabled:opacity-60"
          >
            {verify.isPending ? 'در حال بررسی…' : 'ورود'}
          </button>
          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={() => {
                setStep('mobile');
                setCodeError(null);
              }}
              className="py-2 text-fg-muted"
            >
              تغییر شماره
            </button>
            <button
              type="button"
              disabled={cooldown > 0 || requestOtp.isPending}
              onClick={() => requestOtp.mutate(mobile)}
              className="py-2 font-medium text-primary disabled:text-fg-muted"
            >
              {cooldown > 0 ? `ارسال دوباره (${faNum(cooldown)})` : 'ارسال دوبارهٔ کد'}
            </button>
          </div>
        </form>
      )}
    </main>
  );
}
