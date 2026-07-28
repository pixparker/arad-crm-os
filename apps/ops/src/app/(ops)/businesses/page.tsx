'use client';

// Businesses — the demo's step 3, first half: register Mizro as a business.
// A business IS an organization; this is the only surface that creates one.

import {
  type Business,
  errorMessage,
  useBindProducer,
  useBusinesses,
  useCreateBusiness,
  useProducerBindings,
  useSetBusinessStatus,
} from '@/lib/api';
import { faDateOf, faNumber } from '@/lib/format';
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

export default function BusinessesPage() {
  const businesses = useBusinesses();
  const bindings = useProducerBindings();
  const create = useCreateBusiness();
  const setStatus = useSetBusinessStatus();
  const bind = useBindProducer();

  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');

  const [bindFor, setBindFor] = useState<Business | null>(null);
  const [externalRef, setExternalRef] = useState('default');

  const submitCreate = (e: FormEvent) => {
    e.preventDefault();
    create.mutate(
      { name: name.trim(), ...(slug.trim() ? { slug: slug.trim() } : {}) },
      {
        onSuccess: () => {
          setAddOpen(false);
          setName('');
          setSlug('');
        },
      },
    );
  };

  const submitBind = (e: FormEvent) => {
    e.preventDefault();
    if (!bindFor) return;
    bind.mutate(
      {
        producer: 'mizro',
        external_ref: externalRef.trim() || 'default',
        organization_id: bindFor.id,
        label: bindFor.name,
      },
      { onSuccess: () => setBindFor(null) },
    );
  };

  return (
    <>
      <PageHeader
        title="کسب‌وکارها"
        subtitle="هر کسب‌وکار یک فضای کاری مستقل با کاربران و دادهٔ خودش است."
        actions={
          <button type="button" onClick={() => setAddOpen(true)} className={btnPrimary}>
            ثبت کسب‌وکار
          </button>
        }
      />

      {businesses.isPending ? (
        <TableSkeleton />
      ) : businesses.error ? (
        <ErrorState message={errorMessage(businesses.error)} onRetry={() => businesses.refetch()} />
      ) : businesses.data.length === 0 ? (
        <EmptyState
          title="هنوز کسب‌وکاری ثبت نشده"
          hint="اولین کسب‌وکار را ثبت کنید تا بتوانید کاربر بسازید و به آن وصل کنید."
        />
      ) : (
        <DataTable
          head={
            <tr>
              <th className="px-3 py-2 text-start font-medium">نام</th>
              <th className="px-3 py-2 text-start font-medium">شناسه</th>
              <th className="px-3 py-2 text-start font-medium">وضعیت</th>
              <th className="px-3 py-2 text-start font-medium">اعضا</th>
              <th className="px-3 py-2 text-start font-medium">رویدادها</th>
              <th className="px-3 py-2 text-start font-medium">تاریخ</th>
              <th className="px-3 py-2 text-start font-medium">عملیات</th>
            </tr>
          }
        >
          {businesses.data.map((b) => {
            const bound = bindings.data?.filter((x) => x.organization_id === b.id) ?? [];
            return (
              <tr key={b.id}>
                <td className="px-3 py-2 font-medium">{b.name}</td>
                <td className="px-3 py-2 font-mono text-xs text-fg-muted">{b.slug}</td>
                <td className="px-3 py-2">
                  <Chip tone={b.status === 'active' ? 'success' : 'warning'}>
                    {b.status === 'active' ? 'فعال' : 'معلق'}
                  </Chip>
                </td>
                <td className="px-3 py-2 tabular-nums">{faNumber(b.member_count)}</td>
                <td className="px-3 py-2 text-xs">
                  {bound.length > 0 ? (
                    bound.map((x) => (
                      <span key={x.id} className="block font-mono text-fg-muted">
                        {x.producer}/{x.external_ref}
                      </span>
                    ))
                  ) : (
                    <Chip tone="warning">وصل نشده</Chip>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-fg-muted">{faDateOf(b.created_at)}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className={btnRowAction}
                      onClick={() => {
                        setBindFor(b);
                        setExternalRef('default');
                      }}
                    >
                      اتصال رویداد
                    </button>
                    <button
                      type="button"
                      className={btnRowAction}
                      disabled={setStatus.isPending}
                      onClick={() =>
                        setStatus.mutate({
                          id: b.id,
                          status: b.status === 'active' ? 'suspended' : 'active',
                        })
                      }
                    >
                      {b.status === 'active' ? 'تعلیق' : 'فعال‌سازی'}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </DataTable>
      )}

      <Modal open={addOpen} title="ثبت کسب‌وکار" onClose={() => setAddOpen(false)}>
        <form onSubmit={submitCreate} className="space-y-3">
          <Field label="نام کسب‌وکار">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              placeholder="میزرو"
            />
          </Field>
          <Field
            label="شناسه (slug)"
            hint="حروف کوچک لاتین، عدد و خط تیره. برای نام فارسی الزامی است."
          >
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className={`${inputClass} font-mono`}
              placeholder="mizro"
            />
          </Field>
          <FormError>{create.error ? errorMessage(create.error) : null}</FormError>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className={btnGhost} onClick={() => setAddOpen(false)}>
              انصراف
            </button>
            <button
              type="submit"
              className={btnPrimary}
              disabled={create.isPending || name.trim().length < 2}
            >
              {create.isPending ? 'در حال ثبت…' : 'ثبت'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={bindFor !== null}
        title={`اتصال رویدادها به ${bindFor?.name ?? ''}`}
        onClose={() => setBindFor(null)}
      >
        <form onSubmit={submitBind} className="space-y-3">
          <p className="text-xs text-fg-muted">
            تعیین می‌کند رویدادهای پرداخت میزرو به کدام کسب‌وکار تعلق دارند. بدون آن، وقتی بیش از یک
            کسب‌وکار وجود داشته باشد پردازش رویداد متوقف می‌شود — به‌جای آنکه کمیسیون به تیم اشتباه
            برسد.
          </p>
          <Field label="شناسهٔ نمونهٔ تولیدکننده" hint="تا وقتی یک کلید مشترک داریم: default">
            <input
              value={externalRef}
              onChange={(e) => setExternalRef(e.target.value)}
              className={`${inputClass} font-mono`}
            />
          </Field>
          <FormError>{bind.error ? errorMessage(bind.error) : null}</FormError>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className={btnGhost} onClick={() => setBindFor(null)}>
              انصراف
            </button>
            <button type="submit" className={btnPrimary} disabled={bind.isPending}>
              {bind.isPending ? 'در حال ذخیره…' : 'ذخیره'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
