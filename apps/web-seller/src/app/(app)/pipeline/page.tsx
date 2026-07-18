'use client';

// «پایپلاین» — my open opportunities grouped by stage. Advance a stage or mark
// lost (a standard loss reason is required 🔒). There is NO «برنده» button —
// a sale is detected from a real Mizro payment event, never toggled by hand.

import { EmptyState } from '@/components/empty-state';
import { SelectField } from '@/components/field';
import { ListSkeleton } from '@/components/skeleton';
import { useToast } from '@/components/toast';
import { formatToman } from '@/lib/format';
import { stageLabel } from '@/lib/labels';
import type { OpportunitiesResponse, Opportunity } from '@/lib/types';
import { LOSS_REASONS, OPPORTUNITY_STAGES } from '@arad-crm/vertical-mizro';
import { ApiError, apiFetch } from '@arad-crm/web-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

export default function PipelinePage() {
  const opps = useQuery({
    queryKey: ['opportunities', 'mine'],
    queryFn: () => apiFetch<OpportunitiesResponse>('/v1/opportunities?view=mine'),
  });

  const open = opps.data?.items.filter((o) => o.status === 'open') ?? [];

  return (
    <main className="flex min-h-dvh flex-col px-4 pb-28 pt-6">
      <header className="mb-5">
        <h1 className="text-2xl font-bold">پایپلاین من</h1>
        <p className="mt-1 text-sm text-fg-muted">معامله‌های باز، مرحله به مرحله</p>
      </header>

      {opps.isPending ? (
        <ListSkeleton rows={4} />
      ) : opps.isError ? (
        <EmptyState title="پایپلاین بارگیری نشد" hint="کمی بعد دوباره تلاش کن." />
      ) : open.length === 0 ? (
        <EmptyState
          title="معاملهٔ بازی نداری"
          hint="از پیگیری‌های امروز یک فرصت جدید بساز تا این‌جا دیده شود."
        />
      ) : (
        <div className="space-y-6">
          {OPPORTUNITY_STAGES.map((stage) => {
            const inStage = open.filter((o) => o.stage === stage.code);
            if (inStage.length === 0) return null;
            return (
              <section key={stage.code}>
                <h2 className="mb-2 flex items-center gap-2 text-sm font-bold">
                  {stage.label}
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-fg-muted">
                    {new Intl.NumberFormat('fa-IR').format(inStage.length)}
                  </span>
                </h2>
                <ul className="space-y-2.5">
                  {inStage.map((opp) => (
                    <OpportunityCard key={opp.id} opp={opp} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}

function OpportunityCard({ opp }: { opp: Opportunity }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [losing, setLosing] = useState(false);
  const [lossReason, setLossReason] = useState('');

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch<{ ok: true }>(`/v1/opportunities/${opp.id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['opportunities'] });
      setLosing(false);
    },
    onError: (err) => {
      toast(err instanceof ApiError ? err.message : 'به‌روزرسانی ناموفق بود', 'danger');
    },
  });

  const stageIndex = OPPORTUNITY_STAGES.findIndex((s) => s.code === opp.stage);
  const nextStage = OPPORTUNITY_STAGES[stageIndex + 1];

  return (
    <li className="rounded-md border border-border bg-surface shadow-card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="font-bold">{opp.account_name}</p>
        {opp.amount_estimate_rial ? (
          <span className="shrink-0 text-sm text-fg-muted">
            {formatToman(opp.amount_estimate_rial)} ت
          </span>
        ) : null}
      </div>

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
        <div className="mt-3 flex gap-2">
          {nextStage ? (
            <button
              type="button"
              disabled={patch.isPending}
              onClick={() => patch.mutate({ stage: nextStage.code })}
              className="flex-1 rounded-md border border-primary py-2.5 text-sm font-bold text-primary active:bg-primary active:text-primary-fg disabled:opacity-50"
            >
              → {stageLabel(nextStage.code)}
            </button>
          ) : (
            <span className="flex-1 rounded-md bg-surface-2 py-2.5 text-center text-sm text-fg-muted">
              منتظر پرداخت
            </span>
          )}
          <button
            type="button"
            onClick={() => setLosing(true)}
            className="rounded-md border border-border px-4 py-2.5 text-sm font-medium text-fg-muted"
          >
            از دست رفت
          </button>
        </div>
      )}
    </li>
  );
}
