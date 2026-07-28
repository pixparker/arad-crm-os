'use client';

// «فیلتر پایپلاین» — the prototype's filter sheet (screen ۰۴).
//
// The prototype offers six groups. Four of them are here, because four are all
// the pipeline payload can answer honestly:
//
//   مرحله        ← opportunity.stage
//   قدم بعدی     ← next_action_at, bucketed against now
//   ارزش معامله  ← amount_estimate_rial
//   مرتب‌سازی     ← derived from the three above
//
// «منبع سرنخ» and «شهر» are NOT here. `pipelineItemSchema` carries neither a
// source nor a structured city — only free-text `region_text` — so a city chip
// row would be a guess at string equality and a source row would filter on a
// field that does not exist. When the contract grows them, they belong here;
// offering them now would be the same lie as a ＋ tile with no form behind it.
//
// Filtering is client-side on the list the screen already holds. That is not a
// shortcut: `/v1/opportunities?view=mine` is a seller's own open deals — tens,
// not thousands — and a round trip per chip tap would make the sheet feel
// broken on a phone in a café doorway.

import { Chip } from '@/components/list-bits';
import { faNum } from '@/lib/format';
import type { PipelineItem } from '@/lib/types';
import { BottomSheet } from '@arad-crm/ui';
import { OPPORTUNITY_STAGES } from '@arad-crm/vertical-mizro';
import { useEffect, useState } from 'react';

const DAY_MS = 86_400_000;

export type NextBucket = 'all' | 'today' | 'week' | 'overdue' | 'none';
export type ValueBand = 'all' | 'lt1' | 'mid' | 'gt3';
export type SortKey = 'next' | 'value' | 'age';

export interface PipelineFilters {
  stage: string | null;
  next: NextBucket;
  value: ValueBand;
  sort: SortKey;
}

export const NO_FILTERS: PipelineFilters = {
  stage: null,
  next: 'all',
  value: 'all',
  sort: 'next',
};

const NEXT_OPTIONS: readonly { value: NextBucket; label: string }[] = [
  { value: 'all', label: 'همه' },
  { value: 'today', label: 'امروز' },
  { value: 'week', label: 'این هفته' },
  { value: 'overdue', label: 'عقب‌افتاده' },
  { value: 'none', label: 'تعیین‌نشده' },
];

const VALUE_OPTIONS: readonly { value: ValueBand; label: string }[] = [
  { value: 'all', label: 'همه' },
  { value: 'lt1', label: 'تا ۱ م.' },
  { value: 'mid', label: '۱ تا ۳ م.' },
  { value: 'gt3', label: 'بیش از ۳ م.' },
];

const SORT_OPTIONS: readonly { value: SortKey; label: string }[] = [
  { value: 'next', label: 'نزدیک‌ترین قدم بعدی' },
  { value: 'value', label: 'بیشترین ارزش' },
  { value: 'age', label: 'بیشترین روز در مرحله' },
];

/** How many groups are away from their default — the badge on the header button. */
export const activeFilterCount = (f: PipelineFilters): number =>
  (f.stage !== null ? 1 : 0) + (f.next !== 'all' ? 1 : 0) + (f.value !== 'all' ? 1 : 0);

const inNextBucket = (item: PipelineItem, bucket: NextBucket): boolean => {
  if (bucket === 'all') return true;
  if (item.next_action_at === null) return bucket === 'none';
  if (bucket === 'none') return false;
  const at = new Date(item.next_action_at).getTime();
  const now = Date.now();
  if (bucket === 'overdue') return at < now;
  if (at < now) return false;
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  if (bucket === 'today') return at <= endOfToday.getTime();
  return at <= endOfToday.getTime() + 6 * DAY_MS; // «این هفته» = the next seven days
};

const inValueBand = (item: PipelineItem, band: ValueBand): boolean => {
  if (band === 'all') return true;
  // 🔒 Rial digit-string → Toman by integer division. Never Number(rial).
  const toman = BigInt(item.amount_estimate_rial ?? '0') / 10n;
  if (band === 'lt1') return toman <= 1_000_000n;
  if (band === 'mid') return toman > 1_000_000n && toman <= 3_000_000n;
  return toman > 3_000_000n;
};

export const matchesFilters = (item: PipelineItem, f: PipelineFilters): boolean =>
  (f.stage === null || item.stage === f.stage) &&
  inNextBucket(item, f.next) &&
  inValueBand(item, f.value);

export const sortItems = (items: PipelineItem[], sort: SortKey): PipelineItem[] =>
  [...items].sort((a, b) => {
    if (sort === 'value') {
      const av = BigInt(a.amount_estimate_rial ?? '0');
      const bv = BigInt(b.amount_estimate_rial ?? '0');
      return av === bv ? 0 : av > bv ? -1 : 1;
    }
    if (sort === 'age') {
      return new Date(a.stage_entered_at).getTime() - new Date(b.stage_entered_at).getTime();
    }
    // «نزدیک‌ترین قدم بعدی» — a deal with no next step sorts last, because it is
    // the one thing this screen cannot schedule for you.
    const at = a.next_action_at ? new Date(a.next_action_at).getTime() : Number.POSITIVE_INFINITY;
    const bt = b.next_action_at ? new Date(b.next_action_at).getTime() : Number.POSITIVE_INFINITY;
    return at - bt;
  });

/** One-line description of what is on, for the bar above the board. */
export const filterSummary = (f: PipelineFilters, shown: number): string => {
  const parts = [
    f.stage ? (OPPORTUNITY_STAGES.find((s) => s.code === f.stage)?.label ?? f.stage) : null,
    f.next !== 'all' ? (NEXT_OPTIONS.find((o) => o.value === f.next)?.label ?? null) : null,
    f.value !== 'all' ? (VALUE_OPTIONS.find((o) => o.value === f.value)?.label ?? null) : null,
  ].filter((p): p is string => p !== null);
  // «·» never directly before a digit — the middle dot reads as a Persian ۰.
  return `${parts.join(' · ')} · نمایش ${faNum(shown)} معامله`;
};

export function PipelineFilterSheet({
  open,
  onClose,
  value,
  onApply,
  items,
}: {
  open: boolean;
  onClose: () => void;
  value: PipelineFilters;
  onApply: (filters: PipelineFilters) => void;
  /** The open deals the board is showing — for the live match count. */
  items: PipelineItem[];
}) {
  // Edited in the sheet, committed on «اعمال» — so a half-built filter never
  // reshuffles the board behind the sheet.
  const [draft, setDraft] = useState<PipelineFilters>(value);
  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  const matches = items.filter((i) => matchesFilters(i, draft)).length;
  const stagesPresent = OPPORTUNITY_STAGES.filter(
    (s) => items.some((i) => i.stage === s.code) || draft.stage === s.code,
  );

  return (
    <BottomSheet
      open={open}
      title="فیلتر پایپلاین"
      description="فیلترها فقط روی این نما اثر دارند و ذخیره نمی‌شوند."
      onClose={onClose}
    >
      <Group label="مرحله">
        <Chip active={draft.stage === null} onClick={() => setDraft({ ...draft, stage: null })}>
          همه
        </Chip>
        {stagesPresent.map((s) => (
          <Chip
            key={s.code}
            active={draft.stage === s.code}
            onClick={() => setDraft({ ...draft, stage: draft.stage === s.code ? null : s.code })}
            count={items.filter((i) => i.stage === s.code).length}
          >
            {s.label}
          </Chip>
        ))}
      </Group>

      <Group label="قدم بعدی">
        {NEXT_OPTIONS.map((o) => (
          <Chip
            key={o.value}
            active={draft.next === o.value}
            onClick={() => setDraft({ ...draft, next: o.value })}
          >
            {o.label}
          </Chip>
        ))}
      </Group>

      <Group label="ارزش معامله">
        {VALUE_OPTIONS.map((o) => (
          <Chip
            key={o.value}
            active={draft.value === o.value}
            onClick={() => setDraft({ ...draft, value: o.value })}
          >
            {o.label}
          </Chip>
        ))}
      </Group>

      <Group label="مرتب‌سازی">
        {SORT_OPTIONS.map((o) => (
          <Chip
            key={o.value}
            active={draft.sort === o.value}
            onClick={() => setDraft({ ...draft, sort: o.value })}
          >
            {o.label}
          </Chip>
        ))}
      </Group>

      <p className="mt-6 text-center text-xs font-semibold text-primary-ink">
        {matches === 0
          ? 'هیچ معامله‌ای با این فیلترها نیست'
          : `${faNum(matches)} معامله با این فیلترها هم‌خوانی دارد`}
      </p>
      <div className="mt-2 flex gap-2.5">
        <button
          type="button"
          onClick={() => setDraft({ ...NO_FILTERS, sort: draft.sort })}
          className="rounded-md border border-border px-5 py-3 text-sm font-medium text-fg-muted"
        >
          پاک کردن
        </button>
        <button
          type="button"
          onClick={() => {
            onApply(draft);
            onClose();
          }}
          className="flex-1 rounded-md bg-primary py-3 text-sm font-bold text-primary-fg shadow-card"
        >
          اعمال فیلتر
        </button>
      </div>
    </BottomSheet>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-5 last:mb-0">
      <p className="mb-2.5 text-xs font-bold text-fg">{label}</p>
      {/* Wraps rather than scrolls: inside a sheet an edge-to-edge scrolling row
          has no edge to bleed to, and a chip half off the panel looks broken. */}
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
