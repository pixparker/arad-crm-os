'use client';

// «ثبت سریع بازدید / تماس» — the <2-minute flow (mock + product doc §7). Mostly
// tappable chips, minimal typing. The next action is MANDATORY 🔒 unless the
// outcome closes the lead; picking an outcome pre-fills the system-suggested
// next action (vertical preset). Submit carries a stable idempotency key so a
// flaky-network retry never double-logs.

import { ChoiceChip, SelectField } from '@/components/field';
import { ChevronLeftIcon } from '@/components/icons';
import { useToast } from '@/components/toast';
import { dateInputToIso, faDateOfInput, localDatePlusDays } from '@/lib/format';
import { CURRENT_MENU_OPTIONS, OFFER_HINT_OPTIONS, SEGMENT_OPTIONS } from '@/lib/labels';
import { LOSS_REASONS, NEXT_ACTION_TYPES, VISIT_OUTCOMES } from '@arad-crm/vertical-mizro';
import { ApiError, apiFetch } from '@arad-crm/web-shared';
import { useMutation } from '@tanstack/react-query';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';

type Kind = 'visit' | 'call' | 'note';
const KINDS: { code: Kind; label: string }[] = [
  { code: 'visit', label: 'بازدید' },
  { code: 'call', label: 'تماس' },
  { code: 'note', label: 'یادداشت' },
];

export default function QuickLogPage() {
  const params = useParams<{ id: string }>();
  const leadId = useSearchParams().get('lead');
  const router = useRouter();
  const toast = useToast();
  const idempotencyKey = useRef(crypto.randomUUID()).current;

  const [kind, setKind] = useState<Kind>('visit');
  const [outcome, setOutcome] = useState<string>('');
  const [segment, setSegment] = useState('');
  const [offerHint, setOfferHint] = useState('');
  const [currentMenu, setCurrentMenu] = useState('');
  const [interest, setInterest] = useState(0);
  const [note, setNote] = useState('');
  const [nextType, setNextType] = useState('');
  const [nextDate, setNextDate] = useState('');
  const [closeReason, setCloseReason] = useState('');
  const [nextError, setNextError] = useState(false);

  const outcomeDef = useMemo(() => VISIT_OUTCOMES.find((o) => o.code === outcome), [outcome]);
  const closes = Boolean(outcomeDef?.closes);

  const pickOutcome = (code: string) => {
    setOutcome(code);
    setNextError(false);
    const def = VISIT_OUTCOMES.find((o) => o.code === code);
    if (def?.suggestedNext) {
      setNextType(def.suggestedNext.type);
      setNextDate(localDatePlusDays(def.suggestedNext.inDays));
    }
  };

  const log = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch<{ ok: true }>('/v1/activities', { method: 'POST', body, idempotencyKey }),
    onSuccess: () => {
      toast('ثبت شد ✓', 'success');
      router.replace(`/accounts/${params.id}`);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.meta?.rule === 'next_action_required') {
        setNextError(true);
        const suggested = err.meta.suggested as { type: string; inDays: number } | null;
        if (suggested && !nextType) {
          setNextType(suggested.type);
          setNextDate(localDatePlusDays(suggested.inDays));
        }
        toast('اقدام بعدی را مشخص کن', 'danger');
      } else {
        toast('ثبت ناموفق بود — دوباره تلاش کن', 'danger');
      }
    },
  });

  const submit = () => {
    const isField = kind === 'visit' || kind === 'call';
    if (isField && !closes && (!nextType || !nextDate)) {
      setNextError(true);
      return;
    }
    const findings: Record<string, unknown> = {};
    if (segment) findings.segment = segment;
    if (offerHint) findings.offer_hint = offerHint;
    if (currentMenu) findings.current_menu = currentMenu;
    if (interest) findings.interest_level = interest;

    log.mutate({
      account_id: params.id,
      ...(leadId ? { lead_id: leadId } : {}),
      kind,
      ...(outcome ? { outcome } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
      ...(Object.keys(findings).length ? { findings } : {}),
      ...(closes
        ? { close_reason: closeReason || outcome }
        : nextType && nextDate
          ? { next_action_type: nextType, next_action_at: dateInputToIso(nextDate) }
          : {}),
    });
  };

  return (
    <main className="flex min-h-dvh flex-col px-4 pb-28 pt-6">
      <header className="mb-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="بازگشت"
          className="-ms-2 flex h-9 w-9 items-center justify-center rounded-full text-fg-muted active:bg-surface-2"
        >
          <ChevronLeftIcon className="h-6 w-6" />
        </button>
        <h1 className="text-xl font-bold">ثبت سریع</h1>
        <span className="ms-auto text-[11px] text-fg-muted">هدف: زیر ۲ دقیقه ⏱</span>
      </header>

      {/* نوع تعامل */}
      <fieldset className="mt-4">
        <legend className="mb-2 text-sm font-bold">نوع تعامل</legend>
        <div className="flex gap-2">
          {KINDS.map((k) => (
            <ChoiceChip key={k.code} selected={kind === k.code} onClick={() => setKind(k.code)}>
              {k.label}
            </ChoiceChip>
          ))}
        </div>
      </fieldset>

      {/* نتیجهٔ استاندارد */}
      <fieldset className="mt-5">
        <legend className="mb-2 text-sm font-bold">نتیجهٔ استاندارد</legend>
        <div className="flex flex-wrap gap-2">
          {VISIT_OUTCOMES.map((o) => (
            <ChoiceChip
              key={o.code}
              selected={outcome === o.code}
              onClick={() => pickOutcome(o.code)}
            >
              {o.label}
            </ChoiceChip>
          ))}
        </div>
      </fieldset>

      {/* یافته‌ها (findings → account file) */}
      <fieldset className="mt-5">
        <legend className="mb-2 text-sm font-bold">یافته‌ها (اختیاری)</legend>
        <p className="mb-2 text-xs text-fg-muted">بخش کسب‌وکار</p>
        <div className="flex flex-wrap gap-2">
          {SEGMENT_OPTIONS.map((s) => (
            <ChoiceChip
              key={s.code}
              selected={segment === s.code}
              onClick={() => setSegment(segment === s.code ? '' : s.code)}
            >
              {s.label}
            </ChoiceChip>
          ))}
        </div>
        <p className="mb-2 mt-3 text-xs text-fg-muted">پیشنهاد مناسب</p>
        <div className="flex flex-wrap gap-2">
          {OFFER_HINT_OPTIONS.map((o) => (
            <ChoiceChip
              key={o.code}
              selected={offerHint === o.code}
              onClick={() => setOfferHint(offerHint === o.code ? '' : o.code)}
            >
              {o.label}
            </ChoiceChip>
          ))}
        </div>
        <p className="mb-2 mt-3 text-xs text-fg-muted">منوی فعلی</p>
        <div className="flex flex-wrap gap-2">
          {CURRENT_MENU_OPTIONS.map((m) => (
            <ChoiceChip
              key={m.code}
              selected={currentMenu === m.code}
              onClick={() => setCurrentMenu(currentMenu === m.code ? '' : m.code)}
            >
              {m.label}
            </ChoiceChip>
          ))}
        </div>
        <p className="mb-2 mt-3 text-xs text-fg-muted">میزان علاقه</p>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <ChoiceChip
              key={n}
              selected={interest === n}
              onClick={() => setInterest(interest === n ? 0 : n)}
            >
              {new Intl.NumberFormat('fa-IR').format(n)}
            </ChoiceChip>
          ))}
        </div>
      </fieldset>

      {/* اقدام بعدی * / دلیل بستن */}
      {closes ? (
        <fieldset className="mt-5">
          <legend className="mb-2 text-sm font-bold text-danger">دلیل بستن *</legend>
          <SelectField
            label=""
            value={closeReason}
            onChange={setCloseReason}
            options={LOSS_REASONS}
            placeholder="انتخاب دلیل…"
          />
        </fieldset>
      ) : (
        <fieldset
          className={`mt-5 rounded-md p-3 ${nextError ? 'bg-danger/5 ring-1 ring-danger' : ''}`}
        >
          <legend className="mb-2 text-sm font-bold">
            اقدام بعدی <span className="text-danger">*</span>
          </legend>
          {nextError ? (
            <p className="mb-2 text-xs text-danger">
              هر بازدید یا تماس باید یک اقدام بعدی تاریخ‌دار داشته باشد — هیچ سرنخی رها نمی‌شود.
            </p>
          ) : null}
          <div className="space-y-3">
            <SelectField
              label="نوع اقدام"
              value={nextType}
              onChange={(v) => {
                setNextType(v);
                setNextError(false);
              }}
              options={NEXT_ACTION_TYPES}
              placeholder="انتخاب…"
            />
            <div>
              <label htmlFor="next-date" className="mb-1.5 block text-sm font-medium">
                تاریخ اقدام
              </label>
              <input
                id="next-date"
                type="date"
                dir="ltr"
                value={nextDate}
                onChange={(e) => {
                  setNextDate(e.target.value);
                  setNextError(false);
                }}
                className="w-full rounded-md border border-border bg-surface px-3.5 py-3 text-base outline-none focus:border-primary"
              />
              {nextDate ? (
                <p className="mt-1 text-xs text-fg-muted">{faDateOfInput(nextDate)}</p>
              ) : null}
            </div>
          </div>
        </fieldset>
      )}

      {/* یادداشت */}
      <fieldset className="mt-5">
        <legend className="mb-2 text-sm font-bold">یادداشت (اختیاری)</legend>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="مثلاً: کافه لوکس است، پیشنهاد VIP شود"
          className="w-full rounded-md border border-border bg-surface px-3.5 py-3 text-base outline-none focus:border-primary"
        />
      </fieldset>

      <div className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-md border-t border-border bg-surface p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <button
          type="button"
          onClick={submit}
          disabled={log.isPending}
          className="w-full rounded-md bg-gradient-primary shadow-card py-3.5 text-base font-bold text-primary-fg disabled:opacity-60"
        >
          {log.isPending ? 'در حال ثبت…' : 'ثبت تعامل'}
        </button>
      </div>
    </main>
  );
}
