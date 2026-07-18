'use client';

// Admin shell — RTL layout, sidebar first in DOM = rendered on the RIGHT.
// Dense ops-panel navigation (ux-best-practices/ops-admin-panel).

import { useLogout } from '@/lib/api';
import { ROLE_LABELS } from '@/lib/format';
import type { MeResponse } from '@arad-crm/api-contracts';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

const NAV_ITEMS = [
  { href: '/', label: 'داشبورد' },
  { href: '/leads', label: 'تخصیص سرنخ' },
  { href: '/leads/import', label: 'وارد کردن' },
  { href: '/team', label: 'تیم فروش' },
  { href: '/performance', label: 'عملکرد' },
  { href: '/commission', label: 'کمیسیون' },
] as const;

function NavLinks({ dense = false }: { dense?: boolean }) {
  const pathname = usePathname();
  return (
    <>
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`whitespace-nowrap rounded-sm px-3 py-2 text-sm transition-colors ${
              dense ? 'py-1.5' : ''
            } ${
              active
                ? 'tint-primary font-medium text-primary'
                : 'text-fg-muted hover:bg-surface-2 hover:text-fg'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

function UserChip({ me }: { me: MeResponse }) {
  const router = useRouter();
  const logout = useLogout();
  return (
    <div className="flex items-center justify-between gap-2 rounded-sm border border-border bg-surface-2 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{me.user.display_name}</p>
        <p className="truncate text-xs text-fg-muted">
          {ROLE_LABELS[me.membership.role]} · {me.membership.organization_name}
        </p>
      </div>
      <button
        type="button"
        onClick={() =>
          logout.mutate(undefined, {
            onSettled: () => router.replace('/login'),
          })
        }
        disabled={logout.isPending}
        className="shrink-0 rounded-sm border border-border bg-surface px-2 py-1 text-xs text-fg-muted hover:text-danger disabled:opacity-50"
      >
        خروج
      </button>
    </div>
  );
}

export function AppShell({ me, children }: { me: MeResponse; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      {/* first in DOM + dir=rtl → sits on the right */}
      <aside className="hidden border-e border-border bg-surface md:sticky md:top-0 md:flex md:h-dvh md:w-56 md:shrink-0 md:flex-col">
        <div className="border-b border-border px-4 py-4">
          <p className="text-base font-bold">آراد CRM</p>
          <p className="mt-0.5 text-xs text-fg-muted">پنل مدیریت فروش</p>
        </div>
        <nav aria-label="اصلی" className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          <NavLinks />
        </nav>
        <div className="border-t border-border p-3">
          <UserChip me={me} />
        </div>
      </aside>

      {/* mobile top bar */}
      <div className="sticky top-0 z-40 border-b border-border bg-surface md:hidden">
        <div className="flex items-center justify-between px-4 pt-3">
          <p className="text-sm font-bold">آراد CRM</p>
          <UserChip me={me} />
        </div>
        <nav aria-label="اصلی" className="flex gap-1 overflow-x-auto px-3 py-2">
          <NavLinks dense />
        </nav>
      </div>

      <main className="min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
    </div>
  );
}
