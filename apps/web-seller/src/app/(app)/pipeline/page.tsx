'use client';

// «پایپلاین فروش» — prototype screen ۰۴.
//
// The prototype draws a horizontal kanban. On a phone that is a swipe-to-find
// interface for a seller standing outside a café, so the columns are stacked
// here and the stage chips do the column-switching: same information, one
// thumb. The chip row carries each stage's count and the header its total, so
// «۲۷ معاملهٔ باز · ارزش کل ۴۲٫۵ م. تومان» is real arithmetic over the deals
// on screen, not a caption.
//
// Every card answers three questions the prototype's card answers: how much,
// what happens next, and how long it has sat here. The third is the one a
// pipeline exists to surface — a deal nobody has moved in nine days is the
// screen's real content.
//
// 🔒 There is NO «برنده» control. A sale is a payment event from Mizro; the
// last stage says «منتظر پرداخت» and then waits, because that is the truth.

import { EmptyState } from '@/components/empty-state';
import { SelectField } from '@/components/field';
import { SlidersIcon } from '@/components/icons';
import { Chip, ChipRow, Tag } from '@/components/list-bits';
import {
  NO_FILTERS,
  PipelineFilterSheet,
  type PipelineFilters,
  activeFilterCount,
  filterSummary,
  matchesFilters,
  sortItems,
} from '@/components/pipeline-filter';
import { ListSkeleton } from '@/components/skeleton';
import { Subhead, SubheadButton } from '@/components/subhead';
import { useToast } from '@/components/toast';
import { faClock, faDate, faNum, isToday, toFaDigits } from '@/lib/format';
import { nextActionLabel, stageLabel } from '@/lib/labels';
import type { PipelineItem, PipelineResponse } from '@/lib/types';
import { LOSS_REASONS, OPPORTUNITY_STAGES } from '@arad-crm/vertical-mizro';
import { ApiError, apiFetch } from '@arad-crm/web-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';

const DAY_MS = 86_400_000;

/** ۴٫۲م — the card's number, at a glance. Integer division only 🔒. */
const compact = (rial: string | null): string | null => {
  if (!rial || rial === '0') return null;
  const toman = BigInt(rial) / 10n;
  if (toman >= 1_000_000n) {
    const tenths = toman / 100_000n;
    return toFaDigits(`${tenths / 10n}٫${tenths % 10n}م`);
  }
  if (toman >= 1000n) return toFaDigits(`${toman / 1000n}ه`);
  return faNum(Number(toman));
};

const daysSince = (iso: string): number =>
  Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS);

export default function PipelinePage() {
  // One filter object, two controls: the chip row on the board is the stage
  // group of the same filter, so the sheet and the board can never disagree.
  const [filters, setFilters] = useState<PipelineFilters>(NO_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const opps = useQuery({
    queryKey: ['opportunities', 'mine'],
    queryFn: () => apiFetch<PipelineResponse>('/v1/opportunities?view=mine'),
  });

  const open = opps.data?.items.filter((o) => o.status === 'open') ?? [];
  const totalRial = open.reduce((sum, o) => sum + BigInt(o.amount_estimate_rial ?? '0'), 0n);
  const shown = sortItems(
    open.filter((o) => matchesFilters(o, filters)),
    filters.sort,
  );
  const activeCount = activeFilterCount(filters);

  const subtitle =
    open.length === 0
      ? 'هنوز معاملهٔ بازی نداری'
      : activeCount > 0
        ? `${faNum(shown.length)} معاملهٔ نمایش‌داده‌شده از ${faNum(open.length)}`
        : `${faNum(open.length)} معاملهٔ باز · ارزش کل ${compact(totalRial.toString()) ?? '۰'} تومان`;

  return (
    <main className="min-h-dvh pb-28">
      <Subhead
        title="پایپلاین فروش"
        subtitle={opps.isSuccess ? subtitle : 'در حال بارگیری…'}
        trailing={
          open.length > 0 ? (
            <SubheadButton
              label="فیلتر پایپلاین"
              onClick={() => setFilterOpen(true)}
              badge={activeCount}
            >
              <SlidersIcon className="h-[18px] w-[18px]" />
            </SubheadButton>
          ) : undefined
        }
      />

      <PipelineFilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        value={filters}
        onApply={setFilters}
        items={open}
      />

      <div className="px-4 pt-4">
        {opps.isPending ? (
          <ListSkeleton rows={4} />
        ) : opps.isError ? (
          <EmptyState
            title="پایپلاین بارگیری نشد"
            hint="اتصال را بررسی کن."
            action={
              <button
                type="button"
                onClick={() => opps.refetch()}
                className="rounded-md bg-primary px-5 py-2.5 text-sm font-bold text-primary-fg"
              >
                تلاش دوباره
              </button>
            }
          />
        ) : open.length === 0 ? (
          <EmptyState
            title="معاملهٔ بازی نداری"
            hint="از «امروز من» یک سرنخ را جلو ببر، یا با ＋ یک فرصت تازه ثبت کن."
          />
        ) : (
          <>
            <ChipRow>
              <Chip
                active={filters.stage === null}
                onClick={() => setFilters({ ...filters, stage: null })}
                count={open.length}
              >
                همه
              </Chip>
              {OPPORTUNITY_STAGES.map((s) => {
                const count = open.filter((o) => o.stage === s.code).length;
                if (count === 0 && filters.stage !== s.code) return null;
                return (
                  <Chip
                    key={s.code}
                    active={filters.stage === s.code}
                    onClick={() =>
                      setFilters({ ...filters, stage: filters.stage === s.code ? null : s.code })
                    }
                    count={count}
                  >
                    {s.label}
                  </Chip>
                );
              })}
            </ChipRow>

            {/* «filter is on» — what is hiding deals, and one tap to stop it */}
            {activeCount > 0 && (
              <div className="mt-4 flex items-center gap-2 rounded-md bg-canopy p-2 ps-4 text-on-canopy">
                <SlidersIcon className="h-[15px] w-[15px] flex-none text-primary" />
                <span className="min-w-0 flex-1 truncate text-xs font-semibold">
                  {filterSummary(filters, shown.length)}
                </span>
                <button
                  type="button"
                  onClick={() => setFilters({ ...NO_FILTERS, sort: filters.sort })}
                  aria-label="حذف فیلترها"
                  className="grid h-[30px] w-[30px] flex-none place-items-center rounded-sm bg-white/12 transition active:bg-white/25"
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}

            {shown.length === 0 && (
              <EmptyState
                title="هیچ معامله‌ای با این فیلترها نیست"
                hint="یکی دو فیلتر را بردار، یا فیلترها را پاک کن تا کل پایپلاین برگردد."
                action={
                  <button
                    type="button"
                    onClick={() => setFilters({ ...NO_FILTERS, sort: filters.sort })}
                    className="rounded-md bg-primary px-5 py-2.5 text-sm font-bold text-primary-fg"
                  >
                    پاک کردن فیلترها
                  </button>
                }
              />
            )}

            <div className="mt-5 space-y-6">
              {OPPORTUNITY_STAGES.filter((s) => !filters.stage || s.code === filters.stage).map(
                (s) => {
                  const inStage = shown.filter((o) => o.stage === s.code);
                  if (inStage.length === 0) return null;
                  const stageValue = inStage.reduce(
                    (sum, o) => sum + BigInt(o.amount_estimate_rial ?? '0'),
                    0n,
                  );
                  return (
                    <section key={s.code}>
                      <div className="mb-2.5 flex items-center gap-2">
                        <h2 className="text-sm font-bold">{s.label}</h2>
                        <span className="num rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-fg-muted">
                          {faNum(inStage.length)}
                        </span>
                        {stageValue > 0n && (
                          <span className="num ms-auto text-[11px] font-semibold text-fg-muted">
                            {compact(stageValue.toString())}
                          </span>
                        )}
                      </div>
                      <ul className="space-y-2.5">
                        {inStage.map((opp) => (
                          <DealCard key={opp.id} opp={opp} />
                        ))}
                      </ul>
                    </section>
                  );
                },
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function DealCard({ opp }: { opp: PipelineItem }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [losing, setLosing] = useState(false);
  const [lossReason, setLossReason] = useState('');

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch<{ ok: true }>(`/v1/opportunities/${opp.id}`, { method: 'PATCH', body }),
    onSuccess: async () => {
      setLosing(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['opportunities'] }),
        qc.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
    },
    onError: (err) => {
      toast(err instanceof ApiError ? err.message : 'به‌روزرسانی ناموفق بود', 'danger');
    },
  });

  const stageIndex = OPPORTUNITY_STAGES.findIndex((s) => s.code === opp.stage);
  const nextStage = OPPORTUNITY_STAGES[stageIndex + 1];
  const money = compact(opp.amount_estimate_rial);
  const ageDays = daysSince(opp.stage_entered_at);
  const overdue =
    opp.next_action_at !== null && new Date(opp.next_action_at).getTime() < Date.now();

  return (
    <li className="rounded-md border border-border bg-surface p-4 shadow-card">
      {/* The card body is the file — the deal's story lives on the account. */}
      <Link href={`/accounts/${opp.account_id}`} className="block">
        <span className="flex items-start justify-between gap-2">
          <b className="min-w-0 truncate text-[15px] font-bold">{opp.account_name}</b>
          {money ? <span className="num flex-none text-sm font-bold">{money}</span> : null}
        </span>
        {opp.region_text ? (
          <span className="mt-0.5 block truncate text-xs text-fg-muted">{opp.region_text}</span>
        ) : null}

        <span className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {opp.next_action_at && opp.next_action_type ? (
            <span
              className={`flex items-center gap-1 text-[11px] font-semibold ${
                overdue ? 'text-danger' : 'text-primary-ink'
              }`}
            >
              <ClockGlyph />
              {nextActionLabel(opp.next_action_type)}{' '}
              <span className="num">
                {isToday(opp.next_action_at)
                  ? faClock(opp.next_action_at)
                  : faDate(opp.next_action_at)}
              </span>
            </span>
          ) : (
            // 🔒 A deal with no dated next step is the pipeline's real problem.
            // Saying so out loud is the whole point of the row.
            <Tag tone="warn">قدم بعدی تعیین نشده</Tag>
          )}
          <span className="num ms-auto text-[11px] text-fg-faint">
            {ageDays === 0 ? 'امروز وارد این مرحله شد' : `${faNum(ageDays)} روز در این مرحله`}
          </span>
        </span>
      </Link>

      {losing ? (
        <div className="mt-3 space-y-2">
          <SelectField
            label="دلیل از دست رفتن *"
            value={lossReason}
            onChange={setLossReason}
            options={LOSS_REASONS}
            placeholder="انتخاب دلیل…"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!lossReason || patch.isPending}
              onClick={() => patch.mutate({ status: 'lost', loss_reason: lossReason })}
              className="flex-1 rounded-md bg-danger py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              ثبت از دست رفتن
            </button>
            <button
              type="button"
              onClick={() => setLosing(false)}
              className="rounded-md border border-border px-4 py-2.5 text-sm font-medium text-fg-muted"
            >
              انصراف
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex gap-2 border-t border-border pt-3">
          {nextStage ? (
            <button
              type="button"
              disabled={patch.isPending}
              onClick={() => patch.mutate({ stage: nextStage.code })}
              className="flex-1 rounded-md border border-primary py-2.5 text-[13px] font-bold text-primary-ink transition active:bg-primary active:text-primary-fg disabled:opacity-50"
            >
              → {stageLabel(nextStage.code)}
            </button>
          ) : (
            <span className="flex-1 rounded-md bg-surface-2 py-2.5 text-center text-[13px] text-fg-muted">
              منتظر پرداخت میزرو
            </span>
          )}
          <button
            type="button"
            onClick={() => setLosing(true)}
            className="rounded-md border border-border px-4 py-2.5 text-[13px] font-medium text-fg-muted"
          >
            از دست رفت
          </button>
        </div>
      )}
    </li>
  );
}

function ClockGlyph() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden="true"
      className="flex-none"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4l2.5 2.5" />
    </svg>
  );
}
