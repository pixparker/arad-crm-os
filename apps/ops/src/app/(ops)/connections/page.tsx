'use client';

// Connected apps — the demo's step 4: connect sms.ir so a real OTP reaches a
// real phone.
//
// 🔒 Credentials are write-only. The add and rotate forms POST them and never
// read them back; the table shows `cred_hint` («…۱۲۳۴») because that is the
// only credential-derived value that ever leaves the store. The form fields
// themselves come from the adapter (`cred_fields`), so a new provider ships
// its own form with no change here.

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
  Chip,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  FormError,
  Modal,
  PageHeader,
  TableSkeleton,
  btnGhost,
  btnPrimary,
  btnRowAction,
  inputClass,
} from '@arad-crm/ui';
import { type FormEvent, useState } from 'react';

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
        <Field key={f.key} label={f.label} hint={f.hint}>
          <input
            // 🔒 A secret field is a password input and is never pre-filled —
            // there is nothing to pre-fill it from.
            type={f.secret ? 'password' : 'text'}
            autoComplete="off"
            value={values[f.key] ?? ''}
            onChange={(e) => onChange(f.key, e.target.value)}
            placeholder={f.placeholder}
            className={`${inputClass} font-mono`}
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
    <>
      <PageHeader
        title="اتصال‌ها"
        subtitle="سرویس‌های بیرونی پلتفرم. کلیدها فقط نوشتنی‌اند: پس از ذخیره دیگر خوانده نمی‌شوند و تعویض یعنی وارد کردن دوباره."
        actions={
          <button
            type="button"
            className={btnPrimary}
            onClick={() => {
              setAddOpen(true);
              setProviderKey(providers.data?.[0]?.provider ?? '');
            }}
          >
            اتصال جدید
          </button>
        }
      />

      {connections.isPending ? (
        <TableSkeleton />
      ) : connections.error ? (
        <ErrorState
          message={errorMessage(connections.error)}
          onRetry={() => connections.refetch()}
        />
      ) : connections.data.length === 0 ? (
        <EmptyState
          title="اتصالی ثبت نشده"
          hint={
            providers.data && providers.data.length === 0
              ? // Connect only boots when the server has its master key; without
                // one there is no provider to choose and no way to encrypt a
                // credential, so say that instead of showing an empty form.
                'سرویسی در دسترس نیست: کلید اصلی Connect روی سرور تنظیم نشده (CONNECT_MASTER_KEY). تا قبل از آن نمی‌توان اتصالی ثبت کرد.'
              : 'تا وقتی یک اتصال پیامکی فعال نباشد، کد ورود برای هیچ فروشنده‌ای ارسال نمی‌شود.'
          }
        />
      ) : (
        <DataTable
          head={
            <tr>
              <th className="px-3 py-2 text-start font-medium">عنوان</th>
              <th className="px-3 py-2 text-start font-medium">سرویس</th>
              <th className="px-3 py-2 text-start font-medium">وضعیت</th>
              <th className="px-3 py-2 text-start font-medium">توانایی‌ها</th>
              <th className="px-3 py-2 text-start font-medium">کلید</th>
              <th className="px-3 py-2 text-start font-medium">آخرین آزمایش</th>
              <th className="px-3 py-2 text-start font-medium">عملیات</th>
            </tr>
          }
        >
          {connections.data.map((c) => (
            <tr key={c.id}>
              <td className="px-3 py-2 font-medium">{c.label}</td>
              <td className="px-3 py-2 font-mono text-xs">{c.provider}</td>
              <td className="px-3 py-2">
                <Chip
                  tone={
                    c.status === 'active' ? 'success' : c.status === 'error' ? 'danger' : 'neutral'
                  }
                >
                  {c.status === 'active' ? 'فعال' : c.status === 'error' ? 'خطا' : 'غیرفعال'}
                </Chip>
              </td>
              <td className="px-3 py-2 text-xs text-fg-muted">{c.capabilities.join('، ')}</td>
              <td className="px-3 py-2 font-mono text-xs text-fg-muted">{c.cred_hint ?? '—'}</td>
              <td className="px-3 py-2 text-xs">
                {c.health.last_test_result ? (
                  <Chip tone={c.health.last_test_result === 'success' ? 'success' : 'danger'}>
                    {faDateTimeOf(c.health.last_test_at ?? null)}
                  </Chip>
                ) : (
                  <span className="text-fg-faint">آزمایش نشده</span>
                )}
              </td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    className={btnRowAction}
                    disabled={test.isPending}
                    onClick={() => test.mutate({ id: c.id })}
                  >
                    آزمایش
                  </button>
                  <button
                    type="button"
                    className={btnRowAction}
                    onClick={() => {
                      setRotateFor(c);
                      setRotateCredsValues({});
                    }}
                  >
                    تعویض کلید
                  </button>
                  <button type="button" className={btnRowAction} onClick={() => setDetailFor(c)}>
                    قالب‌ها و رخدادها
                  </button>
                  <button
                    type="button"
                    className={btnRowAction}
                    disabled={setStatus.isPending}
                    onClick={() =>
                      setStatus.mutate({
                        id: c.id,
                        status: c.status === 'active' ? 'disabled' : 'active',
                      })
                    }
                  >
                    {c.status === 'active' ? 'غیرفعال' : 'فعال'}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </DataTable>
      )}

      {test.data ? (
        <p className={`mt-3 text-sm ${test.data.ok ? 'text-success' : 'text-danger'}`}>
          {test.data.ok
            ? `ارسال آزمایشی موفق بود (${test.data.latency_ms}ms)`
            : `ارسال آزمایشی ناموفق: ${test.data.error ?? 'نامشخص'}`}
        </p>
      ) : null}
      <FormError>{test.error ? errorMessage(test.error) : null}</FormError>

      {/* ── add ─────────────────────────────────────────────────────────── */}
      <Modal open={addOpen} title="اتصال جدید" onClose={() => setAddOpen(false)}>
        <form onSubmit={submitCreate} className="space-y-3">
          <Field label="سرویس">
            <select
              value={providerKey}
              onChange={(e) => {
                setProviderKey(e.target.value);
                setCreds({});
              }}
              className={inputClass}
            >
              {providers.data?.map((p) => (
                <option key={p.provider} value={p.provider}>
                  {p.provider}
                </option>
              ))}
            </select>
          </Field>
          <Field label="عنوان" hint="برای تشخیص در فهرست — مثلاً «پیامک اصلی».">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className={inputClass}
            />
          </Field>
          {selectedProvider ? (
            <CredFields
              provider={selectedProvider}
              values={creds}
              onChange={(k, v) => setCreds((prev) => ({ ...prev, [k]: v }))}
            />
          ) : null}
          <FormError>{create.error ? errorMessage(create.error) : null}</FormError>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className={btnGhost} onClick={() => setAddOpen(false)}>
              انصراف
            </button>
            <button
              type="submit"
              className={btnPrimary}
              disabled={create.isPending || !label.trim() || !selectedProvider}
            >
              {create.isPending ? 'در حال ذخیره…' : 'ذخیره'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── rotate ──────────────────────────────────────────────────────── */}
      <Modal
        open={rotateFor !== null}
        title={`تعویض کلید ${rotateFor?.label ?? ''}`}
        onClose={() => setRotateFor(null)}
      >
        <form onSubmit={submitRotate} className="space-y-3">
          <p className="text-xs text-fg-muted">
            کلید فعلی خوانده نمی‌شود؛ مقدار جدید را کامل وارد کنید. کلید قبلی بلافاصله بی‌اثر می‌شود.
          </p>
          {rotateProvider ? (
            <CredFields
              provider={rotateProvider}
              values={rotateCredsValues}
              onChange={(k, v) => setRotateCredsValues((prev) => ({ ...prev, [k]: v }))}
            />
          ) : null}
          <FormError>{rotate.error ? errorMessage(rotate.error) : null}</FormError>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className={btnGhost} onClick={() => setRotateFor(null)}>
              انصراف
            </button>
            <button type="submit" className={btnPrimary} disabled={rotate.isPending}>
              {rotate.isPending ? 'در حال ذخیره…' : 'تعویض'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── templates + events ──────────────────────────────────────────── */}
      <Modal
        open={detailFor !== null}
        title={`${detailFor?.label ?? ''} — قالب‌ها و رخدادها`}
        onClose={() => setDetailFor(null)}
      >
        <section className="space-y-3">
          <h3 className="text-sm font-bold">قالب‌های پیامک</h3>
          <p className="text-xs text-fg-muted">
            سرویس‌های OTP ابری با شناسهٔ قالبِ ثبت‌شده در پنل خودشان کار می‌کنند؛ متن آزاد پذیرفته
            نمی‌شود.
          </p>
          {templates.data?.length ? (
            <ul className="space-y-1 text-xs">
              {templates.data.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-2 rounded-sm border border-border px-2 py-1"
                >
                  <span>
                    <span className="font-medium">{t.alias}</span>{' '}
                    <span className="font-mono text-fg-muted">#{t.provider_template_ref}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <input
                      value={testTo}
                      onChange={(e) => setTestTo(e.target.value)}
                      placeholder="۰۹…"
                      className="w-28 rounded-sm border border-border bg-surface px-2 py-1 font-mono text-xs"
                    />
                    <button
                      type="button"
                      className={btnRowAction}
                      disabled={templateTest.isPending}
                      onClick={() =>
                        templateTest.mutate({
                          templateId: t.id,
                          to: normalizeDigits(testTo).trim(),
                        })
                      }
                    >
                      ارسال آزمایشی
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-fg-faint">قالبی ثبت نشده.</p>
          )}
          {templateTest.data ? (
            <p className={`text-xs ${templateTest.data.ok ? 'text-success' : 'text-danger'}`}>
              {templateTest.data.ok
                ? 'پیامک آزمایشی ارسال شد — گوشی را ببینید.'
                : `ناموفق: ${templateTest.data.error ?? 'نامشخص'}`}
            </p>
          ) : null}

          <form
            className="flex flex-wrap items-end gap-2"
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
            <label className="text-xs">
              <span className="block text-fg-muted">نام</span>
              <input
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                className="w-32 rounded-sm border border-border bg-surface px-2 py-1 text-xs"
              />
            </label>
            <label className="text-xs">
              <span className="block text-fg-muted">شناسهٔ قالب</span>
              <input
                value={templateRef}
                onChange={(e) => setTemplateRef(e.target.value)}
                className="w-32 rounded-sm border border-border bg-surface px-2 py-1 font-mono text-xs"
              />
            </label>
            <button
              type="submit"
              className={btnRowAction}
              disabled={createTemplate.isPending || !templateRef.trim()}
            >
              افزودن قالب
            </button>
          </form>
          <FormError>{createTemplate.error ? errorMessage(createTemplate.error) : null}</FormError>

          <h3 className="pt-2 text-sm font-bold">رخدادها</h3>
          <ul className="max-h-56 space-y-1 overflow-y-auto text-xs">
            {events.data?.map((ev) => (
              <li key={ev.id} className="rounded-sm border border-border px-2 py-1">
                <span className="font-mono">{ev.event}</span>
                <span className="ms-2 text-fg-muted">{faDateTimeOf(ev.created_at)}</span>
              </li>
            )) ?? <li className="text-fg-faint">—</li>}
          </ul>
        </section>
      </Modal>
    </>
  );
}
