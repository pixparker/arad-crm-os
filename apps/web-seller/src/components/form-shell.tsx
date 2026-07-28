'use client';

// The sub-screen frame the ＋ forms share: a close button back to the shell, a
// title with its one-line purpose, and a sticky submit bar. Same chrome as the
// prototype's «ثبت سرنخ» screen, so every create flow feels like one flow.

import Link from 'next/link';
import type { ReactNode } from 'react';

export function FormShell({
  title,
  subtitle,
  children,
  submitLabel,
  onSubmit,
  busy,
  note,
  disabled,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  submitLabel: string;
  onSubmit: (e: React.FormEvent) => void;
  busy?: boolean;
  note?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <main className="min-h-dvh bg-bg pb-36">
      <header className="flex items-center gap-3 border-b border-border bg-surface px-4 pb-4 pt-12">
        <Link
          href="/"
          aria-label="بستن"
          className="grid h-10 w-10 flex-none place-items-center rounded-sm bg-surface-2 text-fg"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </Link>
        <span>
          <b className="block text-[17px] font-bold">{title}</b>
          <small className="block text-xs text-fg-muted">{subtitle}</small>
        </span>
      </header>

      <form onSubmit={onSubmit} noValidate className="space-y-4 px-4 pt-5">
        {children}

        <div className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-md border-t border-border bg-surface px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3">
          <button
            type="submit"
            disabled={busy || disabled}
            className="flex min-h-[52px] w-full items-center justify-center rounded-md bg-primary text-base font-semibold text-primary-fg shadow-[0_8px_20px_rgba(24,176,153,0.32)] transition active:scale-[0.985] disabled:border disabled:border-border disabled:bg-surface-2 disabled:text-fg-faint disabled:shadow-none"
          >
            {busy ? 'در حال ثبت…' : submitLabel}
          </button>
          {note ? <p className="mt-2 text-center text-xs text-fg-muted">{note}</p> : null}
        </div>
      </form>
    </main>
  );
}
