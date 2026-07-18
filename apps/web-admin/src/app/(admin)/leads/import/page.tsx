'use client';

// وارد کردن از فایل — CSV/شیت paste → client-side parse → preview → import.
// مستقل از منبع است: نشان/بلد/گوگل‌مپ بعداً به همین مسیر می‌ریزند؛ فعلاً CSV.

import { AccountPreviewModal } from '@/components/account-preview';
import {
  Chip,
  ErrorState,
  FormError,
  PageHeader,
  Skeleton,
  btnGhost,
  btnPrimary,
  inputClass,
} from '@/components/ui';
import {
  type ImportResult,
  type ImportRow,
  useImportLeads,
  useMe,
  useTerritories,
} from '@/lib/api';
import { faNumber, normalizeDigits } from '@/lib/format';
import Link from 'next/link';
import { useMemo, useState } from 'react';

const HEADER_NAMES = ['name', 'phone', 'region', 'address', 'type', 'rating'] as const;
const COLUMN_ORDER = HEADER_NAMES;

const DUPLICATE_REASON_FA: Record<string, string> = {
  duplicate_in_batch: 'تکراری در فایل',
  phone_exists: 'شماره از قبل موجود',
};

interface ParseOutcome {
  rows: ImportRow[];
  invalidLines: number[]; // 1-based line numbers in the pasted text
  hadHeader: boolean;
}

function parseCsv(raw: string): ParseOutcome {
  const text = normalizeDigits(raw).replace(/\r/g, '');
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return { rows: [], invalidLines: [], hadHeader: false };

  const firstLine = lines[0] ?? '';
  const delimiter = firstLine.includes('\t') ? '\t' : ',';

  const split = (line: string) => line.split(delimiter).map((c) => c.trim());

  // header autodetect: first line made of known column names
  const firstTokens = split(firstLine).map((t) => t.toLowerCase());
  const knownHits = firstTokens.filter((t) =>
    (HEADER_NAMES as readonly string[]).includes(t),
  ).length;
  const hadHeader = firstTokens[0] === 'name' || knownHits >= 2;

  // column index → field (by header name when present, else positional)
  const columnFor = (i: number): (typeof COLUMN_ORDER)[number] | undefined =>
    hadHeader
      ? (COLUMN_ORDER as readonly string[]).includes(firstTokens[i] ?? '')
        ? (firstTokens[i] as (typeof COLUMN_ORDER)[number])
        : undefined
      : COLUMN_ORDER[i];

  const rows: ImportRow[] = [];
  const invalidLines: number[] = [];
  const dataLines = hadHeader ? lines.slice(1) : lines;
  const offset = hadHeader ? 2 : 1;

  dataLines.forEach((line, idx) => {
    const cells = split(line);
    const record: Partial<Record<(typeof COLUMN_ORDER)[number], string>> = {};
    cells.forEach((cell, i) => {
      const col = columnFor(i);
      if (col && cell) record[col] = cell;
    });
    const name = record.name ?? '';
    if (name.length < 2) {
      invalidLines.push(idx + offset);
      return;
    }
    rows.push({
      business_name: name,
      ...(record.phone ? { phone: record.phone } : {}),
      ...(record.region ? { region_text: record.region } : {}),
      ...(record.address ? { address_text: record.address } : {}),
      ...(record.type ? { business_type: record.type } : {}),
      ...(record.rating ? { external_rating: record.rating } : {}),
    });
  });

  return { rows, invalidLines, hadHeader };
}

function ResultPanel({
  result,
  sentRows,
  onReset,
}: {
  result: ImportResult;
  sentRows: ImportRow[];
  onReset: () => void;
}) {
  const [previewAccountId, setPreviewAccountId] = useState<string | null>(null);

  return (
    <section className="space-y-4 rounded-md border border-border bg-surface shadow-card p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold">نتیجهٔ وارد کردن</h2>
          <p className="mt-1 text-sm">
            <span className="font-bold text-success">{faNumber(result.imported)}</span> سرنخ وارد شد
            {result.duplicates.length > 0 ? (
              <>
                {' '}
                ·{' '}
                <span className="font-bold text-warning">{faNumber(result.duplicates.length)}</span>{' '}
                تکراری رد شد
              </>
            ) : null}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" className={btnGhost} onClick={onReset}>
            وارد کردن فایل دیگر
          </button>
          <Link href="/leads" className={btnPrimary}>
            برو به تخصیص سرنخ
          </Link>
        </div>
      </div>

      {result.duplicates.length > 0 ? (
        <div className="overflow-x-auto rounded-sm border border-border">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2 text-right text-xs text-fg-muted">
                <th className="px-3 py-2 font-medium">ردیف</th>
                <th className="px-3 py-2 font-medium">کسب‌وکار</th>
                <th className="px-3 py-2 font-medium">دلیل</th>
                <th className="px-3 py-2 font-medium">پروندهٔ موجود</th>
              </tr>
            </thead>
            <tbody>
              {result.duplicates.map((d) => (
                <tr
                  key={`${d.row_index}-${d.existing_account_id}`}
                  className="border-b border-border last:border-b-0"
                >
                  <td className="px-3 py-2 tabular-nums">{faNumber(d.row_index + 1)}</td>
                  <td className="px-3 py-2">{sentRows[d.row_index]?.business_name ?? '—'}</td>
                  <td className="px-3 py-2">
                    <Chip tone="warning">{DUPLICATE_REASON_FA[d.reason] ?? d.reason}</Chip>
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="text-xs text-primary underline-offset-2 hover:underline"
                      onClick={() => setPreviewAccountId(d.existing_account_id)}
                    >
                      مشاهدهٔ پرونده
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {previewAccountId ? (
        <AccountPreviewModal
          accountId={previewAccountId}
          onClose={() => setPreviewAccountId(null)}
        />
      ) : null}
    </section>
  );
}

export default function ImportPage() {
  const me = useMe();
  const territories = useTerritories();
  const importLeads = useImportLeads();
  const [text, setText] = useState('');
  const [territoryId, setTerritoryId] = useState('');
  const [sentRows, setSentRows] = useState<ImportRow[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);

  const canImport =
    me.data?.membership.role === 'sales_manager' || me.data?.membership.role === 'owner_admin';

  const parsed = useMemo(() => parseCsv(text), [text]);

  const submit = () => {
    if (parsed.rows.length === 0) return;
    const rows = parsed.rows;
    importLeads.mutate(
      { rows, ...(territoryId ? { default_territory_id: territoryId } : {}) },
      {
        onSuccess: (res) => {
          setSentRows(rows);
          setResult(res);
          setText('');
        },
      },
    );
  };

  return (
    <div className="max-w-4xl space-y-4">
      <PageHeader
        title="وارد کردن از فایل"
        subtitle="فهرست کافه‌ها را از شیت کپی و این‌جا بچسبانید — مستقل از منبع است؛ نشان/بلد/گوگل‌مپ بعداً، فعلاً CSV."
      />

      {result ? (
        <ResultPanel
          result={result}
          sentRows={sentRows}
          onReset={() => {
            setResult(null);
            setSentRows([]);
            importLeads.reset();
          }}
        />
      ) : (
        <section className="space-y-4 rounded-md border border-border bg-surface shadow-card p-5">
          <div className="space-y-1.5">
            <label htmlFor="csv" className="block text-sm font-medium">
              محتوای فایل (CSV یا کپی از شیت)
            </label>
            <p className="text-xs text-fg-muted">
              ستون‌ها به ترتیب: <span dir="ltr">name, phone, region, address, type, rating</span> —
              سطر عنوان اختیاری است و خودکار تشخیص داده می‌شود.
            </p>
            <textarea
              id="csv"
              rows={10}
              dir="auto"
              className={`${inputClass} min-h-48 font-mono text-xs leading-6`}
              placeholder={
                'کافه رز,09121234567,ونک,خیابان ونک پ ۱۲,کافه,4.6\nکافه لمیز,09129876543,جردن'
              }
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-56 space-y-1.5">
              <label htmlFor="territory" className="block text-sm font-medium">
                منطقهٔ پیش‌فرض (اختیاری)
              </label>
              <select
                id="territory"
                className={inputClass}
                value={territoryId}
                onChange={(e) => setTerritoryId(e.target.value)}
                disabled={territories.isPending}
              >
                <option value="">بدون منطقه</option>
                {(territories.data?.items ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex-1" />

            <div className="text-left text-xs text-fg-muted">
              {text.trim().length === 0 ? (
                <p>هنوز چیزی چسبانده نشده</p>
              ) : (
                <>
                  <p>
                    <span className="font-bold text-fg">{faNumber(parsed.rows.length)}</span> ردیف
                    آمادهٔ وارد کردن
                    {parsed.hadHeader ? ' (سطر عنوان حذف شد)' : ''}
                  </p>
                  {parsed.invalidLines.length > 0 ? (
                    <p className="mt-0.5 text-warning">
                      {faNumber(parsed.invalidLines.length)} سطر بدون نام معتبر رد می‌شود (سطرهای{' '}
                      {parsed.invalidLines.slice(0, 5).map(faNumber).join('، ')}
                      {parsed.invalidLines.length > 5 ? '…' : ''})
                    </p>
                  ) : null}
                </>
              )}
            </div>

            <button
              type="button"
              className={btnPrimary}
              disabled={parsed.rows.length === 0 || importLeads.isPending || !canImport}
              onClick={submit}
            >
              {importLeads.isPending
                ? 'در حال وارد کردن…'
                : `وارد کردن ${parsed.rows.length > 0 ? faNumber(parsed.rows.length) : ''} سرنخ`}
            </button>
          </div>

          {!canImport && me.data ? (
            <FormError>فقط مدیر فروش یا مالک می‌تواند سرنخ وارد کند.</FormError>
          ) : null}
          <FormError>{importLeads.error ? importLeads.error.message : null}</FormError>
          {territories.error ? (
            <ErrorState error={territories.error} onRetry={() => void territories.refetch()} />
          ) : null}
          {territories.isPending ? <Skeleton className="hidden" /> : null}
        </section>
      )}

      <p className="text-xs text-fg-muted">
        تشخیص تکراری با شمارهٔ تلفن انجام می‌شود؛ ردیف‌های تکراری با دلیل و پیوند به پروندهٔ موجود گزارش
        می‌شوند.
      </p>
    </div>
  );
}
