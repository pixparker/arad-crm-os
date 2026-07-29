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
// 🔒 THE FOLD FEEDS BACK INTO ITS OWN TRIGGER — the bug this file exists to
// prevent. A sticky header sits in normal flow, so folding it SHORTENS THE
// DOCUMENT: 83px on the dashboard, 160px on پروفایل. On a short page that is
// enough to clamp `scrollY` back under the threshold that folded it, which
// unfolds, which lengthens the document, which re-crosses the threshold. The
// original single-threshold version did this 275 times in 2.5s on a near-empty
// dashboard and never settled.
//
// Two rules bound it to at most two transitions, whatever the page:
//
//   1. Two thresholds, far apart. Folding is decided at COLLAPSE_AT, unfolding
//      only back near the top, so the fold's own shift lands in the dead zone
//      between them and decides nothing.
//   2. Ignore scroll while the fold is playing. The fold ANIMATES for 300ms,
//      resizing the document on every frame of it and dragging `scrollY` along
//      — every one of those is a scroll event that did not come from the user.
//      Reading them is what turned a single flip into a permanent oscillation,
//      so the state is frozen until the animation is over and then re-read
//      once, against a settled layout.
//
// The worst case is now: fold → the page turns out too short to hold it → one
// unfold → stable, expanded. Which is the right end state for a page with
// nothing to scroll.

import { useEffect, useState } from 'react';

/** Fold once the hero has genuinely been scrolled away from. */
const COLLAPSE_AT = 48;
/** Unfold only back at the top — deliberately far below COLLAPSE_AT. */
const EXPAND_AT = 8;
/** Must outlast the header's `duration-300` fold. */
const SETTLE_MS = 360;

export function useCollapsedHeader(enabled = true): boolean {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let frame = 0;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    let frozenUntil = 0;

    const read = (): void => {
      frame = 0;
      if (Date.now() < frozenUntil) return;
      const y = window.scrollY;
      setCollapsed((was) => {
        const now = was ? y > EXPAND_AT : y > COLLAPSE_AT;
        if (now !== was) {
          // Freeze, then take one more reading against the settled layout —
          // by then `scrollY` is whatever the shortened document allows.
          frozenUntil = Date.now() + SETTLE_MS;
          clearTimeout(settleTimer);
          settleTimer = setTimeout(read, SETTLE_MS + 20);
        }
        return now;
      });
    };

    // Coalesce bursts to one read per frame.
    const onScroll = (): void => {
      if (frame === 0) frame = requestAnimationFrame(read);
    };

    read();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame !== 0) cancelAnimationFrame(frame);
      clearTimeout(settleTimer);
    };
  }, [enabled]);

  return enabled && collapsed;
}
