'use client';

// ورود — prototype screen ۰۱, built against the real auth contract.
//
// Two steps under one navy canopy: phone → code. The prototype settles the
// shape (canopy + white sheet, brand lockup, boxed code, resend timer, success
// flash); the API settles the behaviour.
//
// Two places where they disagreed, and reality won:
//   · the code is FOUR digits (@arad/auth-otp `CODE_LENGTH`), not five. Four
//     boxes, and the copy says «کد ۴ رقمی».
//   · «تماس صوتی برای اعلام کد» has no backend — Connect has no voice channel.
//     A button that silently does nothing is worse than no button.
//
// 🔒 A delivery outage must look like one: 503 `otp_delivery_unavailable` means
// the code was never sent, and the screen says so instead of parking the seller
// in front of a code entry that can never be satisfied.

import { BrandLockup } from '@/components/brand';
import { faNum, normalizeDigits, toFaDigits } from '@/lib/format';
import type { RequestOtpResponse } from '@/lib/types';
import { useMe } from '@/lib/use-me';
import { ApiError, apiFetch } from '@arad-crm/web-shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from 'react';

const CODE_LENGTH = 4;

const metaNumber = (err: unknown, key: string): number | null =>
  err instanceof ApiError && typeof err.meta?.[key] === 'number' ? (err.meta[key] as number) : null;

/** ۰۹۱۲ ۳۴۵ ۶۷۸۹ — grouped for reading; digits stay LTR. */
const groupPhone = (digits: string): string =>
  [digits.slice(0, 4), digits.slice(4, 7), digits.slice(7, 11)].filter(Boolean).join(' ');

const mmss = (total: number): string =>
  `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;

const primaryBtn =
  'relative flex min-h-[52px] w-full items-center justify-center rounded-md bg-primary text-base font-semibold text-primary-fg shadow-[0_8px_20px_rgba(24,176,153,0.32)] transition active:scale-[0.985] disabled:border disabled:border-border disabled:bg-surface-2 disabled:text-fg-faint disabled:shadow-none';

export default function LoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const me = useMe();

  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [done, setDone] = useState(false);

  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (me.data) router.replace('/');
  }, [me.data, router]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  useEffect(() => {
    if (step === 'code') boxes.current[0]?.focus();
  }, [step]);

  const phoneValid = /^09\d{9}$/.test(phone);
  const code = digits.join('');

  const requestOtp = useMutation({
    mutationFn: (mobile: string) =>
      apiFetch<RequestOtpResponse>('/v1/auth/request-otp', { method: 'POST', body: { mobile } }),
    onSuccess: (data) => {
      setStep('code');
      setDigits(Array(CODE_LENGTH).fill(''));
      setCodeError(null);
      setCooldown(data.cooldown_sec);
    },
    onError: (err) => {
      // 🔒 the code was never sent — say that, don't ask for it
      if (err instanceof ApiError && err.status === 503) {
        setPhoneError('ارسال پیامک ممکن نشد — کمی بعد دوباره تلاش کنید یا با پشتیبانی تماس بگیرید');
        return;
      }
      if (err instanceof ApiError && err.status === 429) {
        const retryAfter = metaNumber(err, 'retry_after_sec');
        setCooldown(retryAfter ?? 60);
        setPhoneError(
          retryAfter
            ? `درخواست زیاد بود — ${faNum(retryAfter)} ثانیه دیگر دوباره تلاش کنید`
            : 'درخواست زیاد بود — کمی بعد دوباره تلاش کنید',
        );
        // a code is already on its way — let them type it
        if (err.meta?.has_pending_code === true) setStep('code');
        return;
      }
      setPhoneError('ارسال کد ناموفق بود — اتصال اینترنت را بررسی کنید');
    },
  });

  const verify = useMutation({
    mutationFn: (input: { mobile: string; code: string }) =>
      apiFetch<{ ok: true }>('/v1/auth/verify', { method: 'POST', body: input }),
    onSuccess: async () => {
      setDone(true);
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      // let the flash land before the dashboard replaces it
      window.setTimeout(() => router.replace('/'), 900);
    },
    onError: (err) => {
      const remaining = metaNumber(err, 'attempts_remaining');
      setDigits(Array(CODE_LENGTH).fill(''));
      boxes.current[0]?.focus();
      setCodeError(
        remaining !== null && remaining > 0
          ? `کد وارد‌شده درست نیست — ${faNum(remaining)} تلاش دیگر`
          : 'کد وارد‌شده درست نیست یا منقضی شده — دوباره کد بگیرید',
      );
    },
  });

  const submitPhone = (e: FormEvent) => {
    e.preventDefault();
    setPhoneError(null);
    if (!phoneValid) {
      setPhoneError('شمارهٔ موبایل باید ۱۱ رقم و با ۰۹ شروع شود.');
      return;
    }
    requestOtp.mutate(phone);
  };

  const submitCode = (e: FormEvent) => {
    e.preventDefault();
    if (code.length !== CODE_LENGTH) return;
    setCodeError(null);
    verify.mutate({ mobile: phone, code });
  };

  const setDigit = (index: number, raw: string) => {
    const value = normalizeDigits(raw).replace(/\D/g, '');
    if (!value) {
      setDigits((prev) => prev.map((d, i) => (i === index ? '' : d)));
      return;
    }
    // a pasted code spreads across the boxes instead of landing in one
    const next = [...digits];
    for (let i = 0; i < value.length && index + i < CODE_LENGTH; i += 1) {
      next[index + i] = value[i] ?? '';
    }
    setDigits(next);
    setCodeError(null);
    boxes.current[Math.min(index + value.length, CODE_LENGTH - 1)]?.focus();
    if (next.every((d) => d !== '')) verify.mutate({ mobile: phone, code: next.join('') });
  };

  const onBoxKeyDown = (index: number) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) boxes.current[index - 1]?.focus();
    // the boxes are LTR: ArrowLeft moves to the next digit
    if (e.key === 'ArrowLeft') boxes.current[index + 1]?.focus();
    if (e.key === 'ArrowRight') boxes.current[index - 1]?.focus();
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    setDigit(0, e.clipboardData.getData('text'));
  };

  const busy = requestOtp.isPending || verify.isPending;

  return (
    <main className="relative flex min-h-dvh flex-col bg-surface">
      {/* ---- navy canopy ---- */}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-canopy px-6 pb-8 pt-16 text-on-canopy">
        {step === 'phone' ? (
          <div className="flex flex-1 flex-col justify-between gap-6">
            <div className="grid flex-1 place-items-center">
              <BrandLockup size="lg" />
            </div>
            <div>
              <h1 className="text-[1.625rem] font-bold leading-[1.35] tracking-tight">
                سلام! خوش آمدید
              </h1>
              <p className="mt-2 max-w-[30ch] text-sm leading-[1.75] text-on-canopy-muted">
                شمارهٔ موبایلی که با آن در تیم فروش میزرو ثبت شده‌اید را وارد کنید.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col justify-between gap-6">
            <div>
              <button
                type="button"
                onClick={() => {
                  setStep('phone');
                  setCodeError(null);
                }}
                aria-label="بازگشت"
                className="grid h-10 w-10 place-items-center rounded-sm border border-white/15 bg-white/10 transition hover:bg-white/20"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
            </div>
            <div>
              <h1 className="text-[1.625rem] font-bold leading-[1.35] tracking-tight">
                کد تأیید را وارد کنید
              </h1>
              <div className="mt-4 flex items-center justify-between gap-3 rounded-md border border-white/[0.13] bg-white/[0.07] py-2.5 pe-2.5 ps-3.5 text-[13px] leading-relaxed text-on-canopy-muted">
                <span>
                  کد ۴ رقمی به{' '}
                  <span className="num ltr font-semibold text-on-canopy">
                    {toFaDigits(groupPhone(phone))}
                  </span>{' '}
                  پیامک شد
                </span>
                <button
                  type="button"
                  onClick={() => setStep('phone')}
                  className="min-h-[34px] flex-none whitespace-nowrap rounded-full border border-white/25 px-3 py-1.5 text-xs font-semibold text-on-canopy transition hover:bg-white/10"
                >
                  تغییر شماره
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ---- white sheet ---- */}
      <div className="relative z-10 -mt-6 flex max-h-full flex-none flex-col overflow-y-auto rounded-t-[28px] bg-surface px-6 pb-9 pt-6 shadow-[0_-12px_34px_rgba(1,24,47,0.16)]">
        <span className="mx-auto -mt-3.5 mb-5 block h-1 w-11 rounded-full bg-border" />

        {step === 'phone' ? (
          <form onSubmit={submitPhone} noValidate className="flex flex-col gap-5">
            <div>
              <label htmlFor="phone" className="mb-2 block text-[13px] font-semibold text-fg">
                شمارهٔ موبایل
              </label>
              <div
                data-invalid={phoneError ? 'true' : undefined}
                className="relative flex min-h-14 items-center rounded-md border-[1.5px] border-border bg-surface px-11 transition focus-within:border-primary focus-within:shadow-[0_0_0_4px_rgba(24,176,153,0.14)] data-[invalid]:border-danger data-[invalid]:shadow-[0_0_0_4px_rgba(220,38,38,0.1)]"
              >
                <input
                  id="phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  dir="ltr"
                  maxLength={11}
                  value={toFaDigits(phone)}
                  onChange={(e) => {
                    setPhone(normalizeDigits(e.target.value).replace(/\D/g, '').slice(0, 11));
                    setPhoneError(null);
                  }}
                  placeholder="۰۹۱۲۳۴۵۶۷۸۹"
                  aria-invalid={phoneError ? true : undefined}
                  className="num w-full min-w-0 flex-1 border-0 bg-transparent py-4 text-center text-xl font-semibold tracking-[0.06em] outline-none placeholder:font-medium placeholder:text-fg-faint"
                />
                {phone !== '' && (
                  <button
                    type="button"
                    onClick={() => setPhone('')}
                    aria-label="پاک کردن"
                    className="absolute end-4 grid h-[26px] w-[26px] place-items-center rounded-full bg-surface-2 text-fg-muted"
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      aria-hidden="true"
                    >
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              {phoneError !== null && (
                <p role="alert" className="mt-3 flex items-center gap-1.5 text-[13px] text-danger">
                  <ErrorIcon />
                  {phoneError}
                </p>
              )}
            </div>

            <button type="submit" disabled={!phoneValid || busy} className={primaryBtn}>
              {requestOtp.isPending ? <Spinner /> : 'دریافت کد ورود'}
            </button>

            <p className="text-center text-[11px] leading-[1.9] text-fg-muted">
              با ورود، شرایط استفاده و حریم خصوصی میزرو را می‌پذیرم.
            </p>
          </form>
        ) : (
          <form onSubmit={submitCode} noValidate className="flex flex-col gap-5">
            <div>
              <div dir="ltr" className="flex justify-center gap-3">
                {digits.map((digit, i) => (
                  <input
                    // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length positional boxes
                    key={i}
                    ref={(el) => {
                      boxes.current[i] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    autoComplete={i === 0 ? 'one-time-code' : 'off'}
                    maxLength={CODE_LENGTH}
                    aria-label={`رقم ${faNum(i + 1)}`}
                    value={toFaDigits(digit)}
                    onChange={(e) => setDigit(i, e.target.value)}
                    onKeyDown={onBoxKeyDown(i)}
                    onPaste={onPaste}
                    data-filled={digit ? 'true' : undefined}
                    className={`num h-16 w-14 max-w-[62px] flex-1 rounded-md border-[1.5px] bg-surface text-center text-[1.625rem] font-bold outline-none transition focus:border-primary focus:shadow-[0_0_0_4px_rgba(24,176,153,0.14)] data-[filled]:border-fg ${
                      codeError !== null
                        ? 'border-danger bg-danger-soft text-danger'
                        : 'border-border'
                    }`}
                  />
                ))}
              </div>
              {codeError !== null && (
                <p role="alert" className="mt-3 text-center text-[13px] text-danger">
                  {codeError}
                </p>
              )}
            </div>

            <div className="flex items-center justify-center gap-2 text-[13px] text-fg-muted">
              <span>کد را دریافت نکردید؟</span>
              <button
                type="button"
                disabled={cooldown > 0 || requestOtp.isPending}
                onClick={() => requestOtp.mutate(phone)}
                className="font-semibold text-primary-ink disabled:text-fg-faint"
              >
                ارسال دوباره
              </button>
              {cooldown > 0 && (
                <span className="num ltr font-semibold text-fg">{toFaDigits(mmss(cooldown))}</span>
              )}
            </div>

            <button
              type="submit"
              disabled={code.length !== CODE_LENGTH || busy}
              className={primaryBtn}
            >
              {verify.isPending ? <Spinner /> : 'ورود به میزرو سِیلز'}
            </button>
          </form>
        )}

        <div className="mt-5 flex items-center justify-center gap-2 border-t border-surface-3 pt-5 text-xs text-fg-muted">
          <span>مشکلی در ورود دارید؟</span>
          <span className="font-semibold text-fg">با پشتیبانی میزرو تماس بگیرید</span>
        </div>
      </div>

      {/* ---- success flash ---- */}
      {done && (
        <div className="absolute inset-0 z-50 grid place-items-center content-center gap-4 bg-canopy text-center text-on-canopy">
          <span className="grid h-[76px] w-[76px] place-items-center rounded-full bg-primary shadow-[0_8px_20px_rgba(24,176,153,0.32)]">
            <svg
              width="36"
              height="36"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#fff"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </span>
          <span className="text-lg font-bold">خوش آمدید</span>
          <span className="text-[13px] text-on-canopy-muted">در حال آماده‌سازی پایپلاین شما…</span>
        </div>
      )}
    </main>
  );
}

function ErrorIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      aria-hidden="true"
      className="flex-none"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5M12 16.2v.2" />
    </svg>
  );
}

function Spinner() {
  return (
    <span
      aria-label="در حال ارسال"
      className="h-[18px] w-[18px] animate-spin rounded-full border-2 border-white/35 border-t-white"
    />
  );
}
