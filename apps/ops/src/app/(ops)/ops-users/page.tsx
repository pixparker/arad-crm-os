'use client';

// Ops users — a SEPARATE screen because it is a separate identity axis
// (ADR-014 §1). Granting «پشتیبانی» here gives no access to any workspace, and
// an owner_admin membership grants nothing here. super_admin only.

import {
  errorMessage,
  useGrantOpsRole,
  useOpsMe,
  useOpsStaff,
  useRevokeOpsRole,
  useUsers,
} from '@/lib/api';
import { OPS_ROLES, OPS_ROLE_LABELS, faDateOf } from '@/lib/format';
import type { OpsRole } from '@arad-crm/api-contracts';
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

export default function OpsUsersPage() {
  const me = useOpsMe();
  const staff = useOpsStaff();
  const users = useUsers();
  const grant = useGrantOpsRole();
  const revoke = useRevokeOpsRole();

  const [grantOpen, setGrantOpen] = useState(false);
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<OpsRole>('support');

  const isSuperAdmin = me.data?.roles.includes('super_admin') ?? false;

  const submitGrant = (e: FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    grant.mutate({ user_id: userId, role }, { onSuccess: () => setGrantOpen(false) });
  };

  if (!isSuperAdmin) {
    return (
      <>
        <PageHeader title="اپراتورها" />
        <EmptyState
          title="فقط مدیر ارشد"
          hint="دادن یا گرفتن نقش اپراتوری، دسترسی به دادهٔ همهٔ کسب‌وکارهاست؛ تنها مدیر ارشد این کار را انجام می‌دهد."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="اپراتورها"
        subtitle="محور هویت اپراتوری، جدا از عضویت در کسب‌وکارهاست: این نقش‌ها هیچ فضای کاری‌ای را باز نمی‌کنند."
        actions={
          <button type="button" className={btnPrimary} onClick={() => setGrantOpen(true)}>
            دادن نقش
          </button>
        }
      />

      {staff.isPending ? (
        <TableSkeleton />
      ) : staff.error ? (
        <ErrorState message={errorMessage(staff.error)} onRetry={() => staff.refetch()} />
      ) : staff.data.length === 0 ? (
        <EmptyState title="اپراتوری ثبت نشده" />
      ) : (
        <DataTable
          head={
            <tr>
              <th className="px-3 py-2 text-start font-medium">شماره</th>
              <th className="px-3 py-2 text-start font-medium">نام</th>
              <th className="px-3 py-2 text-start font-medium">نقش‌ها</th>
              <th className="px-3 py-2 text-start font-medium">تاریخ</th>
              <th className="px-3 py-2 text-start font-medium">عملیات</th>
            </tr>
          }
        >
          {staff.data.map((s) => (
            <tr key={s.id}>
              <td className="px-3 py-2 font-mono text-xs">{s.phone}</td>
              <td className="px-3 py-2">{s.display_name || '—'}</td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap gap-1">
                  {s.roles.map((r) => (
                    <Chip key={r} tone={r === 'super_admin' ? 'primary' : 'neutral'}>
                      {OPS_ROLE_LABELS[r]}
                    </Chip>
                  ))}
                </div>
              </td>
              <td className="px-3 py-2 text-xs text-fg-muted">{faDateOf(s.created_at)}</td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap gap-1">
                  {s.roles.map((r) => (
                    <button
                      key={r}
                      type="button"
                      className={btnRowAction}
                      disabled={revoke.isPending}
                      onClick={() => revoke.mutate({ user_id: s.id, role: r })}
                    >
                      حذف {OPS_ROLE_LABELS[r]}
                    </button>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </DataTable>
      )}

      <FormError>{revoke.error ? errorMessage(revoke.error) : null}</FormError>

      <Modal open={grantOpen} title="دادن نقش اپراتوری" onClose={() => setGrantOpen(false)}>
        <form onSubmit={submitGrant} className="space-y-3">
          <Field label="کاربر" hint="کاربر باید از قبل در «کاربران» ساخته شده باشد.">
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className={inputClass}
            >
              <option value="">— انتخاب کنید —</option>
              {users.data?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.phone} {u.display_name ? `— ${u.display_name}` : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="نقش">
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as OpsRole)}
              className={inputClass}
            >
              {OPS_ROLES.map((r) => (
                <option key={r} value={r}>
                  {OPS_ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </Field>
          <FormError>{grant.error ? errorMessage(grant.error) : null}</FormError>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className={btnGhost} onClick={() => setGrantOpen(false)}>
              انصراف
            </button>
            <button type="submit" className={btnPrimary} disabled={grant.isPending || !userId}>
              {grant.isPending ? 'در حال ذخیره…' : 'دادن نقش'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
