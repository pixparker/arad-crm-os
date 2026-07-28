'use client';

// The app shell, responsive. One component owns the ＋ state because there are
// now two things that open it — the phone's floating button and the tablet
// rail's labelled one — and they must open the same sheet.
//
// Layout: below `md` the content is a single phone-width column with the bottom
// bar under it; from `md` up a pinned navy rail sits on the inline-start edge
// and the content gets a real reading column beside it. Sub-flows (forms) hide
// both, exactly as they hid the bottom bar before.

import { AddSheet } from '@/components/add-sheet';
import { BottomNav } from '@/components/bottom-nav';
import { SideRail } from '@/components/side-rail';
import { usePathname } from 'next/navigation';
import { type ReactNode, useState } from 'react';

export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [addOpen, setAddOpen] = useState(false);

  // Sub-flows carry their own bottom CTA; navigation under it is two primary
  // actions arguing.
  const isSubFlow =
    pathname.endsWith('/new') || pathname.endsWith('/log') || pathname.startsWith('/log/');

  if (isSubFlow) {
    return <div className="mx-auto w-full max-w-md md:max-w-2xl">{children}</div>;
  }

  return (
    <div className="md:flex md:items-start">
      <SideRail onAdd={() => setAddOpen(true)} />
      {/* max-w-md keeps the phone layout honest; from md the column widens to a
          tablet reading width rather than sitting as a strip in a grey sea. */}
      <div className="mx-auto w-full max-w-md md:mx-0 md:min-w-0 md:max-w-none md:flex-1">
        {children}
      </div>
      <BottomNav addOpen={addOpen} onAdd={() => setAddOpen(true)} />
      <AddSheet open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}
