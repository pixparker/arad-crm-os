'use client';

// Businesses — the demo's step 3, first half: register Mizro as a business.
// A business IS an organization; this is the only surface that creates one.
//
// Rows rather than a table: a business has one identity and two facts about
// it (is it live, does it receive events), and a five-column grid spreads
// three pieces of information across a screen width. The event binding is the
// one that gets missed, so it is a badge on the row and not a column someone
// has to read across to.

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
  DataRow,
  DataRowSkeleton,
  EmptyState,
  Field,
  GradientButton,
  Input,
  ListPage,
  Modal,
  StatusBadge,
  pickAvatarGradient,
} from '@arad/ops-kit';
import { Building2, Link2, Plus, RefreshCw } from 'lucide-react';
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
    <ListPage
      title="کسب‌وکارها"
      subtitle="هر کسب‌وکار یک فضای کاری مستقل با کاربران و دادهٔ خودش است."
      action={
        <GradientButton icon={<Plus className="h-4 w-4" />} onClick={() => setAddOpen(true)}>
          ثبت کسب‌وکار
        </GradientButton>
      }
    >
      {businesses.isPending ? (
        <DataRowSkeleton count={4} />
      ) : businesses.error ? (
        <EmptyState
          icon={Building2}
          headline="فهرست بارگیری نشد"
          description={errorMessage(businesses.error)}
          cta={
            <GradientButton
              gradient="slate"
              icon={<RefreshCw className="h-4 w-4" />}
              onClick={() => businesses.refetch()}
            >
              تلاش دوباره
            </GradientButton>
          }
        />
      ) : businesses.data.length === 0 ? (
        <EmptyState
          icon={Building2}
          headline="هنوز کسب‌وکاری ثبت نشده"
          description="اولین کسب‌وکار را ثبت کنید تا بتوانید کاربر بسازید و به آن وصل کنید."
          cta={
            <GradientButton icon={<Plus className="h-4 w-4" />} onClick={() => setAddOpen(true)}>
              ثبت کسب‌وکار
            </GradientButton>
          }
        />
      ) : (
        <div className="divide-y divide-slate-100">
          {businesses.data.map((b, i) => {
            const bound = bindings.data?.filter((x) => x.organization_id === b.id) ?? [];
            const gradient = pickAvatarGradient(i);
            return (
              <DataRow
                key={b.id}
                icon={Building2}
                gradientFrom={gradient.from}
                gradientTo={gradient.to}
                primary={b.name}
                meta={[
                  b.slug,
                  `${faNumber(b.member_count)} عضو`,
                  bound.length > 0
                    ? bound.map((x) => `${x.producer}/${x.external_ref}`).join('، ')
                    : null,
                  faDateOf(b.created_at),
                ]}
                showChevron={false}
                trailing={
                  <div className="flex items-center gap-2">
                    {bound.length === 0 && <StatusBadge tone="amber" label="رویداد وصل نشده" />}
                    <StatusBadge
                      tone={b.status === 'active' ? 'emerald' : 'slate'}
                      label={b.status === 'active' ? 'فعال' : 'معلق'}
                    />
                  </div>
                }
                rowActions={
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      title="اتصال رویداد"
                      onClick={() => {
                        setBindFor(b);
                        setExternalRef('default');
                      }}
                      className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                    >
                      <Link2 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      disabled={setStatus.isPending}
                      onClick={() =>
                        setStatus.mutate({
                          id: b.id,
                          status: b.status === 'active' ? 'suspended' : 'active',
                        })
                      }
                      className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                    >
                      {b.status === 'active' ? 'تعلیق' : 'فعال‌سازی'}
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
        title="ثبت کسب‌وکار"
        description="یک فضای کاری تازه با کاربران و دادهٔ مستقل."
        icon={Building2}
        footer={
          <div className="flex justify-end gap-2">
            <GradientButton gradient="slate" onClick={() => setAddOpen(false)}>
              انصراف
            </GradientButton>
            <GradientButton
              type="submit"
              form="create-business"
              loading={create.isPending}
              disabled={name.trim().length < 2}
            >
              ثبت
            </GradientButton>
          </div>
        }
      >
        <form id="create-business" onSubmit={submitCreate} className="space-y-4">
          <Field label="نام کسب‌وکار">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="میزرو" />
          </Field>
          <Field
            label="شناسه (slug)"
            helper="حروف کوچک لاتین، عدد و خط تیره. برای نام فارسی الزامی است."
          >
            <Input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="font-mono"
              dir="ltr"
              placeholder="mizro"
            />
          </Field>
          {create.error && <p className="text-sm text-rose-600">{errorMessage(create.error)}</p>}
        </form>
      </Modal>

      <Modal
        open={bindFor !== null}
        onOpenChange={(open) => !open && setBindFor(null)}
        title={`اتصال رویدادها به ${bindFor?.name ?? ''}`}
        icon={Link2}
        footer={
          <div className="flex justify-end gap-2">
            <GradientButton gradient="slate" onClick={() => setBindFor(null)}>
              انصراف
            </GradientButton>
            <GradientButton type="submit" form="bind-producer" loading={bind.isPending}>
              ذخیره
            </GradientButton>
          </div>
        }
      >
        <form id="bind-producer" onSubmit={submitBind} className="space-y-4">
          <p className="text-sm leading-6 text-slate-500">
            تعیین می‌کند رویدادهای پرداخت میزرو به کدام کسب‌وکار تعلق دارند. بدون آن، وقتی بیش از یک
            کسب‌وکار وجود داشته باشد پردازش رویداد متوقف می‌شود — به‌جای آنکه کمیسیون به تیم اشتباه
            برسد.
          </p>
          <Field label="شناسهٔ نمونهٔ تولیدکننده" helper="تا وقتی یک کلید مشترک داریم: default">
            <Input
              value={externalRef}
              onChange={(e) => setExternalRef(e.target.value)}
              className="font-mono"
              dir="ltr"
            />
          </Field>
          {bind.error && <p className="text-sm text-rose-600">{errorMessage(bind.error)}</p>}
        </form>
      </Modal>
    </ListPage>
  );
}
