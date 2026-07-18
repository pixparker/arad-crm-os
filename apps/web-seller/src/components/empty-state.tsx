import type { ReactNode } from 'react';

// Empty states teach (ux-best-practices/empty-states): what belongs here,
// why it's empty, and the one action that fills it.

interface EmptyStateProps {
  title: string;
  hint?: string | undefined;
  action?: ReactNode | undefined;
  tone?: 'default' | 'done' | undefined;
}

export const EmptyState = ({ title, hint, action, tone }: EmptyStateProps) => (
  <div className="flex flex-col items-center rounded-lg border border-dashed border-border bg-surface px-6 py-8 text-center">
    <p className={`font-medium ${tone === 'done' ? 'text-success' : 'text-fg'}`}>{title}</p>
    {hint ? <p className="mt-2 text-sm leading-6 text-fg-muted">{hint}</p> : null}
    {action ? <div className="mt-4">{action}</div> : null}
  </div>
);
