'use client';

// «کارها و یادآورها» — prototype screen ۰۷, and the fourth tab the bottom bar
// has been pointing at nothing for.
//
// Everything here is a promise the seller made, read from
// `GET /v1/activities/agenda`. There is no separate task table: a task in this
// system IS a dated next action on a file, which is why one cannot be created
// here — it is created by logging the call or visit that produced it. A «افزودن
// کار» button would imply a to-do list that drifts from the pipeline, and the
// drift is exactly what the next-action invariant exists to prevent.
//
// The prototype's «یادآوری ۳۰ دقیقه قبل» is absent for the same reason: nothing
// sends anything yet (F09 suggests, it does not notify), and a reminder promise
// the app cannot keep is worse than none.
//
// Overdue is its own section above today, never a badge inside it: a promise
// broken yesterday is different work from one due at 11:00.

import { EmptyState } from '@/components/empty-state';
import { SegBar } from '@/components/list-bits';
import { ListSkeleton } from '@/components/skeleton';
import { Subhead } from '@/components/subhead';
import { faClock, faNum } from '@/lib/format';
import { nextActionLabel } from '@/lib/labels';
import type { AgendaResponse, Commitment } from '@/lib/types';
import { apiFetch } from '@arad-crm/web-shared';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';

type Range = 'today' | 'week' | 'overdue';

const RANGES = [
  { value: 'today', label: 'امروز' },
  { value: 'week', label: 'این هفته' },
  { value: 'overdue', label: 'عقب‌افتاده' },
] as const satisfies readonly { value: Range; label: string }[];

const faWeekday = new Intl.DateTimeFormat('fa-IR', { weekday: 'long' });
const faDayNum = new Intl.DateTimeFormat('fa-IR', { day: 'numeric' });
const faDayMonth = new Intl.DateTimeFormat('fa-IR', { day: 'numeric', month: 'long' });

// Friday is Iran's weekend; the strip greys it rather than hiding it, so the
// week keeps its shape.
const isFriday = (at: Date): boolean => at.getDay() === 5;

export default function TasksPage() {
  const [range, setRange] = useState<Range>('today');
  const [pickedDay, setPickedDay] = useState<string | null>(null);

  const agenda = useQuery({
    queryKey: ['agenda'],
    queryFn: () => apiFetch<AgendaResponse>('/v1/activities/agenda?days=7'),
  });

  const days = agenda.data?.days ?? [];
  const overdue = agenda.data?.overdue ?? [];
  const todayBucket = days[0];
  const todayCount = (todayBucket?.items.length ?? 0) + overdue.length;

  // A tapped day overrides the segment — the strip is the finer control.
  const selected = pickedDay ? days.find((d) => d.date === pickedDay) : undefined;

  const sections: { title: string; tone: 'danger' | 'default'; items: Commitment[] }[] = selected
    ? [
        {
          title: faDayMonth.format(new Date(selected.starts_at)),
          tone: 'default',
          items: selected.items,
        },
      ]
    : range === 'overdue'
      ? [{ title: 'عقب‌افتاده', tone: 'danger', items: overdue }]
      : range === 'today'
        ? [
            ...(overdue.length > 0
              ? [{ title: 'عقب‌افتاده', tone: 'danger' as const, items: overdue }]
              : []),
            {
              title: `امروز — ${todayBucket ? faDayMonth.format(new Date(todayBucket.starts_at)) : ''}`,
              tone: 'default' as const,
              items: todayBucket?.items ?? [],
            },
          ]
        : [
            ...(overdue.length > 0
              ? [{ title: 'عقب‌افتاده', tone: 'danger' as const, items: overdue }]
              : []),
            ...days
              .filter((d) => d.items.length > 0)
              .map((d, i) => ({
                title:
                  i === 0 && d.date === agenda.data?.today
                    ? `امروز — ${faDayMonth.format(new Date(d.starts_at))}`
                    : `${faWeekday.format(new Date(d.starts_at))} ${faDayMonth.format(new Date(d.starts_at))}`,
                tone: 'default' as const,
                items: d.items,
              })),
          ];

  const nothing = sections.every((s) => s.items.length === 0);

  return (
    <main className="min-h-dvh pb-28">
      <Subhead
        title="کارها و یادآورها"
        subtitle={
          agenda.isSuccess
            ? todayCount === 0
              ? 'برای امروز کاری باز نیست'
              : `${faNum(todayCount)} کار برای امروز`
            : 'در حال بارگیری…'
        }
      >
        {days.length > 0 && (
          <div className="-mx-4 mt-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {days.map((d) => {
              const at = new Date(d.starts_at);
              const active = pickedDay === d.date;
              return (
                <button
                  key={d.date}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setPickedDay(active ? null : d.date)}
                  className={`flex w-[52px] flex-none flex-col items-center gap-0.5 rounded-md px-1 py-2 transition ${
                    active ? 'bg-white text-canopy' : 'bg-white/10 text-on-canopy'
                  } ${isFriday(at) && !active ? 'opacity-50' : ''}`}
                >
                  <span className="text-[10px] font-medium opacity-80">{faWeekday.format(at)}</span>
                  <span className="num text-[15px] font-bold">{faDayNum.format(at)}</span>
                  {/* A dot means "there is work on this day" — the only thing
                      the strip has room to say, and the thing worth saying. */}
                  <span
                    className={`h-1 w-1 rounded-full ${
                      d.items.length > 0 ? 'bg-primary' : 'bg-transparent'
                    }`}
                  />
                </button>
              );
            })}
          </div>
        )}
      </Subhead>

      <div className="px-4 pt-4">
        <SegBar
          label="بازهٔ زمانی"
          options={RANGES}
          value={range}
          onChange={(v) => {
            setRange(v);
            setPickedDay(null);
          }}
        />

        {pickedDay && (
          <button
            type="button"
            onClick={() => setPickedDay(null)}
            className="mt-3 w-full rounded-md border border-border bg-surface-2 py-2 text-[11px] font-semibold text-fg-muted"
          >
            نمایش یک روز · بازگشت به فهرست کامل
          </button>
        )}

        <div className="mt-4">
          {agenda.isPending ? (
            <ListSkeleton rows={4} />
          ) : agenda.isError ? (
            <EmptyState
              title="برنامهٔ کارها بارگیری نشد"
              hint="اتصال را بررسی کن."
              action={
                <button
                  type="button"
                  onClick={() => agenda.refetch()}
                  className="rounded-md bg-primary px-5 py-2.5 text-sm font-bold text-primary-fg"
                >
                  تلاش دوباره
                </button>
              }
            />
          ) : nothing ? (
            <EmptyState
              tone="done"
              title={range === 'overdue' ? 'هیچ کار عقب‌افتاده‌ای نداری ✓' : 'کاری باز نمانده ✓'}
              hint="هر تماس یا بازدیدی که ثبت می‌کنی، قدم بعدی‌اش این‌جا ظاهر می‌شود."
            />
          ) : (
            sections.map((section) =>
              section.items.length === 0 ? null : (
                <section key={section.title} className="mb-6 last:mb-0">
                  <div className="mb-2.5 flex items-center gap-2">
                    <h2 className="text-sm font-bold">{section.title}</h2>
                    <span
                      className={`num rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        section.tone === 'danger'
                          ? 'bg-danger-soft text-danger'
                          : 'bg-surface-2 text-fg-muted'
                      }`}
                    >
                      {faNum(section.items.length)}
                    </span>
                  </div>
                  <ul className="overflow-hidden rounded-md border border-border bg-surface shadow-card">
                    {section.items.map((item, i) => (
                      <TaskRow
                        key={`${item.account_id}-${item.lead_id ?? 'file'}-${item.due_at ?? ''}`}
                        item={item}
                        divided={i > 0}
                      />
                    ))}
                  </ul>
                </section>
              ),
            )
          )}
        </div>
      </div>
    </main>
  );
}

function TaskRow({ item, divided }: { item: Commitment; divided: boolean }) {
  const action = item.action_type ? nextActionLabel(item.action_type) : 'پیگیری';
  // Logging the result is the only way to close a commitment 🔒 — the log
  // screen demands the NEXT next action, so nothing falls out of the loop.
  const logHref = `/accounts/${item.account_id}/log${item.lead_id ? `?lead=${item.lead_id}` : ''}`;

  return (
    <li className={divided ? 'border-t border-border' : ''}>
      <div className="flex items-start gap-3 p-3.5">
        <Link href={`/accounts/${item.account_id}`} className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold">
            {action} — {item.account_name}
          </span>
          {item.region_text ? (
            <span className="mt-0.5 block truncate text-[11px] text-fg-muted">
              {item.region_text}
            </span>
          ) : null}
        </Link>
        <span className="flex flex-none flex-col items-end gap-2">
          <span
            className={`text-[11px] font-semibold ${item.overdue ? 'text-danger' : 'text-fg-muted'}`}
          >
            {item.overdue ? (
              'عقب‌افتاده'
            ) : item.due_at ? (
              <span className="num">{faClock(item.due_at)}</span>
            ) : null}
          </span>
          <Link
            href={logHref}
            className="rounded-full border border-primary px-3 py-1.5 text-[11px] font-bold text-primary-ink transition active:bg-primary active:text-primary-fg"
          >
            ثبت نتیجه
          </Link>
        </span>
      </div>
    </li>
  );
}
