'use client';

// «ثبت سریع بازدید / تماس» — the <2-minute flow (mock + product doc §7). Mostly
// tappable chips, minimal typing. The next action is MANDATORY 🔒 unless the
// outcome closes the lead; picking an outcome pre-fills the system-suggested
// next action (vertical preset). Submit carries a stable idempotency key so a
// flaky-network retry never double-logs.

import { ChoiceChip, SelectField } from '@/components/field';
import { FormShell } from '@/components/form-shell';
import { useToast } from '@/components/toast';
import { dateInputToIso, faDateOfInput, localDatePlusDays } from '@/lib/format';
import { CURRENT_MENU_OPTIONS, OFFER_HINT_OPTIONS, SEGMENT_OPTIONS } from '@/lib/labels';
import { LOSS_REASONS, NEXT_ACTION_TYPES, VISIT_OUTCOMES } from '@arad-crm/vertical-mizro';
import { ApiError, apiFetch, randomId } from '@arad-crm/web-shared';
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
  const search = useSearchParams();
  const leadId = search.get('lead');
  // The ＋ sheet arrives with the kind already chosen («ثبت تماس» vs «ثبت
  // بازدید») — asking again would be asking the same question twice.
  const kindParam = search.get('kind');
  const initialKind: Kind =
    kindParam === 'call' || kindParam === 'note' || kindParam === 'visit' ? kindParam : 'visit';
  const router = useRouter();
  const toast = useToast();
  // Not `crypto.randomUUID` — that is secure-context-only, so it is undefined
  // over plain http on a LAN address, which is exactly how a seller opens this
  // on their phone during a field test.
  const idempotencyKey = useRef(randomId()).current;

  const [kind, setKind] = useState<Kind>(initialKind);
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
  const [noteError, setNoteError] = useState(false);

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

  // A note is not a field touch: it has no standard outcome, records no
  // findings, and carries no mandatory next action. Showing it all three anyway
  // — including a red `*` on a field this kind does not require — is how a
  // «یادداشت» ends up feeling like a failed «بازدید».
  const isField = kind === 'visit' || kind === 'call';

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (isField && !closes && (!nextType || !nextDate)) {
      setNextError(true);
      return;
    }
    if (!isField && !note.trim()) {
      setNoteError(true);
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

  // «یادداشت» is optional evidence after a visit but IS the note itself when
  // that is the kind — so it moves ahead of the optional next action rather
  // than sitting last, under a field the user may skip.
  const noteField = (
    <fieldset className="!mt-5">
      <legend className="mb-2 text-sm font-bold">
        یادداشت
        {isField ? ' (اختیاری)' : <span className="text-danger"> *</span>}
      </legend>
      <textarea
        value={note}
        onChange={(e) => {
          setNote(e.target.value);
          setNoteError(false);
        }}
        rows={isField ? 2 : 4}
        aria-invalid={noteError || undefined}
        placeholder="مثلاً: کافه لوکس است، پیشنهاد VIP شود"
        className={`w-full rounded-md border bg-surface px-3.5 py-3 text-base outline-none focus:border-primary ${
          noteError ? 'border-danger' : 'border-border'
        }`}
      />
      {noteError ? (
        <p className="mt-1.5 text-xs text-danger">یادداشت خالی چیزی ثبت نمی‌کند — متن را بنویس.</p>
      ) : null}
    </fieldset>
  );

  return (
    <FormShell
      title="ثبت سریع"
      subtitle={isField ? 'هدف: زیر ۲ دقیقه ⏱' : 'یادداشتی روی این پرونده'}
      back
      onSubmit={submit}
      busy={log.isPending}
      submitLabel="ثبت تعامل"
    >
      {/* نوع تعامل */}
      <fieldset>
        <legend className="mb-2 text-sm font-bold">نوع تعامل</legend>
        <div className="flex gap-2">
          {KINDS.map((k) => (
            <ChoiceChip key={k.code} selected={kind === k.code} onClick={() => setKind(k.code)}>
              {k.label}
            </ChoiceChip>
          ))}
        </div>
      </fieldset>

      {/* نتیجهٔ استاندارد — visits and calls have outcomes; a note does not */}
      {isField ? (
        <fieldset className="!mt-5">
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
      ) : null}

      {/* یافته‌ها (findings → account file) — observed on site, so field-only */}
      {isField ? (
        <fieldset className="!mt-5">
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
      ) : null}

      {isField ? null : noteField}

      {/* اقدام بعدی / دلیل بستن */}
      {closes ? (
        <fieldset className="!mt-5">
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
          className={`!mt-5 rounded-md ${nextError ? 'bg-danger/5 p-3 ring-1 ring-danger' : ''}`}
        >
          <legend className="mb-2 text-sm font-bold">
            اقدام بعدی
            {/* 🔒 mandatory for a visit or a call — never for a note */}
            {isField ? <span className="text-danger"> *</span> : ' (اختیاری)'}
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

      {isField ? noteField : null}
    </FormShell>
  );
}
