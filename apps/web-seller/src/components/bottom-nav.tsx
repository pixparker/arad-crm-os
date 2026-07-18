'use client';

// Thumb-zone bottom nav (ux-best-practices/bottom-sheet-and-thumb-zone).
// Hidden on sub-flows that carry their own bottom CTA (leads/new, quick-log).

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FolderIcon, FunnelIcon, SunIcon, WalletIcon } from './icons';

const items = [
  { href: '/', label: 'امروز', icon: SunIcon },
  { href: '/pipeline', label: 'پایپلاین', icon: FunnelIcon },
  { href: '/accounts', label: 'پرونده‌ها', icon: FolderIcon },
  { href: '/money', label: 'درآمد من', icon: WalletIcon },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  if (pathname === '/leads/new' || pathname.endsWith('/log')) return null;

  const isActive = (href: string): boolean =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav
      aria-label="ناوبری اصلی"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      <div className="mx-auto flex w-full max-w-md items-stretch justify-around">
        {items.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`flex min-w-16 flex-col items-center gap-1 px-2 py-2.5 text-[11px] ${
                active ? 'font-bold text-primary' : 'font-medium text-fg-muted'
              }`}
            >
              <Icon className="h-6 w-6" />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
