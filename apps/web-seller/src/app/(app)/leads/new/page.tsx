'use client';

// «سرنخ جدید» — prototype screen ۰۳. Four numbered sections and a sticky
// action bar whose summary updates live: «قدم بعد: تماس پیگیری — فردا ۱۱:۰۰».
//
// This screen IS the demo's steps 7–8. The prototype merges capture and the
// guided next step into one form, which is exactly right: a lead saved without
// a dated next action is a lead that rots, and asking twice is how sellers
// learn to skip the second question. It commits as:
//
//   POST /v1/leads                     → the business + the pipeline entry
//   POST /v1/leads/:id/guided-followup → the dated next action (+ playbook)
//   POST /v1/activities  (optional)    → «یادداشت برای خودم», as the first
//                                        entry on the file's timeline
//
// 🔒 The open-lead invariant is enforced here as well as in the API: the form
// cannot be submitted without an action type AND a date.
//
// Two prototype fields have no system behind them and are not here:
// «یادآوری ۳۰ دقیقه قبل» (nothing sends reminders — F09 suggests, it does not
// send) and a separately stored «شهر»; the account has one region field, so
// city and district are captured into it together rather than one being lost.

import { ChoiceChip, TextField } from '@/components/field';
import { FormShell } from '@/components/form-shell';
import { useToast } from '@/components/toast';
import { faNum, normalizeDigits, toFaDigits } from '@/lib/format';
import type { Lead } from '@/lib/types';
import type { AccountLookupResponse, FlowDefinition } from '@arad-crm/api-contracts';
import {
  LEAD_SOURCES,
  NEXT_ACTION_OFFSETS,
  NEXT_ACTION_TYPES,
  REQUESTED_PRODUCTS,
} from '@arad-crm/vertical-mizro';
import { ApiError, apiFetch } from '@arad-crm/web-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, type ReactNode, useState } from 'react';

interface FlowsResponse {
  items: FlowDefinition[];
}

/** The Persian week starts on شنبه; this is the next one (today if it is Saturday). */
const daysToSaturday = (): number => (6 - new Date().getDay() + 7) % 7;

const atLocalTime = (days: number, hhmm: string): Date => {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(h ?? 10, m ?? 0, 0, 0);
  return d;
};

const faDateTime = new Intl.DateTimeFormat('fa-IR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

export default function NewLeadPage() {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    business_name: '',
    contact_name: '',
    phone: '',
    city: '',
    region_text: '',
  });
  const [source, setSource] = useState('manual');
  const [products, setProducts] = useState<string[]>([]);
  const [actionType, setActionType] = useState('follow_up_call');
  const [whenKey, setWhenKey] = useState('tomorrow');
  const [customDate, setCustomDate] = useState('');
  const [time, setTime] = useState('11:00');
  const [note, setNote] = useState('');
  const [flowId, setFlowId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const flows = useQuery({
    queryKey: ['flows'],
    queryFn: () => apiFetch<FlowsResponse>('/v1/flows'),
    staleTime: 5 * 60_000,
  });
  const leadFlows = (flows.data?.items ?? []).filter(
    (f) => f.entity_kind === 'lead' && f.status === 'active',
  );

  // Duplicate check while the phone is still being typed — the ＋ sheet's rule:
  // say it is taken BEFORE the rest of the form is filled in.
  const phoneDigits = normalizeDigits(form.phone).replace(/\D/g, '');
  const lookup = useQuery({
    queryKey: ['account-lookup', phoneDigits],
    queryFn: () => apiFetch<AccountLookupResponse>(`/v1/accounts/lookup?phone=${phoneDigits}`),
    enabled: phoneDigits.length === 11,
    staleTime: 60_000,
  });

  const dueAt = (): Date => {
    if (whenKey === 'custom' && customDate) {
      const [y, m, d] = customDate.split('-').map(Number);
      const [h, min] = time.split(':').map(Number);
      const at = new Date();
      at.setFullYear(y ?? at.getFullYear(), (m ?? 1) - 1, d ?? 1);
      at.setHours(h ?? 10, min ?? 0, 0, 0);
      return at;
    }
    if (whenKey === 'saturday') return atLocalTime(daysToSaturday(), time);
    return atLocalTime(NEXT_ACTION_OFFSETS.find((o) => o.key === whenKey)?.days ?? 1, time);
  };

  const actionLabel = NEXT_ACTION_TYPES.find((t) => t.code === actionType)?.label ?? '—';

  const submit = useMutation({
    mutationFn: async () => {
      const lead = await apiFetch<Lead>('/v1/leads', {
        method: 'POST',
        body: {
          business_name: form.business_name.trim(),
          phone: phoneDigits,
          region_text: [form.city.trim(), form.region_text.trim()].filter(Boolean).join(' · '),
          ...(form.contact_name.trim() ? { contact_name: form.contact_name.trim() } : {}),
          source,
          ...(products.length > 0 ? { requested_features: products } : {}),
        },
      });

      // 🔒 the dated next action, in the same breath as the capture
      await apiFetch(`/v1/leads/${lead.id}/guided-followup`, {
        method: 'POST',
        body: {
          next_action_type: actionType,
          next_action_at: dueAt().toISOString(),
          ...(flowId ? { flow_id: flowId } : {}),
        },
      });

      if (note.trim()) {
        await apiFetch('/v1/activities', {
          method: 'POST',
          body: {
            account_id: lead.account_id,
            lead_id: lead.id,
            kind: 'note',
            note: note.trim(),
          },
        });
      }
      return lead;
    },
    onSuccess: async (lead) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['today'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
      toast('سرنخ ثبت شد و قدم بعد زمان‌بندی شد ✓', 'success');
      router.replace(`/accounts/${lead.account_id}?lead=${lead.id}`);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        setErrors((prev) => ({ ...prev, phone: 'این کسب‌وکار قبلاً ثبت شده است' }));
        return;
      }
      toast('ثبت ناموفق بود — دوباره تلاش کن', 'danger');
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (form.business_name.trim().length < 2) next.business_name = 'نام کسب‌وکار را وارد کنید';
    if (phoneDigits.length !== 11) next.phone = 'شمارهٔ موبایل ۱۱ رقمی وارد کنید';
    if (!form.region_text.trim() && !form.city.trim()) next.region_text = 'منطقه را وارد کنید';
    if (whenKey === 'custom' && !customDate) next.when = 'تاریخ را انتخاب کنید';
    setErrors(next);
    if (Object.keys(next).length === 0) submit.mutate();
  };

  const toggleProduct = (code: string) =>
    setProducts((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));

  return (
    <FormShell
      title="سرنخ جدید"
      subtitle="کافه یا رستورانی که تازه پیدا کرده‌اید"
      onSubmit={onSubmit}
      busy={submit.isPending}
      submitLabel="ثبت سرنخ و زمان‌بندی قدم بعد"
      note={
        <>
          قدم بعد: <b className="text-fg">{actionLabel}</b> — {faDateTime.format(dueAt())} ساعت{' '}
          <span className="num ltr">{toFaDigits(time)}</span>
        </>
      }
    >
      <Section n={1} title="کسب‌وکار">
        <TextField
          label="نام کافه / رستوران"
          required
          placeholder="مثلاً کافه مینیمال"
          value={form.business_name}
          onChange={(e) => setForm((f) => ({ ...f, business_name: e.target.value }))}
          error={errors.business_name}
        />
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="فرد رابط"
            placeholder="نام و نام خانوادگی"
            value={form.contact_name}
            onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))}
          />
          <TextField
            label="شمارهٔ موبایل"
            required
            dir="ltr"
            inputMode="numeric"
            placeholder="۰۹۱۲۳۴۵۶۷۸۹"
            className="num"
            value={toFaDigits(form.phone)}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                phone: normalizeDigits(e.target.value).replace(/\D/g, '').slice(0, 11),
              }))
            }
            error={errors.phone}
          />
        </div>

        {lookup.data?.found && (
          <p
            className={`rounded-md border p-3 text-[13px] ${
              lookup.data.visible_to_me
                ? 'border-warning/30 bg-warning-soft text-fg'
                : 'border-border bg-surface-2 text-fg-muted'
            }`}
          >
            {lookup.data.visible_to_me ? (
              <>
                «{lookup.data.name}» با این شماره ثبت شده است.{' '}
                <Link
                  href={`/accounts/${lookup.data.account_id}`}
                  className="font-semibold text-primary-ink"
                >
                  رفتن به پرونده
                </Link>
              </>
            ) : (
              lookup.data.message
            )}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="شهر"
            placeholder="تهران"
            value={form.city}
            onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
          />
          <TextField
            label="منطقه"
            placeholder="مثلاً ونک"
            value={form.region_text}
            onChange={(e) => setForm((f) => ({ ...f, region_text: e.target.value }))}
            error={errors.region_text}
          />
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">سرنخ از کجا آمده؟</p>
          <div className="flex flex-wrap gap-2">
            {LEAD_SOURCES.map((s) => (
              <ChoiceChip
                key={s.code}
                selected={source === s.code}
                onClick={() => setSource(s.code)}
              >
                {s.label}
              </ChoiceChip>
            ))}
          </div>
        </div>
      </Section>

      <Section n={2} title="دنبال چه چیزی هستند؟">
        <div className="flex flex-wrap gap-2">
          {REQUESTED_PRODUCTS.map((p) => (
            <ChoiceChip
              key={p.code}
              selected={products.includes(p.code)}
              onClick={() => toggleProduct(p.code)}
            >
              {p.label}
            </ChoiceChip>
          ))}
        </div>
        <p className="text-xs text-fg-muted">
          می‌توانید چند مورد را انتخاب کنید — روی پیشنهاد قیمت اثر می‌گذارد.
        </p>
      </Section>

      <Section n={3} title="قدم بعدی چیست؟">
        <div className="rounded-md border border-border bg-surface p-4">
          <p className="mb-2 text-sm font-medium">نوع اقدام</p>
          <div className="flex flex-wrap gap-2">
            {NEXT_ACTION_TYPES.map((t) => (
              <ChoiceChip
                key={t.code}
                selected={actionType === t.code}
                onClick={() => setActionType(t.code)}
              >
                {t.label}
              </ChoiceChip>
            ))}
          </div>

          <p className="mb-2 mt-4 text-sm font-medium">کِی؟</p>
          <div className="flex flex-wrap gap-2">
            {NEXT_ACTION_OFFSETS.map((o) => (
              <ChoiceChip
                key={o.key}
                selected={whenKey === o.key}
                onClick={() => setWhenKey(o.key)}
              >
                {o.label}
              </ChoiceChip>
            ))}
            <ChoiceChip selected={whenKey === 'saturday'} onClick={() => setWhenKey('saturday')}>
              شنبه
            </ChoiceChip>
            <ChoiceChip selected={whenKey === 'custom'} onClick={() => setWhenKey('custom')}>
              تاریخ دلخواه
            </ChoiceChip>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            {whenKey === 'custom' && (
              <TextField
                label="تاریخ"
                type="date"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                error={errors.when}
              />
            )}
            <TextField
              label="ساعت"
              type="time"
              dir="ltr"
              className="num"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>

          <div className="mt-4">
            <TextField
              label="یادداشت برای خودم"
              placeholder="مثلاً: قیمت پلن استاندارد را بگو"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              hint="روی خط زمانی پرونده ثبت می‌شود."
            />
          </div>
        </div>
      </Section>

      <Section n={4} title="فلوی پیگیری">
        {flows.isPending ? (
          <div className="skeleton h-20 rounded-md" />
        ) : leadFlows.length === 0 ? (
          <p className="rounded-md border border-border bg-surface p-4 text-[13px] text-fg-muted">
            هنوز فلویی برای سرنخ‌ها تعریف نشده — قدم بعدی را خودتان تعیین می‌کنید.
          </p>
        ) : (
          <div className="overflow-hidden rounded-md border border-border bg-surface">
            {leadFlows.map((flow) => (
              <FlowOption
                key={flow.id}
                selected={flowId === flow.id}
                onSelect={() => setFlowId(flow.id)}
                title={flow.label}
                detail={`${faNum(flow.steps.length)} قدم · ${flow.steps
                  .map((s) => s.label)
                  .slice(0, 4)
                  .join(' ← ')}`}
              />
            ))}
            <FlowOption
              selected={flowId === null}
              onSelect={() => setFlowId(null)}
              title="بدون فلو — دستی پیگیری می‌کنم"
              detail="هر بار خودم قدم بعدی را تعیین می‌کنم"
            />
          </div>
        )}
        <p className="text-xs leading-relaxed text-fg-muted">
          وقتی سرنخ داخل یک فلو باشد، بعد از هر اقدام سیستم <b>قدم بعدی همان فلو</b> را پیشنهاد
          می‌دهد — مگر اینکه خودتان قدم دیگری انتخاب کنید.
        </p>
      </Section>
    </FormShell>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-3 flex items-center gap-2 text-[15px] font-bold">
        <span className="num grid h-6 w-6 place-items-center rounded-full bg-primary-soft text-[11px] font-bold text-primary-ink">
          {faNum(n)}
        </span>
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function FlowOption({
  selected,
  onSelect,
  title,
  detail,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  detail: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className="flex w-full items-start gap-3 border-b border-border p-3.5 text-start last:border-b-0"
    >
      <span
        className={`mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-full border-2 ${
          selected ? 'border-primary' : 'border-border-strong'
        }`}
      >
        {selected && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold">{title}</span>
        <span className="mt-0.5 block text-[11px] leading-relaxed text-fg-muted">{detail}</span>
      </span>
    </button>
  );
}
