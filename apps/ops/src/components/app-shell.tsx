'use client';

// Control-plane shell — @arad/ops-kit's <OpsShell>, configured. Everything
// structural (sidebar, collapsible groups, mobile drawer, top bar, profile
// dropdown) comes from the kit; this file supplies only what is Arad-specific:
// the nav config, the brand mark, the Persian labels.
//
// The nav is grouped rather than flat because ADR-014 §2's screen list is two
// different jobs wearing one list: onboarding a tenant («کسب‌وکارها، کاربران»)
// and running the platform («اتصال‌ها، تنظیمات، رخدادها، صندوق»). A support
// agent and a super-admin open this panel for different halves of it.

import { useLogout } from '@/lib/api';
import { OPS_ROLE_LABELS } from '@/lib/format';
import type { OpsMeResponse } from '@arad-crm/api-contracts';
import { type NavSection, OpsShell } from '@arad/ops-kit';
import {
  Building2,
  Inbox,
  LayoutDashboard,
  Plug,
  ScrollText,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

// The kit takes the active-state classes per item so a consumer can theme the
// sidebar without the kit knowing a palette. One pair for the whole nav here:
// a control plane is not a place to be colourful.
const ACTIVE = { activeBg: 'bg-white/10', activeText: 'text-white' } as const;

const NAV: NavSection[] = [
  { items: [{ to: '/', label: 'نمای کلی', icon: LayoutDashboard, end: true, ...ACTIVE }] },
  {
    title: 'استقرار مشتری',
    items: [
      { to: '/businesses', label: 'کسب‌وکارها', icon: Building2, ...ACTIVE },
      { to: '/users', label: 'کاربران', icon: Users, ...ACTIVE },
    ],
  },
  {
    title: 'پلتفرم',
    items: [
      { to: '/connections', label: 'اتصال‌ها', icon: Plug, ...ACTIVE },
      { to: '/settings', label: 'تنظیمات', icon: Settings, ...ACTIVE },
      { to: '/ops-users', label: 'اپراتورها', icon: ShieldCheck, ...ACTIVE },
    ],
  },
  {
    title: 'رصد',
    items: [
      { to: '/audit', label: 'رخدادها', icon: ScrollText, ...ACTIVE },
      { to: '/inbox', label: 'صندوق رویداد', icon: Inbox, ...ACTIVE },
    ],
  },
];

function BrandMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-5 w-5 text-white">
      <path
        d="M4 19 12 4l8 15"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M8 14h8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function AppShell({ me, children }: { me: OpsMeResponse; children: ReactNode }) {
  const router = useRouter();
  const logout = useLogout();

  return (
    <OpsShell
      brand={<BrandMark />}
      brandLabel="کنترل‌پنل آراد"
      nav={NAV}
      user={{
        displayName: me.user.display_name || me.user.phone,
        // The kit's profile card shows a second line under the name. The ops
        // axis is what matters about a person here, not an email they do not
        // have — every account in this system is a phone number.
        email: me.roles.map((r) => OPS_ROLE_LABELS[r]).join('، ') || 'بدون نقش',
      }}
      onLogout={() => logout.mutate(undefined, { onSettled: () => router.replace('/login') })}
      labels={{ signOut: 'خروج از حساب', openSidebar: 'باز کردن منو', closeSidebar: 'بستن منو' }}
    >
      {children}
    </OpsShell>
  );
}
