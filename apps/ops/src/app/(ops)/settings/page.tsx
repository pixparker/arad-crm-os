'use client';

// Platform settings — a TYPED registry, not a key/value bag. Every row knows
// its type, default and constraints, so this screen renders the right input
// and the API refuses an out-of-range write before it lands.
//
// Hot-reloadable: a save drops the cache and publishes an invalidation, so
// behaviour changes without a redeploy. «بازگردانی» deletes the override row
// rather than writing the default back — that is what makes it a true reset.

import {
  type SettingView,
  errorMessage,
  useResetSetting,
  useSetSetting,
  useSettings,
} from '@/lib/api';
import { faDateTimeOf } from '@/lib/format';
import {
  Chip,
  EmptyState,
  ErrorState,
  FormError,
  PageHeader,
  TableSkeleton,
  btnRowAction,
  inputClass,
} from '@arad-crm/ui';
import { useState } from 'react';

function SettingRow({ setting }: { setting: SettingView }) {
  const save = useSetSetting();
  const reset = useResetSetting();
  const [draft, setDraft] = useState<string>(
    typeof setting.value === 'string' ? setting.value : JSON.stringify(setting.value ?? ''),
  );

  const readOnly = setting.access_level === 'ops_read';

  const parsed = (): unknown => {
    switch (setting.type) {
      case 'int':
      case 'float':
        return Number(draft);
      case 'bool':
        return draft === 'true';
      case 'string[]':
        return draft
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      case 'json':
        return JSON.parse(draft) as unknown;
      default:
        return draft;
    }
  };

  return (
    <tr>
      <td className="px-3 py-2 align-top">
        <p className="font-mono text-xs">{setting.key}</p>
        <p className="mt-0.5 text-xs text-fg-muted">{setting.description}</p>
        <p className="mt-0.5 text-xs text-fg-faint">
          {setting.group} · {setting.type}
          {setting.is_overridden ? (
            <span className="ms-2">
              <Chip tone="primary">تغییر داده شده</Chip>
            </span>
          ) : null}
        </p>
      </td>
      <td className="px-3 py-2 align-top">
        {setting.type === 'bool' ? (
          <select
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className={inputClass}
            disabled={readOnly}
          >
            <option value="true">بله</option>
            <option value="false">خیر</option>
          </select>
        ) : setting.type === 'enum' ? (
          <select
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className={inputClass}
            disabled={readOnly}
          >
            {((setting.constraints.values as string[] | undefined) ?? []).map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        ) : (
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className={`${inputClass} font-mono`}
            disabled={readOnly}
          />
        )}
        <FormError>{save.error ? errorMessage(save.error) : null}</FormError>
      </td>
      <td className="px-3 py-2 align-top text-xs text-fg-muted">
        {faDateTimeOf(setting.updated_at)}
      </td>
      <td className="px-3 py-2 align-top">
        <div className="flex gap-1">
          <button
            type="button"
            className={btnRowAction}
            disabled={readOnly || save.isPending}
            onClick={() => {
              try {
                save.mutate({ key: setting.key, value: parsed() });
              } catch {
                // A malformed json draft never reaches the API.
              }
            }}
          >
            ذخیره
          </button>
          <button
            type="button"
            className={btnRowAction}
            disabled={readOnly || reset.isPending || !setting.is_overridden}
            onClick={() =>
              reset.mutate(setting.key, {
                onSuccess: (r) =>
                  setDraft(typeof r.value === 'string' ? r.value : JSON.stringify(r.value ?? '')),
              })
            }
          >
            بازگردانی
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function SettingsPage() {
  const settings = useSettings();
  const [filter, setFilter] = useState('');

  const rows = (settings.data ?? []).filter(
    (s) =>
      !filter ||
      s.key.includes(filter) ||
      s.description.includes(filter) ||
      s.group.includes(filter),
  );

  return (
    <>
      <PageHeader
        title="تنظیمات پلتفرم"
        subtitle="کلیدهایی که هر ماژول ثبت کرده است. تغییرشان بدون استقرار مجدد اعمال می‌شود."
      />

      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="جست‌وجو…"
        className={`${inputClass} mb-3 max-w-xs`}
      />

      {settings.isPending ? (
        <TableSkeleton />
      ) : settings.error ? (
        <ErrorState message={errorMessage(settings.error)} onRetry={() => settings.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState title="تنظیمی یافت نشد" />
      ) : (
        <div className="overflow-x-auto rounded-md border border-border bg-surface shadow-card">
          <table className="w-full min-w-[720px] text-start text-sm">
            <thead className="border-b border-border bg-surface-2 text-xs text-fg-muted">
              <tr>
                <th className="px-3 py-2 text-start font-medium">کلید</th>
                <th className="px-3 py-2 text-start font-medium">مقدار</th>
                <th className="px-3 py-2 text-start font-medium">آخرین تغییر</th>
                <th className="px-3 py-2 text-start font-medium">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((s) => (
                <SettingRow key={s.key} setting={s} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
