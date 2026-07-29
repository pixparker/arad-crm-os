'use client';

// THE sub-screen frame. Every ＋ flow and every «ثبت» flow wears this one —
// «سرنخ جدید»، «مشتری جدید»، «فرصت جدید»، «ثبت سریع» and the account picker.
// Before consolidation there were four hand-rolled copies of this header and
// three of the submit bar, which is how one screen ends up with `pt-6` (no
// safe area) and another with `pt-safe`, and how the picker ended up with no
// way back at all.
//
// Two decisions worth keeping:
//
// 1. The header is PINNED (`sticky top-0`). These forms are long — the lead
//    form is eight sections — and a header that scrolls away takes the only
//    way out with it. Its subtitle folds on scroll via the same
//    `useCollapsedHeader` contract the navy `Subhead` uses, so the pinned bar
//    costs ~56px instead of ~86px once you start filling the form in.
//
// 2. There is NO fixed bottom bar. The submit sits at the natural end of the
//    form. A pinned bar costs ~100px of every screen to duplicate a button you
//    reach anyway — the last field of these forms IS the bottom of the form —
//    and on a phone it also has to fight the nav bar for the same pixels.

import { BackIcon } from '@/components/icons';
import { useCollapsedHeader } from '@/lib/use-collapsed-header';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

/** The reading column — the same one the navy `Subhead` and the tab screens use. */
const COLUMN = 'mx-auto w-full max-w-md px-4 md:max-w-2xl md:px-6';

export function FormShell({
  title,
  subtitle,
  children,
  submitLabel,
  onSubmit,
  busy,
  note,
  disabled,
  back = '/',
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  /** Omit to render no submit — the account picker submits by picking a row. */
  submitLabel?: string;
  onSubmit?: (e: React.FormEvent) => void;
  busy?: boolean;
  note?: ReactNode;
  disabled?: boolean;
  /**
   * What the escape control does. A route closes the flow (✕ — «سرنخ جدید» was
   * opened from the ＋, there is nothing behind it); `true` goes back (‹ — «ثبت
   * سریع» was opened from a file you want to return to).
   */
  back?: string | true;
}) {
  const router = useRouter();
  const compact = useCollapsedHeader(true);
  const isBack = back === true;

  const escapeGlyph = (
    <span
      aria-hidden="true"
      className="grid h-9 w-9 flex-none place-items-center rounded-sm bg-surface-2 text-fg"
    >
      {isBack ? (
        <BackIcon className="h-[18px] w-[18px]" />
      ) : (
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        >
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      )}
    </span>
  );

  const body = (
    <>
      {children}
      {submitLabel ? (
        <div className="pt-2">
          <button
            type="submit"
            disabled={busy || disabled}
            className="flex min-h-[52px] w-full items-center justify-center rounded-md bg-primary text-base font-semibold text-primary-fg shadow-[0_8px_20px_rgba(24,176,153,0.32)] transition active:scale-[0.985] disabled:border disabled:border-border disabled:bg-surface-2 disabled:text-fg-faint disabled:shadow-none"
          >
            {busy ? 'در حال ثبت…' : submitLabel}
          </button>
          {note ? <p className="mt-2 text-center text-xs text-fg-muted">{note}</p> : null}
        </div>
      ) : null}
    </>
  );

  return (
    <main className="min-h-dvh bg-bg pb-10">
      <header
        data-compact={compact}
        className={`sticky top-0 z-30 border-b border-border bg-surface pt-safe transition-[padding] duration-300 ${
          compact ? 'pb-2.5' : 'pb-3.5'
        }`}
      >
        <div className={`${COLUMN} flex items-center gap-3`}>
          {isBack ? (
            <button type="button" onClick={() => router.back()} aria-label="بازگشت">
              {escapeGlyph}
            </button>
          ) : (
            <Link href={back} aria-label="بستن">
              {escapeGlyph}
            </Link>
          )}
          <span className="min-w-0 flex-1">
            <b className="block truncate text-base font-bold">{title}</b>
            <small
              className={`block overflow-hidden text-xs text-fg-muted transition-all duration-300 ${
                compact ? 'mt-0 max-h-0 opacity-0' : 'mt-0.5 max-h-8 opacity-100'
              }`}
            >
              {subtitle}
            </small>
          </span>
        </div>
      </header>

      {onSubmit ? (
        <form onSubmit={onSubmit} noValidate className={`${COLUMN} space-y-4 pt-5`}>
          {body}
        </form>
      ) : (
        <div className={`${COLUMN} space-y-4 pt-5`}>{body}</div>
      )}
    </main>
  );
}
