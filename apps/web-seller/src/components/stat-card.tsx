interface StatCardProps {
  label: string;
  value: string;
  tone?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | undefined;
  sub?: string | undefined;
}

const toneText: Record<NonNullable<StatCardProps['tone']>, string> = {
  default: 'text-fg',
  primary: 'text-primary',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
};

// Accent bar on the inline-start edge (the mock KPI signature) — a token-hued
// stripe that gives each stat a purposeful color without loud fills.
const toneBar: Record<NonNullable<StatCardProps['tone']>, string> = {
  default: 'bg-primary',
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
};

export const StatCard = ({ label, value, tone = 'default', sub }: StatCardProps) => (
  <div className="relative overflow-hidden rounded-md border border-border bg-surface p-4 shadow-card">
    <span aria-hidden className={`absolute inset-y-0 start-0 w-1 ${toneBar[tone]}`} />
    <p className="text-xs text-fg-muted">{label}</p>
    <p className={`mt-1.5 text-2xl font-bold leading-8 ${toneText[tone]}`}>{value}</p>
    {sub ? <p className="mt-0.5 text-[11px] text-fg-muted">{sub}</p> : null}
  </div>
);
