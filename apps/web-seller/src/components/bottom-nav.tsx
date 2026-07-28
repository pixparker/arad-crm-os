'use client';

// Bottom nav + ＋ (prototype shell). Four tabs around a centre notch, with the
// FAB straddling the bar — thumb zone, one primary action, always the same
// place (ux-best-practices/bottom-sheet-and-thumb-zone).
//
// The prototype's fourth tab is «کارها», a screen that does not exist yet; the
// tab set here is the four screens that do. A tab that leads nowhere teaches
// the seller that the bar lies.
//
// The FAB is large on the dashboard and small elsewhere — the prototype's own
// rule: the home screen is where "add something" is the point, everywhere else
// it must not compete with the content's own actions.

import { AddSheet } from '@/components/add-sheet';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { FolderIcon, FunnelIcon, SunIcon, WalletIcon } from './icons';

const items = [
  { href: '/', label: 'خانه', icon: SunIcon },
  { href: '/pipeline', label: 'پایپلاین', icon: FunnelIcon },
  { href: '/accounts', label: 'مشتریان', icon: FolderIcon },
  { href: '/money', label: 'کمیسیون', icon: WalletIcon },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  const [addOpen, setAddOpen] = useState(false);

  // Sub-flows carry their own bottom CTA; a nav bar under it is two primary
  // actions arguing.
  const isSubFlow =
    pathname.endsWith('/new') || pathname.endsWith('/log') || pathname.startsWith('/log/');
  if (isSubFlow) return null;

  const isActive = (href: string): boolean =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

  const onDashboard = pathname === '/';

  return (
    <>
      <nav
        aria-label="ناوبری اصلی"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]"
      >
        <div className="mx-auto flex w-full max-w-md items-stretch justify-around">
          {items.slice(0, 2).map(({ href, label, icon: Icon }) => (
            <Tab key={href} href={href} label={label} Icon={Icon} active={isActive(href)} />
          ))}
          <span className="w-16 flex-none" aria-hidden="true" />
          {items.slice(2).map(({ href, label, icon: Icon }) => (
            <Tab key={href} href={href} label={label} Icon={Icon} active={isActive(href)} />
          ))}
        </div>
      </nav>

      <button
        type="button"
        onClick={() => setAddOpen(true)}
        aria-expanded={addOpen}
        aria-label="افزودن مورد جدید"
        className={`fixed bottom-[calc(env(safe-area-inset-bottom)+18px)] left-1/2 z-40 grid -translate-x-1/2 place-items-center rounded-full bg-primary text-primary-fg shadow-[0_8px_20px_rgba(24,176,153,0.32)] transition-transform active:scale-95 ${
          onDashboard ? 'h-16 w-16' : 'h-14 w-14'
        }`}
      >
        <svg
          width={onDashboard ? 26 : 22}
          height={onDashboard ? 26 : 22}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          aria-hidden="true"
          className={`transition-transform ${addOpen ? 'rotate-45' : ''}`}
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>

      <AddSheet open={addOpen} onClose={() => setAddOpen(false)} />
    </>
  );
}

function Tab({
  href,
  label,
  Icon,
  active,
}: {
  href: string;
  label: string;
  Icon: (props: { className?: string }) => React.ReactNode;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`flex min-w-16 flex-col items-center gap-1 px-2 py-2.5 text-[11px] ${
        active ? 'font-bold text-primary-ink' : 'font-medium text-fg-muted'
      }`}
    >
      <Icon className="h-6 w-6" />
      {label}
    </Link>
  );
}
