'use client';

// The navy `subhead` every screen after the dashboard wears (prototype ۰۴–۰۹):
// a title, a line of context under it, an optional back affordance and an
// optional trailing control. Screens that carry a hero (کمیسیون, پروفایل) pass
// it as children and it sits inside the same navy block, so the canopy runs
// from the status bar down to where the content actually starts.
//
// One component rather than six copies: the header is the app's spine, and a
// screen whose header is two pixels off reads as a different app.

import { ChevronLeftIcon } from '@/components/icons';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

export function Subhead({
  title,
  subtitle,
  back,
  trailing,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  /** Show the back chevron. `true` = history back, a string = push that route. */
  back?: boolean | string;
  trailing?: ReactNode;
  children?: ReactNode;
}) {
  const router = useRouter();
  return (
    <header className="rounded-b-[24px] bg-canopy px-4 pb-5 pt-12 text-on-canopy">
      <div className="flex items-start gap-3">
        {back ? (
          <button
            type="button"
            onClick={() => (typeof back === 'string' ? router.push(back) : router.back())}
            aria-label="بازگشت"
            className="-ms-1.5 grid h-9 w-9 flex-none place-items-center rounded-full text-on-canopy-muted transition active:bg-white/10"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
        ) : null}
        <span className="min-w-0 flex-1">
          <b className="block truncate text-[17px] font-bold">{title}</b>
          {subtitle ? (
            <small className="mt-0.5 block text-xs text-on-canopy-muted">{subtitle}</small>
          ) : null}
        </span>
        {trailing}
      </div>
      {children}
    </header>
  );
}

/** The circular control that sits at the end of a subhead (filter, avatar…). */
export function SubheadButton({
  label,
  onClick,
  badge,
  children,
}: {
  label: string;
  onClick: () => void;
  badge?: number;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="relative grid h-9 w-9 flex-none place-items-center rounded-full bg-white/10 text-on-canopy transition active:bg-white/20"
    >
      {children}
      {badge !== undefined && badge > 0 ? (
        <span className="num absolute -end-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-fg">
          {new Intl.NumberFormat('fa-IR').format(badge)}
        </span>
      ) : null}
    </button>
  );
}
