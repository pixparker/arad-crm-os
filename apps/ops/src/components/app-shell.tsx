'use client';

// Control-plane shell — RTL, sidebar first in DOM so it renders on the right.
// Deliberately plain: this surface gets no design pass (epic §5.3), and the
// nav mirrors the ADR-014 §2 screen list one-for-one.

import { useLogout } from '@/lib/api';
import { OPS_ROLE_LABELS } from '@/lib/format';
import type { OpsMeResponse } from '@arad-crm/api-contracts';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

const NAV_ITEMS = [
  { href: '/', label: 'نمای کلی' },
  { href: '/businesses', label: 'کسب‌وکارها' },
  { href: '/users', label: 'کاربران' },
  { href: '/ops-users', label: 'اپراتورها' },
  { href: '/connections', label: 'اتصال‌ها' },
  { href: '/settings', label: 'تنظیمات پلتفرم' },
  { href: '/audit', label: 'رخدادها' },
  { href: '/inbox', label: 'صندوق رویداد' },
] as const;

function NavLinks({ dense = false }: { dense?: boolean }) {
  const pathname = usePathname();
  return (
    <>
      {NAV_ITEMS.map((item) => {
        const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
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

function UserChip({ me }: { me: OpsMeResponse }) {
  const router = useRouter();
  const logout = useLogout();
  return (
    <div className="flex items-center justify-between gap-2 rounded-sm border border-border bg-surface-2 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{me.user.display_name || me.user.phone}</p>
        <p className="truncate text-xs text-fg-muted">
          {me.roles.map((r) => OPS_ROLE_LABELS[r]).join('، ') || 'بدون نقش'}
        </p>
      </div>
      <button
        type="button"
        onClick={() => logout.mutate(undefined, { onSettled: () => router.replace('/login') })}
        disabled={logout.isPending}
        className="shrink-0 rounded-sm border border-border bg-surface px-2 py-1 text-xs text-fg-muted hover:text-danger disabled:opacity-50"
      >
        خروج
      </button>
    </div>
  );
}

export function AppShell({ me, children }: { me: OpsMeResponse; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <aside className="hidden border-e border-border bg-surface md:sticky md:top-0 md:flex md:h-dvh md:w-56 md:shrink-0 md:flex-col">
        <div className="border-b border-border px-4 py-4">
          <p className="text-base font-bold">کنترل‌پنل آراد</p>
          <p className="mt-0.5 text-xs text-fg-muted">مدیریت پلتفرم</p>
        </div>
        <nav aria-label="اصلی" className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          <NavLinks />
        </nav>
        <div className="border-t border-border p-3">
          <UserChip me={me} />
        </div>
      </aside>

      <div className="sticky top-0 z-40 border-b border-border bg-surface md:hidden">
        <div className="flex items-center justify-between px-4 pt-3">
          <p className="text-sm font-bold">کنترل‌پنل آراد</p>
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
