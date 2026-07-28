'use client';

// @arad-crm/ui primitives — ADR-012 layer 2. Token classes only, no brand
// literals, no product vocabulary: a vertical swaps styles/tokens.css and
// these change with it.
//
// 🔒 Nothing here imports the HTTP client or a contract type. A primitive that
// knows what an ApiError is cannot be reused by the next vertical — callers
// pass strings, and the app decides how an error becomes one.

import type { ReactNode } from 'react';

export type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';

const CHIP_TONES: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-fg-muted',
  primary: 'tint-primary text-primary',
  success: 'tint-success text-success',
  warning: 'tint-warning text-warning',
  danger: 'tint-danger text-danger',
};

export function Chip({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${CHIP_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string | undefined;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-fg-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-sm bg-surface-2 ${className}`} aria-hidden />;
}

/** Dense-table loading placeholder. */
export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  const keys = Array.from({ length: rows }, (_, i) => `sk-${i}`);
  return (
    <output aria-label="در حال بارگذاری" className="block space-y-2 p-4">
      {keys.map((k) => (
        <Skeleton key={k} className="h-8 w-full" />
      ))}
    </output>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string | undefined;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border bg-surface px-6 py-12 text-center">
      <p className="text-sm font-medium">{title}</p>
      {hint ? <p className="max-w-md text-xs text-fg-muted">{hint}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message?: string | null | undefined;
  onRetry?: (() => void) | undefined;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-md border border-border bg-surface px-6 py-10 text-center shadow-card">
      <p className="text-sm font-medium text-danger">خطا در دریافت اطلاعات</p>
      {message ? <p className="max-w-md text-xs text-fg-muted">{message}</p> : null}
      {onRetry ? (
        <button type="button" onClick={onRetry} className={btnGhost}>
          تلاش دوباره
        </button>
      ) : null}
    </div>
  );
}

/** Inline (form-level) error line. */
export function FormError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-xs text-danger">
      {children}
    </p>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  // `| undefined` explicitly: the repo runs exactOptionalPropertyTypes, so a
  // caller spreading an optional value must be able to pass undefined.
  hint?: string | undefined;
  error?: string | null | undefined;
  children: ReactNode;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is the `children` slot — nesting it inside the label is the association, and the rule cannot see through a prop
    <label className="block space-y-1">
      <span className="text-xs font-medium text-fg-muted">{label}</span>
      {children}
      {hint && !error ? <span className="block text-xs text-fg-faint">{hint}</span> : null}
      <FormError>{error}</FormError>
    </label>
  );
}

/** Dense data table. Wide content scrolls inside the card, never the page. */
export function DataTable({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border bg-surface shadow-card">
      <table className="w-full min-w-[640px] text-start text-sm">
        <thead className="border-b border-border bg-surface-2 text-xs text-fg-muted">{head}</thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  );
}

export const inputClass =
  'w-full rounded-sm border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:border-primary focus:outline-none disabled:opacity-60';

export const btnPrimary =
  'inline-flex items-center justify-center gap-1 rounded-sm bg-gradient-primary px-3 py-2 text-sm font-medium text-primary-fg shadow-card transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50';

export const btnGhost =
  'inline-flex items-center justify-center gap-1 rounded-sm border border-border bg-surface px-3 py-2 text-sm hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50';

export const btnRowAction =
  'rounded-sm border border-border bg-surface px-2 py-1 text-xs hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50';

export const btnDanger =
  'inline-flex items-center justify-center gap-1 rounded-sm border border-danger/40 bg-surface px-3 py-2 text-sm text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-50';
