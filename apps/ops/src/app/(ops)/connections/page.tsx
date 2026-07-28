'use client';

// Connected apps — the demo's step 4: connect sms.ir so a real OTP reaches a
// real phone.
//
// 🔒 Credentials are write-only. The add and rotate forms POST them and never
// read them back; a row shows `cred_hint` («…۱۲۳۴») because that is the only
// credential-derived value that ever leaves the store. The form fields come
// from the adapter (`cred_fields`), so a new provider ships its own form with
// no change here.
//
// The health of a connection is the row's headline, not a column: an SMS
// connection that has never been tested is indistinguishable from a working
// one until someone tries to log in, and that is the failure this screen is
// meant to prevent.

import {
  type ConnectionView,
  type ProviderView,
  errorMessage,
  useConnectionEvents,
  useConnections,
  useCreateConnection,
  useCreateTemplate,
  useProviders,
  useRotateCreds,
  useSetConnectionStatus,
  useTemplateTestSend,
  useTemplates,
  useTestConnection,
} from '@/lib/api';
import { faDateTimeOf, normalizeDigits } from '@/lib/format';
import {
  DataRow,
  DataRowSkeleton,
  EmptyState,
  Field,
  GradientButton,
  Input,
  ListPage,
  Modal,
  SelectField,
  StatusBadge,
  type StatusBadgeTone,
  pickAvatarGradient,
} from '@arad/ops-kit';
import { KeyRound, Plug, Plus, RefreshCw, Send, SlidersHorizontal } from 'lucide-react';
import { type FormEvent, useState } from 'react';

const STATUS: Record<string, { tone: StatusBadgeTone; label: string }> = {
  active: { tone: 'emerald', label: 'فعال' },
  error: { tone: 'rose', label: 'خطا' },
  disabled: { tone: 'slate', label: 'غیرفعال' },
};

function CredFields({
  provider,
  values,
  onChange,
}: {
  provider: ProviderView;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <>
      {provider.cred_fields.map((f) => (
        <Field key={f.key} label={f.label} {...(f.hint ? { helper: f.hint } : {})}>
          <Input
            // 🔒 A secret field is a password input and is never pre-filled —
            // there is nothing to pre-fill it from.
            type={f.secret ? 'password' : 'text'}
            autoComplete="off"
            value={values[f.key] ?? ''}
            onChange={(e) => onChange(f.key, e.target.value)}
            {...(f.placeholder ? { placeholder: f.placeholder } : {})}
            dir="ltr"
            className="font-mono"
          />
        </Field>
      ))}
    </>
  );
}

export default function ConnectionsPage() {
  const connections = useConnections();
  const providers = useProviders();
  const create = useCreateConnection();
  const rotate = useRotateCreds();
  const setStatus = useSetConnectionStatus();
  const test = useTestConnection();

  const [addOpen, setAddOpen] = useState(false);
  const [providerKey, setProviderKey] = useState('');
  const [label, setLabel] = useState('');
  const [creds, setCreds] = useState<Record<string, string>>({});

  const [rotateFor, setRotateFor] = useState<ConnectionView | null>(null);
  const [rotateCredsValues, setRotateCredsValues] = useState<Record<string, string>>({});

  const [detailFor, setDetailFor] = useState<ConnectionView | null>(null);
  const templates = useTemplates(detailFor?.id ?? null);
  const events = useConnectionEvents(detailFor?.id ?? null);
  const createTemplate = useCreateTemplate();
  const templateTest = useTemplateTestSend();
  const [alias, setAlias] = useState('default-otp');
  const [templateRef, setTemplateRef] = useState('');
  const [testTo, setTestTo] = useState('');

  const selectedProvider = providers.data?.find((p) => p.provider === providerKey);
  const rotateProvider = providers.data?.find((p) => p.provider === rotateFor?.provider);
  // Connect only boots when the server has its master key; without one there is
  // no provider to choose and no way to encrypt a credential.
  const connectOff = providers.data?.length === 0;

  const submitCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!selectedProvider) return;
    create.mutate(
      { provider: selectedProvider.provider, label: label.trim(), creds },
      {
        onSuccess: () => {
          setAddOpen(false);
          setCreds({});
          setLabel('');
        },
      },
    );
  };

  const submitRotate = (e: FormEvent) => {
    e.preventDefault();
    if (!rotateFor) return;
    rotate.mutate(
      { id: rotateFor.id, creds: rotateCredsValues },
      {
        onSuccess: () => {
          setRotateFor(null);
          setRotateCredsValues({});
        },
      },
    );
  };

  return (
    <ListPage
      title="اتصال‌ها"
      subtitle="سرویس‌های بیرونی پلتفرم. کلیدها فقط نوشتنی‌اند: پس از ذخیره دیگر خوانده نمی‌شوند و تعویض یعنی وارد کردن دوباره."
      action={
        <GradientButton
          icon={<Plus className="h-4 w-4" />}
          disabled={connectOff}
          onClick={() => {
            setAddOpen(true);
            setProviderKey(providers.data?.[0]?.provider ?? '');
          }}
        >
          اتصال جدید
        </GradientButton>
      }
      footer={
        <>
          {test.data && (
            <p
              className={`rounded-xl px-4 py-3 text-sm ${
                test.data.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
              }`}
            >
              {test.data.ok
                ? `ارسال آزمایشی موفق بود (${test.data.latency_ms}ms)`
                : `ارسال آزمایشی ناموفق: ${test.data.error ?? 'نامشخص'}`}
            </p>
          )}
          {test.error && (
            <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {errorMessage(test.error)}
            </p>
          )}
        </>
      }
    >
      {connections.isPending ? (
        <DataRowSkeleton count={3} />
      ) : connections.error ? (
        <EmptyState
          icon={Plug}
          headline="اتصال‌ها بارگیری نشد"
          description={errorMessage(connections.error)}
          cta={
            <GradientButton
              gradient="slate"
              icon={<RefreshCw className="h-4 w-4" />}
              onClick={() => connections.refetch()}
            >
              تلاش دوباره
            </GradientButton>
          }
        />
      ) : connections.data.length === 0 ? (
        <EmptyState
          icon={Plug}
          headline={connectOff ? 'سرویسی در دسترس نیست' : 'اتصالی ثبت نشده'}
          description={
            connectOff
              ? 'کلید اصلی Connect روی سرور تنظیم نشده (CONNECT_MASTER_KEY). تا قبل از آن نمی‌توان اتصالی ثبت کرد.'
              : 'تا وقتی یک اتصال پیامکی فعال نباشد، کد ورود برای هیچ فروشنده‌ای ارسال نمی‌شود.'
          }
        />
      ) : (
        <div className="divide-y divide-slate-100">
          {connections.data.map((c, i) => {
            const gradient = pickAvatarGradient(i);
            const state = STATUS[c.status] ?? { tone: 'slate' as const, label: c.status };
            const tested = c.health.last_test_result;
            return (
              <DataRow
                key={c.id}
                icon={Plug}
                gradientFrom={gradient.from}
                gradientTo={gradient.to}
                primary={c.label}
                meta={[
                  c.provider,
                  c.capabilities.join('، '),
                  c.cred_hint ? `کلید ${c.cred_hint}` : null,
                  tested
                    ? `آخرین آزمایش ${faDateTimeOf(c.health.last_test_at ?? null)}`
                    : 'هرگز آزمایش نشده',
                ]}
                showChevron={false}
                trailing={
                  <div className="flex items-center gap-2">
                    {!tested && <StatusBadge tone="amber" label="آزمایش نشده" variant="pulse" />}
                    {tested === 'failure' && (
                      <StatusBadge tone="rose" label="آخرین آزمایش ناموفق" />
                    )}
                    <StatusBadge tone={state.tone} label={state.label} />
                  </div>
                }
                rowActions={
                  <div className="flex flex-wrap items-center gap-1">
                    <button
                      type="button"
                      title="آزمایش اتصال"
                      disabled={test.isPending}
                      onClick={() => test.mutate({ id: c.id })}
                      className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      title="تعویض کلید"
                      onClick={() => {
                        setRotateFor(c);
                        setRotateCredsValues({});
                      }}
                      className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                    >
                      <KeyRound className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      title="قالب‌ها و رخدادها"
                      onClick={() => setDetailFor(c)}
                      className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                    >
                      <SlidersHorizontal className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      disabled={setStatus.isPending}
                      onClick={() =>
                        setStatus.mutate({
                          id: c.id,
                          status: c.status === 'active' ? 'disabled' : 'active',
                        })
                      }
                      className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                    >
                      {c.status === 'active' ? 'غیرفعال' : 'فعال'}
                    </button>
                  </div>
                }
              />
            );
          })}
        </div>
      )}

      {/* ── add ─────────────────────────────────────────────────────────── */}
      <Modal
        open={addOpen}
        onOpenChange={setAddOpen}
        title="اتصال جدید"
        description="کلیدها رمزگذاری و ذخیره می‌شوند و دیگر خوانده نمی‌شوند."
        icon={Plug}
        footer={
          <div className="flex justify-end gap-2">
            <GradientButton gradient="slate" onClick={() => setAddOpen(false)}>
              انصراف
            </GradientButton>
            <GradientButton
              type="submit"
              form="create-connection"
              loading={create.isPending}
              disabled={!label.trim() || !selectedProvider}
            >
              ذخیره
            </GradientButton>
          </div>
        }
      >
        <form id="create-connection" onSubmit={submitCreate} className="space-y-4">
          <SelectField
            label="سرویس"
            dir="rtl"
            value={providerKey}
            onValueChange={(v) => {
              setProviderKey(v);
              setCreds({});
            }}
            options={(providers.data ?? []).map((p) => ({ value: p.provider, label: p.provider }))}
          />
          <Field label="عنوان" helper="برای تشخیص در فهرست — مثلاً «پیامک اصلی».">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} />
          </Field>
          {selectedProvider && (
            <CredFields
              provider={selectedProvider}
              values={creds}
              onChange={(k, v) => setCreds((prev) => ({ ...prev, [k]: v }))}
            />
          )}
          {create.error && <p className="text-sm text-rose-600">{errorMessage(create.error)}</p>}
        </form>
      </Modal>

      {/* ── rotate ──────────────────────────────────────────────────────── */}
      <Modal
        open={rotateFor !== null}
        onOpenChange={(open) => !open && setRotateFor(null)}
        title={`تعویض کلید ${rotateFor?.label ?? ''}`}
        description="کلید فعلی خوانده نمی‌شود؛ مقدار جدید را کامل وارد کنید. کلید قبلی بلافاصله بی‌اثر می‌شود."
        icon={KeyRound}
        footer={
          <div className="flex justify-end gap-2">
            <GradientButton gradient="slate" onClick={() => setRotateFor(null)}>
              انصراف
            </GradientButton>
            <GradientButton type="submit" form="rotate-creds" loading={rotate.isPending}>
              تعویض
            </GradientButton>
          </div>
        }
      >
        <form id="rotate-creds" onSubmit={submitRotate} className="space-y-4">
          {rotateProvider && (
            <CredFields
              provider={rotateProvider}
              values={rotateCredsValues}
              onChange={(k, v) => setRotateCredsValues((prev) => ({ ...prev, [k]: v }))}
            />
          )}
          {rotate.error && <p className="text-sm text-rose-600">{errorMessage(rotate.error)}</p>}
        </form>
      </Modal>

      {/* ── templates + events ──────────────────────────────────────────── */}
      <Modal
        open={detailFor !== null}
        onOpenChange={(open) => !open && setDetailFor(null)}
        title={`${detailFor?.label ?? ''} — قالب‌ها و رخدادها`}
        icon={SlidersHorizontal}
        size="lg"
      >
        <div className="space-y-5">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">قالب‌های پیامک</h3>
            <p className="text-xs leading-5 text-slate-500">
              سرویس‌های OTP ابری با شناسهٔ قالبِ ثبت‌شده در پنل خودشان کار می‌کنند؛ متن آزاد پذیرفته
              نمی‌شود.
            </p>
            {templates.data?.length ? (
              <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-100">
                {templates.data.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center gap-2 p-3">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-slate-900">{t.alias}</span>
                      <span dir="ltr" className="block font-mono text-xs text-slate-500">
                        #{t.provider_template_ref}
                      </span>
                    </span>
                    <Input
                      value={testTo}
                      onChange={(e) => setTestTo(e.target.value)}
                      placeholder="09…"
                      dir="ltr"
                      className="w-32 font-mono"
                    />
                    <GradientButton
                      gradient="slate"
                      icon={<Send className="h-3.5 w-3.5" />}
                      loading={templateTest.isPending}
                      onClick={() =>
                        templateTest.mutate({
                          templateId: t.id,
                          to: normalizeDigits(testTo).trim(),
                        })
                      }
                    >
                      ارسال آزمایشی
                    </GradientButton>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
                قالبی ثبت نشده.
              </p>
            )}
            {templateTest.data && (
              <p
                className={`text-xs ${templateTest.data.ok ? 'text-emerald-600' : 'text-rose-600'}`}
              >
                {templateTest.data.ok
                  ? 'پیامک آزمایشی ارسال شد — گوشی را ببینید.'
                  : `ناموفق: ${templateTest.data.error ?? 'نامشخص'}`}
              </p>
            )}

            <form
              className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-100 p-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (!detailFor) return;
                createTemplate.mutate(
                  {
                    connectionId: detailFor.id,
                    alias: alias.trim(),
                    provider_template_ref: templateRef.trim(),
                    code_var_name: 'code',
                  },
                  { onSuccess: () => setTemplateRef('') },
                );
              }}
            >
              <Field label="نام" className="min-w-0 flex-1">
                <Input value={alias} onChange={(e) => setAlias(e.target.value)} />
              </Field>
              <Field label="شناسهٔ قالب" className="min-w-0 flex-1">
                <Input
                  value={templateRef}
                  onChange={(e) => setTemplateRef(e.target.value)}
                  dir="ltr"
                  className="font-mono"
                />
              </Field>
              <GradientButton
                type="submit"
                loading={createTemplate.isPending}
                disabled={!templateRef.trim()}
              >
                افزودن قالب
              </GradientButton>
            </form>
            {createTemplate.error && (
              <p className="text-xs text-rose-600">{errorMessage(createTemplate.error)}</p>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-900">رخدادها</h3>
            {events.data?.length ? (
              <ul className="ops-themed-scroll max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-100">
                {events.data.map((ev) => (
                  <li key={ev.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <span dir="ltr" className="font-mono text-xs text-slate-900">
                      {ev.event}
                    </span>
                    <span className="text-xs text-slate-500">{faDateTimeOf(ev.created_at)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
                رخدادی ثبت نشده.
              </p>
            )}
          </section>
        </div>
      </Modal>
    </ListPage>
  );
}
