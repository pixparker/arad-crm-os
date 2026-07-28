'use client';

// The prototype's collapsing header, as one hook.
//
// Every navy header in the prototype is pinned — the content scrolls *under*
// it, not past it — so the tall ones (داشبورد's KPI strip, کمیسیون's total,
// پروفایل's photo + stats) would eat a third of a phone screen for the whole
// scroll. They don't: past a few pixels of scroll the hero block folds away and
// a one-line stand-in takes its place, giving the list back the screen while
// the title and the way back stay put.
//
// 24px rather than 0 so a rubber-band scroll or a one-finger nudge doesn't make
// the header twitch.

import { useEffect, useState } from 'react';

const THRESHOLD = 24;

export function useCollapsedHeader(enabled = true): boolean {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const onScroll = (): void => setCollapsed(window.scrollY > THRESHOLD);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [enabled]);

  return enabled && collapsed;
}
