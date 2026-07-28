'use client';

// Users & membership — the demo's step 3, second half: create a user and
// assign them to Mizro. A user may belong to several businesses; the seller
// app resolves which one they are working in at login (E01-F06).
//
// The row leads with the phone number because that IS the identity here —
// there are no usernames and no passwords, and a person with no display name
// is still perfectly findable by the number they will log in with.
//
// A user with no membership is the failure this screen exists to prevent
// (they can pass OTP and then land nowhere), so it is called out on the row
// rather than left to be inferred from an empty cell.

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
  DataRow,
  DataRowSkeleton,
  EmptyState,
  Field,
  FilterBar,
  GradientButton,
  Input,
  ListPage,
  Modal,
  SelectField,
  StatusBadge,
  pickAvatarGradient,
} from '@arad/ops-kit';
import { Building2, Plus, RefreshCw, UserPlus, Users as UsersIcon, X } from 'lucide-react';
import { type FormEvent, useState } from 'react';

const MOBILE_RE = /^09[0-9]{9}$/;

const STATUS_TONE = { active: 'emerald', invited: 'slate', disabled: 'rose' } as const;
const STATUS_LABEL = { active: 'فعال', invited: 'دعوت‌شده', disabled: 'غیرفعال' } as const;

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
  const noBusinessYet = (businesses.data?.length ?? 0) === 0;

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

  const openAssign = (u: PlatformUser) => {
    setAssignFor(u);
    setAssignOrg(businesses.data?.[0]?.id ?? '');
    setAssignRole('visitor_seller');
  };

  return (
    <ListPage
      title="کاربران"
      subtitle="ساخت کاربر با شمارهٔ موبایل و اتصال او به یک یا چند کسب‌وکار. ورود فقط با دعوت است."
      action={
        <GradientButton
          icon={<UserPlus className="h-4 w-4" />}
          onClick={() => setAddOpen(true)}
          disabled={noBusinessYet}
          title={noBusinessYet ? 'اول یک کسب‌وکار ثبت کنید' : undefined}
        >
          کاربر جدید
        </GradientButton>
      }
      filterBar={
        <FilterBar
          searchKey="q"
          searchPlaceholder="جست‌وجوی شماره یا نام…"
          hasActiveFilters={orgFilter !== ''}
          onClear={() => setOrgFilter('')}
          resultCount={users.data?.length ?? 0}
          labels={{
            clear: 'حذف فیلتر',
            resultLine: (n) => `${n.toLocaleString('fa-IR')} کاربر`,
          }}
          filters={
            <SelectField
              label="کسب‌وکار"
              dir="rtl"
              value={orgFilter}
              onValueChange={setOrgFilter}
              options={[
                { value: '', label: 'همهٔ کسب‌وکارها' },
                ...(businesses.data ?? []).map((b) => ({ value: b.id, label: b.name })),
              ]}
            />
          }
        />
      }
    >
      {users.isPending ? (
        <DataRowSkeleton count={5} />
      ) : users.error ? (
        <EmptyState
          icon={UsersIcon}
          headline="فهرست بارگیری نشد"
          description={errorMessage(users.error)}
          cta={
            <GradientButton
              gradient="slate"
              icon={<RefreshCw className="h-4 w-4" />}
              onClick={() => users.refetch()}
            >
              تلاش دوباره
            </GradientButton>
          }
        />
      ) : users.data.length === 0 ? (
        <EmptyState
          icon={UsersIcon}
          headline={orgFilter ? 'این کسب‌وکار کاربری ندارد' : 'کاربری وجود ندارد'}
          description="کاربر را با شمارهٔ موبایل بسازید؛ بلافاصله بعد از ساخت، به کسب‌وکار وصلش کنید."
          cta={
            !noBusinessYet && (
              <GradientButton icon={<Plus className="h-4 w-4" />} onClick={() => setAddOpen(true)}>
                کاربر جدید
              </GradientButton>
            )
          }
        />
      ) : (
        <div className="divide-y divide-border">
          {users.data.map((u, i) => {
            const gradient = pickAvatarGradient(i);
            return (
              <DataRow
                key={u.id}
                icon={UsersIcon}
                gradientFrom={gradient.from}
                gradientTo={gradient.to}
                primary={
                  <span className="flex items-center gap-2">
                    <span dir="ltr" className="font-mono">
                      {u.phone}
                    </span>
                    {u.display_name && <span className="text-fg-muted">· {u.display_name}</span>}
                    {u.is_ops && <StatusBadge tone="violet" label="اپراتور" />}
                  </span>
                }
                meta={[
                  u.memberships.length > 0
                    ? u.memberships
                        .map((m) => `${m.organization_name} — ${TENANT_ROLE_LABELS[m.role]}`)
                        .join('، ')
                    : null,
                  u.last_login_at
                    ? `آخرین ورود ${faDateTimeOf(u.last_login_at)}`
                    : 'هنوز وارد نشده',
                ]}
                showChevron={false}
                trailing={
                  <div className="flex items-center gap-2">
                    {u.memberships.length === 0 && (
                      <StatusBadge tone="amber" label="بدون کسب‌وکار" variant="pulse" />
                    )}
                    <StatusBadge tone={STATUS_TONE[u.status]} label={STATUS_LABEL[u.status]} />
                  </div>
                }
                rowActions={
                  <div className="flex items-center gap-1">
                    {u.memberships.map((m) => (
                      <button
                        key={m.organization_id}
                        type="button"
                        title={`حذف عضویت ${m.organization_name}`}
                        disabled={remove.isPending}
                        onClick={() =>
                          remove.mutate({ userId: u.id, organizationId: m.organization_id })
                        }
                        className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-fg-faint transition hover:bg-danger-soft hover:text-danger disabled:opacity-50"
                      >
                        <X className="h-3 w-3" />
                        {m.organization_name}
                      </button>
                    ))}
                    <button
                      type="button"
                      title="اتصال به کسب‌وکار"
                      onClick={() => openAssign(u)}
                      className="rounded-lg p-2 text-fg-faint transition hover:bg-surface-2 hover:text-fg-muted"
                    >
                      <Building2 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      disabled={setStatus.isPending}
                      onClick={() =>
                        setStatus.mutate({
                          id: u.id,
                          status: u.status === 'disabled' ? 'active' : 'disabled',
                        })
                      }
                      className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-fg-muted transition hover:bg-surface-2 hover:text-fg disabled:opacity-50"
                    >
                      {u.status === 'disabled' ? 'فعال‌سازی' : 'غیرفعال‌سازی'}
                    </button>
                  </div>
                }
              />
            );
          })}
        </div>
      )}

      <Modal
        open={addOpen}
        onOpenChange={setAddOpen}
        title="کاربر جدید"
        description="شماره کلید ورود است — کد یک‌بارمصرف به همین شماره پیامک می‌شود."
        icon={UserPlus}
        footer={
          <div className="flex justify-end gap-2">
            <GradientButton gradient="slate" onClick={() => setAddOpen(false)}>
              انصراف
            </GradientButton>
            <GradientButton
              type="submit"
              form="create-user"
              loading={create.isPending}
              disabled={!phoneValid}
            >
              ساخت
            </GradientButton>
          </div>
        }
      >
        <form id="create-user" onSubmit={submitCreate} className="space-y-4">
          <Field
            label="شمارهٔ موبایل"
            error={phone && !phoneValid ? 'شماره را به شکل ۰۹۱۲۳۴۵۶۷۸۹ وارد کنید' : undefined}
          >
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="numeric"
              dir="ltr"
              className="font-mono"
              placeholder="09163349938"
            />
          </Field>
          <Field label="نام نمایشی">
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </Field>
          {create.error && <p className="text-sm text-danger">{errorMessage(create.error)}</p>}
        </form>
      </Modal>

      <Modal
        open={assignFor !== null}
        onOpenChange={(open) => !open && setAssignFor(null)}
        title={`اتصال ${assignFor?.phone ?? ''} به کسب‌وکار`}
        description="بدون عضویت، کاربر می‌تواند وارد شود ولی هیچ فضای کاری نمی‌بیند."
        icon={Building2}
        footer={
          <div className="flex justify-end gap-2">
            <GradientButton gradient="slate" onClick={() => setAssignFor(null)}>
              انصراف
            </GradientButton>
            <GradientButton
              type="submit"
              form="assign-membership"
              loading={assign.isPending}
              disabled={!assignOrg}
            >
              ذخیره
            </GradientButton>
          </div>
        }
      >
        <form id="assign-membership" onSubmit={submitAssign} className="space-y-4">
          <SelectField
            label="کسب‌وکار"
            dir="rtl"
            value={assignOrg}
            onValueChange={setAssignOrg}
            options={(businesses.data ?? []).map((b) => ({ value: b.id, label: b.name }))}
          />
          <SelectField
            label="نقش"
            dir="rtl"
            helper="نقش تعیین می‌کند کاربر در آن کسب‌وکار چه می‌بیند و چه می‌تواند."
            value={assignRole}
            onValueChange={(v) => setAssignRole(v as Role)}
            options={TENANT_ROLES.map((r) => ({ value: r, label: TENANT_ROLE_LABELS[r] }))}
          />
          {assign.error && <p className="text-sm text-danger">{errorMessage(assign.error)}</p>}
        </form>
      </Modal>
    </ListPage>
  );
}
