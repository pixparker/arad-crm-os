'use client';

// The tablet/desktop navigation rail — the prototype's «کنسول دسکتاپ», not a
// stretched phone. From `md` up the screen is wide enough that a bottom bar is
// the WRONG place for navigation: the thumb zone argument only holds for a
// device you hold in one hand, and on a tablet the bottom edge is the furthest
// point from where the hands actually rest.
//
// So the same four destinations move to a pinned navy rail on the inline-start
// edge, «کمیسیون من» and «پروفایل» join them (there is room now, so they stop
// being things you have to know to look for), and ＋ becomes a labelled button
// instead of a floating disc — a rail has room for the word «افزودن».

import { MizroMark } from '@/components/brand';
import { AddIcon } from '@/components/icons';
import { ROLE_FA } from '@/lib/labels';
import { useMe } from '@/lib/use-me';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { CalendarIcon, FolderIcon, FunnelIcon, HomeIcon, TargetIcon, WalletIcon } from './icons';

const GROUPS: readonly {
  label?: string;
  items: readonly { href: string; label: string; icon: (p: { className?: string }) => ReactNode }[];
}[] = [
  {
    items: [
      { href: '/', label: 'داشبورد', icon: HomeIcon },
      { href: '/pipeline', label: 'پایپلاین فروش', icon: FunnelIcon },
      { href: '/accounts', label: 'سرنخ‌ها و مشتریان', icon: FolderIcon },
      { href: '/tasks', label: 'کارها و یادآورها', icon: CalendarIcon },
    ],
  },
  {
    label: 'درآمد',
    items: [
      { href: '/money', label: 'کمیسیون من', icon: WalletIcon },
      { href: '/me', label: 'پروفایل من', icon: TargetIcon },
    ],
  },
];

export function SideRail({ onAdd }: { onAdd: () => void }) {
  const pathname = usePathname();
  const me = useMe();

  const isActive = (href: string): boolean =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <aside
      aria-label="ناوبری اصلی"
      className="sticky top-0 hidden h-dvh w-60 flex-none flex-col gap-6 overflow-y-auto bg-canopy px-4 pb-5 pt-safe text-on-canopy md:flex lg:w-64"
    >
      <div className="flex items-center gap-2.5">
        <MizroMark className="h-9 w-9 text-on-canopy" />
        <span className="text-[15px] font-bold leading-tight">میزرو سِیلز</span>
      </div>

      <button
        type="button"
        onClick={onAdd}
        className="flex items-center justify-center gap-2 rounded-md bg-primary py-3 text-[13px] font-bold text-primary-fg transition active:scale-[0.98]"
      >
        <AddIcon className="h-[18px] w-[18px]" />
        افزودن مورد جدید
      </button>

      <nav className="flex min-h-0 flex-1 flex-col gap-1">
        {GROUPS.map((group, gi) => (
          <div key={group.label ?? gi} className={gi > 0 ? 'mt-5' : undefined}>
            {group.label ? (
              <p className="mb-1.5 px-3 text-[10px] font-bold text-on-canopy-muted">
                {group.label}
              </p>
            ) : null}
            {group.items.map(({ href, label, icon: Icon }) => {
              const active = isActive(href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center gap-2.5 rounded-md px-3 py-2.5 text-[13px] transition ${
                    active
                      ? 'bg-white/12 font-bold text-on-canopy'
                      : 'font-medium text-on-canopy-muted hover:bg-white/[0.07]'
                  }`}
                >
                  <Icon className="h-[18px] w-[18px] flex-none" />
                  <span className="truncate">{label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {me.data ? (
        <Link
          href="/me"
          className="flex items-center gap-2.5 rounded-md border border-white/10 p-2.5 transition hover:bg-white/[0.07]"
        >
          <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-white/15 text-[12px] font-bold">
            {[...me.data.user.display_name.replace(/[‌\s]/g, '')].slice(0, 2).join('')}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[12px] font-bold">
              {me.data.user.display_name}
            </span>
            <span className="block truncate text-[10px] text-on-canopy-muted">
              {ROLE_FA[me.data.membership.role] ?? me.data.membership.role}
              {me.data.membership.territory_name ? ` — ${me.data.membership.territory_name}` : ''}
            </span>
          </span>
        </Link>
      ) : null}
    </aside>
  );
}
