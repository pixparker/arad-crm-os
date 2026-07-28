'use client';

// Users & membership — the demo's step 3, second half: create 09163349938 and
// assign them to Mizro. A user may belong to several businesses; the seller
// app resolves which one they are working in at login (E01-F06).

import {
  type PlatformUser,
  errorMessage,
  useAssignMembership,
  useBusinesses,
  useCreateUser,
  useRemoveMembership,
  useSetUserStatus,
  useUsers,
} from '@/lib/api';
import { TENANT_ROLES, TENANT_ROLE_LABELS, faDateTimeOf, normalizeDigits } from '@/lib/format';
import type { Role } from '@arad-crm/api-contracts';
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

const MOBILE_RE = /^09[0-9]{9}$/;

export default function UsersPage() {
  const [orgFilter, setOrgFilter] = useState<string>('');
  const users = useUsers(orgFilter || undefined);
  const businesses = useBusinesses();
  const create = useCreateUser();
  const assign = useAssignMembership();
  const remove = useRemoveMembership();
  const setStatus = useSetUserStatus();

  const [addOpen, setAddOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [displayName, setDisplayName] = useState('');

  const [assignFor, setAssignFor] = useState<PlatformUser | null>(null);
  const [assignOrg, setAssignOrg] = useState('');
  const [assignRole, setAssignRole] = useState<Role>('visitor_seller');

  const normalizedPhone = normalizeDigits(phone).replace(/\s/g, '');
  const phoneValid = MOBILE_RE.test(normalizedPhone);

  const submitCreate = (e: FormEvent) => {
    e.preventDefault();
    create.mutate(
      { phone: normalizedPhone, display_name: displayName.trim() },
      {
        onSuccess: (user) => {
          setAddOpen(false);
          setPhone('');
          setDisplayName('');
          // Creating a user who belongs to nothing is a dead end — go straight
          // to the assignment they will need anyway.
          setAssignFor(user);
          setAssignOrg(businesses.data?.[0]?.id ?? '');
        },
      },
    );
  };

  const submitAssign = (e: FormEvent) => {
    e.preventDefault();
    if (!assignFor || !assignOrg) return;
    assign.mutate(
      { userId: assignFor.id, organization_id: assignOrg, role: assignRole },
      { onSuccess: () => setAssignFor(null) },
    );
  };

  return (
    <>
      <PageHeader
        title="کاربران"
        subtitle="ساخت کاربر با شمارهٔ موبایل و اتصال او به یک یا چند کسب‌وکار. ورود فقط با دعوت است."
        actions={
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className={btnPrimary}
            disabled={(businesses.data?.length ?? 0) === 0}
          >
            کاربر جدید
          </button>
        }
      />

      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs text-fg-muted">کسب‌وکار:</span>
        <select
          value={orgFilter}
          onChange={(e) => setOrgFilter(e.target.value)}
          className={`${inputClass} w-auto`}
        >
          <option value="">همه</option>
          {businesses.data?.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      {users.isPending ? (
        <TableSkeleton />
      ) : users.error ? (
        <ErrorState message={errorMessage(users.error)} onRetry={() => users.refetch()} />
      ) : users.data.length === 0 ? (
        <EmptyState
          title="کاربری وجود ندارد"
          hint="کاربر را با شمارهٔ موبایل بسازید؛ بعد از ساخت، به کسب‌وکار وصلش کنید."
        />
      ) : (
        <DataTable
          head={
            <tr>
              <th className="px-3 py-2 text-start font-medium">شماره</th>
              <th className="px-3 py-2 text-start font-medium">نام</th>
              <th className="px-3 py-2 text-start font-medium">وضعیت</th>
              <th className="px-3 py-2 text-start font-medium">کسب‌وکارها</th>
              <th className="px-3 py-2 text-start font-medium">آخرین ورود</th>
              <th className="px-3 py-2 text-start font-medium">عملیات</th>
            </tr>
          }
        >
          {users.data.map((u) => (
            <tr key={u.id}>
              <td className="px-3 py-2 font-mono text-xs">{u.phone}</td>
              <td className="px-3 py-2">
                {u.display_name || <span className="text-fg-faint">—</span>}
                {u.is_ops ? (
                  <span className="ms-2">
                    <Chip tone="primary">اپراتور</Chip>
                  </span>
                ) : null}
              </td>
              <td className="px-3 py-2">
                <Chip
                  tone={
                    u.status === 'active'
                      ? 'success'
                      : u.status === 'invited'
                        ? 'neutral'
                        : 'danger'
                  }
                >
                  {u.status === 'active' ? 'فعال' : u.status === 'invited' ? 'دعوت‌شده' : 'غیرفعال'}
                </Chip>
              </td>
              <td className="px-3 py-2">
                {u.memberships.length === 0 ? (
                  <Chip tone="warning">بدون کسب‌وکار</Chip>
                ) : (
                  <div className="space-y-1">
                    {u.memberships.map((m) => (
                      <div key={m.organization_id} className="flex items-center gap-2 text-xs">
                        <span>{m.organization_name}</span>
                        <span className="text-fg-muted">{TENANT_ROLE_LABELS[m.role]}</span>
                        <button
                          type="button"
                          className="text-fg-faint hover:text-danger"
                          disabled={remove.isPending}
                          onClick={() =>
                            remove.mutate({ userId: u.id, organizationId: m.organization_id })
                          }
                        >
                          حذف
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </td>
              <td className="px-3 py-2 text-xs text-fg-muted">{faDateTimeOf(u.last_login_at)}</td>
              <td className="px-3 py-2">
                <div className="flex gap-1">
                  <button
                    type="button"
                    className={btnRowAction}
                    onClick={() => {
                      setAssignFor(u);
                      setAssignOrg(businesses.data?.[0]?.id ?? '');
                      setAssignRole('visitor_seller');
                    }}
                  >
                    اتصال به کسب‌وکار
                  </button>
                  <button
                    type="button"
                    className={btnRowAction}
                    disabled={setStatus.isPending}
                    onClick={() =>
                      setStatus.mutate({
                        id: u.id,
                        status: u.status === 'disabled' ? 'active' : 'disabled',
                      })
                    }
                  >
                    {u.status === 'disabled' ? 'فعال‌سازی' : 'غیرفعال‌سازی'}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </DataTable>
      )}

      <Modal open={addOpen} title="کاربر جدید" onClose={() => setAddOpen(false)}>
        <form onSubmit={submitCreate} className="space-y-3">
          <Field
            label="شمارهٔ موبایل"
            hint="همین شماره کلید ورود است — کد یک‌بارمصرف به آن پیامک می‌شود."
            error={phone && !phoneValid ? 'شماره را به شکل ۰۹۱۲۳۴۵۶۷۸۹ وارد کنید' : null}
          >
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="numeric"
              className={`${inputClass} font-mono`}
              placeholder="۰۹۱۶۳۳۴۹۹۳۸"
            />
          </Field>
          <Field label="نام نمایشی">
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className={inputClass}
            />
          </Field>
          <FormError>{create.error ? errorMessage(create.error) : null}</FormError>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className={btnGhost} onClick={() => setAddOpen(false)}>
              انصراف
            </button>
            <button type="submit" className={btnPrimary} disabled={create.isPending || !phoneValid}>
              {create.isPending ? 'در حال ساخت…' : 'ساخت'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={assignFor !== null}
        title={`اتصال ${assignFor?.phone ?? ''} به کسب‌وکار`}
        onClose={() => setAssignFor(null)}
      >
        <form onSubmit={submitAssign} className="space-y-3">
          <Field label="کسب‌وکار">
            <select
              value={assignOrg}
              onChange={(e) => setAssignOrg(e.target.value)}
              className={inputClass}
            >
              {businesses.data?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="نقش" hint="نقش تعیین می‌کند کاربر در آن کسب‌وکار چه می‌بیند و چه می‌تواند.">
            <select
              value={assignRole}
              onChange={(e) => setAssignRole(e.target.value as Role)}
              className={inputClass}
            >
              {TENANT_ROLES.map((r) => (
                <option key={r} value={r}>
                  {TENANT_ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </Field>
          <FormError>{assign.error ? errorMessage(assign.error) : null}</FormError>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className={btnGhost} onClick={() => setAssignFor(null)}>
              انصراف
            </button>
            <button type="submit" className={btnPrimary} disabled={assign.isPending || !assignOrg}>
              {assign.isPending ? 'در حال ذخیره…' : 'ذخیره'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
