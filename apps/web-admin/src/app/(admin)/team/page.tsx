'use client';

// «تیم فروش» — roster + add-seller. Sellers are invite-only (a phantom user
// until they OTP-claim); each carries a contract type (full/part-time) and a
// territory that restricts what they can pick and see.

import { Modal } from '@/components/modal';
import {
  Chip,
  EmptyState,
  ErrorState,
  FormError,
  PageHeader,
  TableSkeleton,
  btnGhost,
  btnPrimary,
  inputClass,
} from '@/components/ui';
import { useCreateMember, useCreateTerritory, useTeam, useTerritories } from '@/lib/api';
import {
  CONTRACT_LABELS,
  MEMBER_STATUS_LABELS,
  MEMBER_STATUS_TONES,
  ROLE_LABELS,
  normalizeDigits,
} from '@/lib/format';
import type { Role } from '@arad-crm/api-contracts';
import { ApiError } from '@arad-crm/web-shared';
import { useState } from 'react';

const ADDABLE_ROLES: Role[] = ['visitor_seller', 'followup_seller', 'sales_manager', 'finance'];

export default function TeamPage() {
  const team = useTeam();
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-4">
      <PageHeader
        title="تیم فروش"
        subtitle="کاربران فروش جدا از کاربران میزرو هستند — فروشندهٔ میدانی فقط پایپلاین خودش را می‌بیند."
        actions={
          <button type="button" className={btnPrimary} onClick={() => setAdding(true)}>
            + افزودن فروشنده
          </button>
        }
      />

      <div className="overflow-hidden rounded-md border border-border bg-surface shadow-card">
        {team.isPending ? (
          <TableSkeleton />
        ) : team.isError ? (
          <ErrorState error={team.error} onRetry={() => void team.refetch()} />
        ) : team.data.items.length === 0 ? (
          <EmptyState title="هنوز عضوی اضافه نشده" hint="با دکمهٔ «افزودن فروشنده» شروع کن." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-start text-sm">
              <thead className="border-b border-border bg-surface-2 text-xs text-fg-muted">
                <tr>
                  <th className="px-3 py-2 text-start font-medium">نام</th>
                  <th className="px-3 py-2 text-start font-medium">شماره</th>
                  <th className="px-3 py-2 text-start font-medium">نقش</th>
                  <th className="px-3 py-2 text-start font-medium">قرارداد</th>
                  <th className="px-3 py-2 text-start font-medium">منطقه</th>
                  <th className="px-3 py-2 text-start font-medium">وضعیت</th>
                </tr>
              </thead>
              <tbody>
                {team.data.items.map((m) => (
                  <tr key={m.user_id} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-2 font-medium">{m.display_name || '—'}</td>
                    <td className="px-3 py-2 text-fg-muted" dir="ltr">
                      {m.phone}
                    </td>
                    <td className="px-3 py-2">{ROLE_LABELS[m.role]}</td>
                    <td className="px-3 py-2 text-fg-muted">{CONTRACT_LABELS[m.contract_type]}</td>
                    <td className="px-3 py-2 text-fg-muted">{m.territory_name ?? '—'}</td>
                    <td className="px-3 py-2">
                      <Chip tone={MEMBER_STATUS_TONES[m.status]}>
                        {MEMBER_STATUS_LABELS[m.status]}
                      </Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {adding ? <AddSellerModal onClose={() => setAdding(false)} /> : null}
    </div>
  );
}

function AddSellerModal({ onClose }: { onClose: () => void }) {
  const territories = useTerritories();
  const createMember = useCreateMember();
  const createTerritory = useCreateTerritory();

  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('visitor_seller');
  const [contract, setContract] = useState<'full_time' | 'part_time'>('full_time');
  const [territoryId, setTerritoryId] = useState('');
  const [newTerritory, setNewTerritory] = useState('');
  const [error, setError] = useState('');

  const submit = () => {
    setError('');
    const normalized = normalizeDigits(phone.trim()).replace(/[^0-9+]/g, '');
    if (normalized.length < 10) return setError('شمارهٔ موبایل معتبر وارد کن');
    if (name.trim().length < 2) return setError('نام را وارد کن');
    createMember.mutate(
      {
        phone: normalized,
        display_name: name.trim(),
        role,
        contract_type: contract,
        ...(territoryId ? { territory_id: territoryId } : {}),
      },
      {
        onSuccess: onClose,
        onError: (err) => setError(err instanceof ApiError ? err.message : 'افزودن عضو ناموفق بود'),
      },
    );
  };

  const addTerritory = () => {
    const nm = newTerritory.trim();
    if (nm.length < 1) return;
    createTerritory.mutate(
      { name: nm },
      {
        onSuccess: (t) => {
          setTerritoryId(t.id);
          setNewTerritory('');
        },
      },
    );
  };

  return (
    <Modal title="افزودن فروشنده" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label htmlFor="m-phone" className="mb-1 block text-sm font-medium">
            شمارهٔ موبایل
          </label>
          <input
            id="m-phone"
            dir="ltr"
            className={inputClass}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="۰۹۱۲۱۲۳۴۵۶۷"
          />
        </div>
        <div>
          <label htmlFor="m-name" className="mb-1 block text-sm font-medium">
            نام
          </label>
          <input
            id="m-name"
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="m-role" className="mb-1 block text-sm font-medium">
            نقش
          </label>
          <select
            id="m-role"
            className={inputClass}
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
          >
            {ADDABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className="mb-1 block text-sm font-medium">نوع قرارداد</span>
          <div className="flex gap-4 text-sm">
            {(['full_time', 'part_time'] as const).map((c) => (
              <label key={c} className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="contract"
                  checked={contract === c}
                  onChange={() => setContract(c)}
                />
                {CONTRACT_LABELS[c]}
              </label>
            ))}
          </div>
        </div>
        <div>
          <label htmlFor="m-terr" className="mb-1 block text-sm font-medium">
            منطقه
          </label>
          <select
            id="m-terr"
            className={inputClass}
            value={territoryId}
            onChange={(e) => setTerritoryId(e.target.value)}
          >
            <option value="">بدون منطقه</option>
            {territories.data?.items.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <div className="mt-2 flex gap-2">
            <input
              className={inputClass}
              value={newTerritory}
              onChange={(e) => setNewTerritory(e.target.value)}
              placeholder="یا منطقهٔ جدید بساز…"
            />
            <button
              type="button"
              className={btnGhost}
              disabled={createTerritory.isPending || newTerritory.trim().length < 1}
              onClick={addTerritory}
            >
              افزودن
            </button>
          </div>
        </div>

        <FormError>{error}</FormError>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className={btnGhost} onClick={onClose}>
            انصراف
          </button>
          <button
            type="button"
            className={btnPrimary}
            disabled={createMember.isPending}
            onClick={submit}
          >
            {createMember.isPending ? 'در حال افزودن…' : 'افزودن'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
