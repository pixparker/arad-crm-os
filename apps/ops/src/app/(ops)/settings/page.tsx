'use client';

// Platform settings — a TYPED registry, not a key/value bag. Every row knows
// its type, default and constraints, so this screen renders the right input
// and the API refuses an out-of-range write before it lands.
//
// Hot-reloadable: a save drops the cache and publishes an invalidation, so
// behaviour changes without a redeploy. «بازگردانی» deletes the override row
// rather than writing the default back — that is what makes it a true reset.
//
// Grouped by the registering module rather than listed flat: the keys arrive
// from every module at once, and «otp.*» next to «commission.*» in one long
// alphabetical list is a wall nobody reads twice.

import {
  type SettingView,
  errorMessage,
  useResetSetting,
  useSetSetting,
  useSettings,
} from '@/lib/api';
import { faDateTimeOf } from '@/lib/format';
import {
  EmptyState,
  FilterBar,
  GradientButton,
  Input,
  ListPage,
  SelectField,
  StatusBadge,
  Switch,
} from '@arad/ops-kit';
import { Check, RefreshCw, RotateCcw, Settings2 } from 'lucide-react';
import { useState } from 'react';

const asDraft = (value: unknown): string =>
  typeof value === 'string' ? value : JSON.stringify(value ?? '');

function SettingRow({ setting }: { setting: SettingView }) {
  const save = useSetSetting();
  const reset = useResetSetting();
  const [draft, setDraft] = useState<string>(asDraft(setting.value));

  const readOnly = setting.access_level === 'ops_read';
  const dirty = draft !== asDraft(setting.value);

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
    <div className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2">
          <span dir="ltr" className="font-mono text-sm font-medium text-fg">
            {setting.key}
          </span>
          {setting.is_overridden && <StatusBadge tone="violet" label="تغییر داده شده" />}
          {readOnly && <StatusBadge tone="slate" label="فقط‌خواندنی" />}
        </p>
        <p className="mt-1 text-xs leading-5 text-fg-muted">{setting.description}</p>
        <p className="mt-1 text-[11px] text-fg-faint">
          <span dir="ltr">{setting.type}</span> · آخرین تغییر {faDateTimeOf(setting.updated_at)}
        </p>
      </div>

      <div className="flex w-full shrink-0 items-start gap-2 lg:w-96">
        <div className="min-w-0 flex-1">
          {setting.type === 'bool' ? (
            <span className="flex items-center gap-2.5 py-2">
              <Switch
                checked={draft === 'true'}
                onCheckedChange={(next) => setDraft(next ? 'true' : 'false')}
                disabled={readOnly}
                aria-label={setting.key}
              />
              <span className="text-sm text-fg-muted">{draft === 'true' ? 'روشن' : 'خاموش'}</span>
            </span>
          ) : setting.type === 'enum' ? (
            <SelectField
              label=""
              dir="rtl"
              value={draft}
              onValueChange={setDraft}
              disabled={readOnly}
              options={((setting.constraints.values as string[] | undefined) ?? []).map((v) => ({
                value: v,
                label: v,
              }))}
            />
          ) : (
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={readOnly}
              dir="ltr"
              className="font-mono"
            />
          )}
          {save.error && <p className="mt-1 text-xs text-danger">{errorMessage(save.error)}</p>}
        </div>

        <button
          type="button"
          title="ذخیره"
          disabled={readOnly || save.isPending || !dirty}
          onClick={() => {
            try {
              save.mutate({ key: setting.key, value: parsed() });
            } catch {
              // A malformed json draft never reaches the API.
            }
          }}
          className="rounded-lg p-2 text-fg-faint transition hover:bg-success-soft hover:text-success disabled:cursor-not-allowed disabled:opacity-30"
        >
          <Check className="h-4 w-4" />
        </button>
        <button
          type="button"
          title="بازگردانی به پیش‌فرض"
          disabled={readOnly || reset.isPending || !setting.is_overridden}
          onClick={() =>
            reset.mutate(setting.key, { onSuccess: (r) => setDraft(asDraft(r.value)) })
          }
          className="rounded-lg p-2 text-fg-faint transition hover:bg-surface-2 hover:text-fg-muted disabled:cursor-not-allowed disabled:opacity-30"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>
    </div>
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

  const groups = [...new Set(rows.map((s) => s.group))].sort();

  return (
    <ListPage
      title="تنظیمات پلتفرم"
      subtitle="کلیدهایی که هر ماژول ثبت کرده است. تغییرشان بدون استقرار مجدد اعمال می‌شود."
      bare
      filterBar={
        <FilterBar
          hasActiveFilters={filter !== ''}
          onClear={() => setFilter('')}
          resultCount={rows.length}
          totalCount={settings.data?.length ?? 0}
          labels={{
            clear: 'حذف جست‌وجو',
            resultLine: (n, total) =>
              typeof total === 'number' && total !== n
                ? `${n.toLocaleString('fa-IR')} از ${total.toLocaleString('fa-IR')} کلید`
                : `${n.toLocaleString('fa-IR')} کلید`,
          }}
          filters={
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="جست‌وجوی کلید، توضیح یا گروه…"
            />
          }
        />
      }
    >
      {settings.isPending ? (
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
          <div className="h-4 w-1/3 animate-pulse rounded bg-surface-2" />
          <div className="mt-4 space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-surface-2" />
            ))}
          </div>
        </div>
      ) : settings.error ? (
        <div className="rounded-2xl border border-border bg-surface shadow-card">
          <EmptyState
            icon={Settings2}
            headline="تنظیمات بارگیری نشد"
            description={errorMessage(settings.error)}
            cta={
              <GradientButton
                gradient="slate"
                icon={<RefreshCw className="h-4 w-4" />}
                onClick={() => settings.refetch()}
              >
                تلاش دوباره
              </GradientButton>
            }
          />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface shadow-card">
          <EmptyState
            icon={Settings2}
            headline="تنظیمی یافت نشد"
            {...(filter ? { description: 'عبارت دیگری را امتحان کنید.' } : {})}
          />
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <section
              key={group}
              className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card"
            >
              <h2
                dir="ltr"
                className="border-b border-border bg-surface-2 px-5 py-2.5 text-start font-mono text-xs font-semibold text-fg-muted"
              >
                {group}
              </h2>
              <div className="divide-y divide-border">
                {rows
                  .filter((s) => s.group === group)
                  .map((s) => (
                    <SettingRow key={s.key} setting={s} />
                  ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </ListPage>
  );
}
