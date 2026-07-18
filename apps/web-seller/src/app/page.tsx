// «امروز من» — the seller's home (product doc §7). Scaffold shell: the real
// daily plan (visit list, quick log, mandatory next-action) lands with the
// activities module. Archetype: ux-best-practices/consumer-mobile-app —
// thumb-zone bottom nav, one primary action per screen, <2-min flows.

const todayFa = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'full' }).format(new Date());

export default function TodayPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-24 pt-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">امروز من</h1>
        <p className="mt-1 text-sm text-fg-muted">{todayFa}</p>
      </header>

      <section className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface p-8 text-center">
        <p className="font-medium">برنامهٔ امروز هنوز خالی است</p>
        <p className="mt-2 text-sm text-fg-muted">
          فهرست مراجعه‌ها، ثبت سریع نتیجه و اقدام بعدی این‌جا می‌آید.
        </p>
      </section>

      <nav
        aria-label="ناوبری اصلی"
        className="fixed inset-x-0 bottom-0 mx-auto flex w-full max-w-md items-center justify-around border-t border-border bg-surface px-2 py-3 text-xs text-fg-muted"
      >
        <span className="font-medium text-primary">امروز</span>
        <span>فرصت‌ها</span>
        <span>درآمد من</span>
      </nav>
    </main>
  );
}
