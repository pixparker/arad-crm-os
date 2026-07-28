'use client';

// Bottom nav + ＋ — the PHONE shell. Four tabs around a centre notch, with the
// FAB straddling the bar — thumb zone, one primary action, always the same
// place (ux-best-practices/bottom-sheet-and-thumb-zone).
//
// Hidden from `md` up, where SideRail takes over: the thumb-zone argument is
// about a device held in one hand, and on a tablet the bottom edge is the
// furthest point from where the hands rest.
//
// The tab set is the prototype's: خانه · پایپلاین — ＋ — مشتریان · کارها.
// «کمیسیون» is NOT a tab; it is reached from the dashboard's commission card
// and from the profile, exactly as the prototype routes it. Four tabs is the
// limit at which a bottom bar stays readable one-handed, and money is a place
// a seller visits, not a place they work.
//
// The FAB is large on the dashboard and small elsewhere — the prototype's own
// rule: the home screen is where "add something" is the point, everywhere else
// it must not compete with the content's own actions.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarIcon, FolderIcon, FunnelIcon, HomeIcon } from './icons';

const items = [
  { href: '/', label: 'خانه', icon: HomeIcon },
  { href: '/pipeline', label: 'پایپلاین', icon: FunnelIcon },
  { href: '/accounts', label: 'مشتریان', icon: FolderIcon },
  { href: '/tasks', label: 'کارها', icon: CalendarIcon },
] as const;

export function BottomNav({ addOpen, onAdd }: { addOpen: boolean; onAdd: () => void }) {
  const pathname = usePathname();

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
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
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
        onClick={onAdd}
        aria-expanded={addOpen}
        aria-label="افزودن مورد جدید"
        // Prototype metrics, not a guess: 60px lifted out of the bar with a
        // white cut-out ring on the dashboard, 48px sitting LOWER and tucked
        // into the bar everywhere else. The size gap has to be wide enough to
        // read as a different rank — 64 vs 56 just looks like a rendering bug.
        className={`fixed left-1/2 z-40 grid -translate-x-1/2 place-items-center rounded-full bg-primary text-primary-fg transition-all duration-200 active:scale-95 md:hidden ${
          onDashboard
            ? 'bottom-[calc(env(safe-area-inset-bottom)+30px)] h-[60px] w-[60px] shadow-[0_8px_22px_rgba(24,176,153,0.44),0_0_0_5px_rgba(255,255,255,0.92)]'
            : 'bottom-[calc(env(safe-area-inset-bottom)+24px)] h-12 w-12 shadow-[0_4px_12px_rgba(24,176,153,0.32),0_0_0_3px_rgba(255,255,255,0.92)]'
        }`}
      >
        <svg
          width={onDashboard ? 26 : 21}
          height={onDashboard ? 26 : 21}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          aria-hidden="true"
          className={`transition-transform duration-300 ${addOpen ? 'rotate-[135deg]' : ''}`}
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
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
