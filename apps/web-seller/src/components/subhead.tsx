'use client';

// The navy `subhead` every screen after the dashboard wears (prototype ۰۴–۰۹):
// a title, a line of context under it, an optional back affordance and an
// optional trailing control. Screens that carry a hero (کمیسیون, پروفایل) pass
// it as children and it sits inside the same navy block, so the canopy runs
// from the status bar down to where the content actually starts.
//
// One component rather than six copies: the header is the app's spine, and a
// screen whose header is two pixels off reads as a different app.
//
// It is PINNED, as in the prototype: the list scrolls under it, so the title
// and the way back never scroll out of reach. A pinned header has to earn its
// height though — pass `collapse` on the screens that carry a hero and the hero
// folds away on scroll, leaving the title, the back chevron and `trailing` as
// the one-line stand-in.

import { ChevronLeftIcon } from '@/components/icons';
import { useCollapsedHeader } from '@/lib/use-collapsed-header';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

export function Subhead({
  title,
  subtitle,
  back,
  trailing,
  collapse = false,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  /** Show the back chevron. `true` = history back, a string = push that route. */
  back?: boolean | string;
  trailing?: ReactNode;
  /** Fold `children` (and the subtitle) away once the page scrolls. */
  collapse?: boolean;
  children?: ReactNode;
}) {
  const router = useRouter();
  const compact = useCollapsedHeader(collapse);

  return (
    <header
      data-compact={compact}
      className={`sticky top-0 z-30 rounded-b-[24px] bg-canopy px-4 pt-safe text-on-canopy transition-[padding] duration-300 ${
        compact ? 'pb-3' : 'pb-5'
      }`}
    >
      <div className="mx-auto w-full md:max-w-3xl">
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
              <small
                className={`block overflow-hidden text-xs text-on-canopy-muted transition-all duration-300 ${
                  compact ? 'mt-0 max-h-0 opacity-0' : 'mt-0.5 max-h-8 opacity-100'
                }`}
              >
                {subtitle}
              </small>
            ) : null}
          </span>
          {/* The stand-in: nothing while the hero is open, the headline once it folds. */}
          {trailing ? (
            <span
              className={`flex-none transition-opacity duration-200 ${
                children && !compact ? 'pointer-events-none opacity-0' : 'opacity-100'
              }`}
            >
              {trailing}
            </span>
          ) : null}
        </div>
        {children ? (
          <div
            className={`overflow-hidden transition-all duration-300 ${
              compact ? 'max-h-0 opacity-0' : 'max-h-[320px] opacity-100'
            }`}
          >
            {children}
          </div>
        ) : null}
      </div>
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
