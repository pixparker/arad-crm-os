// Manager/owner dashboard shell. Archetype: ux-best-practices/ops-admin-panel
// — dense tables, keyboard support, bulk actions. Real funnel + action queue
// land with the reporting module.

const STAT_CARDS = [
  { label: 'سرنخ‌های باز', hint: 'با اقدام بعدی تاریخ‌دار' },
  { label: 'فرصت‌های فعال', hint: 'در قیف فروش' },
  { label: 'فروش این ماه', hint: 'از رویداد پرداخت' },
] as const;

export default function DashboardPage() {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-6xl px-6 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold">داشبورد فروش</h1>
        <p className="mt-1 text-sm text-fg-muted">نمای مدیر — قیف، تیم و صف تأییدها</p>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {STAT_CARDS.map((card) => (
          <div key={card.label} className="rounded-md border border-border bg-surface p-5">
            <p className="text-sm text-fg-muted">{card.label}</p>
            <p className="mt-2 text-3xl font-bold">—</p>
            <p className="mt-1 text-xs text-fg-muted">{card.hint}</p>
          </div>
        ))}
      </section>

      <section className="mt-8 rounded-lg border border-dashed border-border bg-surface p-10 text-center text-sm text-fg-muted">
        قیف فروش و صف اقدام مدیر این‌جا می‌آید.
      </section>
    </main>
  );
}
