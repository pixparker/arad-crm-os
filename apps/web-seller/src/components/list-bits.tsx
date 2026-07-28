'use client';

// The small parts the list screens are built from (prototype ۰۴–۰۸): the tinted
// two-letter square, the status pill, the segmented control and the chip row.
// They are shared because «سرنخ‌ها و مشتریان», «پایپلاین» and «کمیسیون من» all
// draw the same row and the seller should not have to re-learn it per screen.

import type { ReactNode } from 'react';

export type Tone = 'lead' | 'opportunity' | 'customer' | 'note' | 'warn' | 'danger';

const TONE_CLASS: Record<Tone, string> = {
  lead: 'bg-primary-soft text-primary-ink',
  opportunity: 'bg-info-soft text-info',
  customer: 'bg-gold-soft text-gold',
  note: 'bg-surface-2 text-fg-muted',
  warn: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
};

/**
 * The prototype's `mono` square: the first two letters of the business name.
 * Persian has no case, so this is a slice — but it is a GRAPHEME slice, because
 * «آب‌میوه» starts with a ZWNJ-joined pair and `slice(0,2)` on code units can
 * cut a name in half and render a lone combining mark.
 */
export function Initials({ name, tone = 'note' }: { name: string; tone?: Tone }) {
  const letters = [...name.replace(/[‌\s]/g, '')].slice(0, 2).join('');
  return (
    <span
      aria-hidden="true"
      className={`grid h-10 w-10 flex-none place-items-center rounded-md text-[13px] font-bold ${TONE_CLASS[tone]}`}
    >
      {letters}
    </span>
  );
}

export function Tag({ tone = 'note', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${TONE_CLASS[tone]}`}
    >
      {children}
    </span>
  );
}

/** «همه · سرنخ · فرصت · مشتری» — one choice, always visible. */
export function SegBar<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="flex gap-1 rounded-md border border-border bg-surface-2 p-1"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-[7px] py-2 text-[13px] transition ${
            o.value === value
              ? 'bg-surface font-bold text-fg shadow-card'
              : 'font-medium text-fg-muted'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A horizontally scrolling row of toggles, each with an optional count. */
export function ChipRow({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {children}
    </div>
  );
}

export function Chip({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count?: number;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      // The prototype's selected chip is SOLID navy, not a teal tint: teal is
      // the action colour and a filter is not an action. A pale-teal chip also
      // reads as «tappable» rather than «on», which is the opposite of what a
      // pressed filter should say.
      className={`flex flex-none items-center gap-1.5 rounded-full border px-3.5 py-2 text-[13px] transition ${
        active
          ? 'border-canopy bg-canopy font-bold text-on-canopy'
          : 'border-border bg-surface font-medium text-fg-muted'
      }`}
    >
      {children}
      {count !== undefined ? (
        <span
          className={`num rounded-full px-1.5 text-[10px] font-bold ${
            active ? 'bg-white/15 text-on-canopy-muted' : 'bg-surface-2'
          }`}
        >
          {new Intl.NumberFormat('fa-IR').format(count)}
        </span>
      ) : null}
    </button>
  );
}
