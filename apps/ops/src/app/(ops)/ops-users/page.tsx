'use client';

// Ops users — a SEPARATE screen because it is a separate identity axis
// (ADR-014 §1). Granting «پشتیبانی» here gives no access to any workspace, and
// an owner_admin membership grants nothing here. super_admin only.
//
// Revoking a role is the one action in this panel that can lock a colleague
// out of every tenant's data at once, so it goes through the kit's confirm
// dialog rather than firing on a stray click — the one place in the control
// plane where friction is the feature.

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
  DataRow,
  DataRowSkeleton,
  EmptyState,
  GradientButton,
  ListPage,
  Modal,
  SelectField,
  StatusBadge,
  pickAvatarGradient,
  useConfirm,
} from '@arad/ops-kit';
import { RefreshCw, ShieldCheck, ShieldPlus, X } from 'lucide-react';
import { type FormEvent, useState } from 'react';

export default function OpsUsersPage() {
  const me = useOpsMe();
  const staff = useOpsStaff();
  const users = useUsers();
  const grant = useGrantOpsRole();
  const revoke = useRevokeOpsRole();
  const confirm = useConfirm();

  const [grantOpen, setGrantOpen] = useState(false);
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<OpsRole>('support');

  const isSuperAdmin = me.data?.roles.includes('super_admin') ?? false;

  const submitGrant = (e: FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    grant.mutate({ user_id: userId, role }, { onSuccess: () => setGrantOpen(false) });
  };

  const askRevoke = async (staffId: string, staffLabel: string, r: OpsRole) => {
    const ok = await confirm({
      title: `حذف نقش «${OPS_ROLE_LABELS[r]}»`,
      description: `${staffLabel} دیگر با این نقش به دادهٔ کسب‌وکارها دسترسی نخواهد داشت.`,
      confirmLabel: 'حذف نقش',
      cancelLabel: 'انصراف',
      tone: 'danger',
    });
    if (ok) revoke.mutate({ user_id: staffId, role: r });
  };

  if (!isSuperAdmin) {
    return (
      <ListPage title="اپراتورها">
        <EmptyState
          icon={ShieldCheck}
          headline="فقط مدیر ارشد"
          description="دادن یا گرفتن نقش اپراتوری، دسترسی به دادهٔ همهٔ کسب‌وکارهاست؛ تنها مدیر ارشد این کار را انجام می‌دهد."
        />
      </ListPage>
    );
  }

  return (
    <ListPage
      title="اپراتورها"
      subtitle="محور هویت اپراتوری، جدا از عضویت در کسب‌وکارهاست: این نقش‌ها هیچ فضای کاری‌ای را باز نمی‌کنند."
      action={
        <GradientButton
          icon={<ShieldPlus className="h-4 w-4" />}
          onClick={() => setGrantOpen(true)}
        >
          دادن نقش
        </GradientButton>
      }
      footer={
        revoke.error ? (
          <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
            {errorMessage(revoke.error)}
          </p>
        ) : null
      }
    >
      {staff.isPending ? (
        <DataRowSkeleton count={3} />
      ) : staff.error ? (
        <EmptyState
          icon={ShieldCheck}
          headline="فهرست بارگیری نشد"
          description={errorMessage(staff.error)}
          cta={
            <GradientButton
              gradient="slate"
              icon={<RefreshCw className="h-4 w-4" />}
              onClick={() => staff.refetch()}
            >
              تلاش دوباره
            </GradientButton>
          }
        />
      ) : staff.data.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          headline="اپراتوری ثبت نشده"
          description="یک کاربر موجود را انتخاب کنید و نقش اپراتوری بدهید."
          cta={
            <GradientButton
              icon={<ShieldPlus className="h-4 w-4" />}
              onClick={() => setGrantOpen(true)}
            >
              دادن نقش
            </GradientButton>
          }
        />
      ) : (
        <div className="divide-y divide-border">
          {staff.data.map((s, i) => {
            const gradient = pickAvatarGradient(i);
            const label = s.display_name || s.phone;
            return (
              <DataRow
                key={s.id}
                icon={ShieldCheck}
                gradientFrom={gradient.from}
                gradientTo={gradient.to}
                primary={
                  <span className="flex items-center gap-2">
                    <span dir="ltr" className="font-mono">
                      {s.phone}
                    </span>
                    {s.display_name && <span className="text-fg-muted">· {s.display_name}</span>}
                  </span>
                }
                meta={[`از ${faDateOf(s.created_at)}`]}
                showChevron={false}
                trailing={
                  <div className="flex flex-wrap items-center gap-1.5">
                    {s.roles.map((r) => (
                      <StatusBadge
                        key={r}
                        tone={r === 'super_admin' ? 'violet' : 'slate'}
                        label={OPS_ROLE_LABELS[r]}
                      />
                    ))}
                  </div>
                }
                rowActions={
                  <div className="flex flex-wrap items-center gap-1">
                    {s.roles.map((r) => (
                      <button
                        key={r}
                        type="button"
                        title={`حذف نقش ${OPS_ROLE_LABELS[r]}`}
                        disabled={revoke.isPending}
                        onClick={() => void askRevoke(s.id, label, r)}
                        className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-fg-faint transition hover:bg-danger-soft hover:text-danger disabled:opacity-50"
                      >
                        <X className="h-3 w-3" />
                        {OPS_ROLE_LABELS[r]}
                      </button>
                    ))}
                  </div>
                }
              />
            );
          })}
        </div>
      )}

      <Modal
        open={grantOpen}
        onOpenChange={setGrantOpen}
        title="دادن نقش اپراتوری"
        description="این نقش هیچ فضای کاری‌ای باز نمی‌کند — دسترسی به کنترل‌پنل می‌دهد."
        icon={ShieldPlus}
        footer={
          <div className="flex justify-end gap-2">
            <GradientButton gradient="slate" onClick={() => setGrantOpen(false)}>
              انصراف
            </GradientButton>
            <GradientButton
              type="submit"
              form="grant-ops-role"
              loading={grant.isPending}
              disabled={!userId}
            >
              دادن نقش
            </GradientButton>
          </div>
        }
      >
        <form id="grant-ops-role" onSubmit={submitGrant} className="space-y-4">
          <SelectField
            label="کاربر"
            dir="rtl"
            helper="کاربر باید از قبل در «کاربران» ساخته شده باشد."
            value={userId}
            onValueChange={setUserId}
            placeholder="— انتخاب کنید —"
            options={(users.data ?? []).map((u) => ({
              value: u.id,
              label: u.display_name ? `${u.phone} — ${u.display_name}` : u.phone,
            }))}
          />
          <SelectField
            label="نقش"
            dir="rtl"
            value={role}
            onValueChange={(v) => setRole(v as OpsRole)}
            options={OPS_ROLES.map((r) => ({ value: r, label: OPS_ROLE_LABELS[r] }))}
          />
          {grant.error && <p className="text-sm text-danger">{errorMessage(grant.error)}</p>}
        </form>
      </Modal>
    </ListPage>
  );
}
