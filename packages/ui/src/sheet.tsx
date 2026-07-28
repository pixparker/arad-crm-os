'use client';

// BottomSheet — the mobile counterpart of Modal: enters from the bottom edge,
// sits in the thumb zone, and becomes a centred dialog once there is room for
// one. In the kit rather than in an app because the ＋ overlay, the guided
// post-create step and every future picker want the same behaviour (ADR-012,
// epic §5.6).
//
// Dismissal follows ux-best-practices/patterns/back-friendly-modals +
// bottom-sheet-and-thumb-zone. Four gestures, ONE path:
//
//   Back / swipe-back · Esc · scrim tap · drag the sheet down
//
// Opening pushes a history entry; every dismissal calls `history.back()`, and
// only `popstate` actually closes the sheet. That is the rule from the pattern:
// if ✕ closed the DOM directly it would leave a stale entry and the next Back
// press would do nothing — the "dead Back" anti-pattern. It also means the
// phone's Back button peels the sheet instead of ejecting the user from the app,
// which on a PWA is the difference between "closed the menu" and "lost my place".
//
// `onClose` therefore means "I have closed", not "please close" — a caller that
// wants to navigate on dismissal should do it when `open` goes false, so the
// history entry is already consumed and the push lands on a clean stack.

import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

const HISTORY_MARK = 'ac-sheet';

/** Ask the top sheet to close. Same path as Back — see the note above. */
export const dismissSheet = (): void => {
  if (typeof window !== 'undefined') window.history.back();
};

/** Past this many px of downward drag, releasing dismisses instead of snapping back. */
const DISMISS_AFTER_PX = 96;

export function BottomSheet({
  open,
  title,
  description,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  description?: string | undefined;
  /** Called when the sheet HAS closed (always via history). */
  onClose: () => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDialogElement>(null);
  const [dragY, setDragY] = useState(0);
  const dragFrom = useRef<number | null>(null);

  // Keep the latest onClose without re-running the history effect on every
  // parent render — re-running it would push a second entry per open.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    setDragY(0);

    window.history.pushState({ [HISTORY_MARK]: true }, '');
    const onPop = (): void => onCloseRef.current();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') dismissSheet();
    };

    window.addEventListener('popstate', onPop);
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();

    return () => {
      window.removeEventListener('popstate', onPop);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  // ── drag to dismiss ───────────────────────────────────────────────────────
  // Only from the top of the sheet's own scroll, so dragging down through a
  // long list scrolls the list instead of throwing the sheet away.
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType === 'mouse') return;
    if ((panelRef.current?.scrollTop ?? 0) > 0) return;
    dragFrom.current = e.clientY;
  }, []);

  // Mirrored in a ref: `dismissSheet()` must never run inside a setState
  // updater — React may invoke the updater twice, and two `history.back()`
  // calls pop the page out from under the user instead of closing the sheet.
  const dragYRef = useRef(0);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (dragFrom.current === null) return;
    // Downward only — an upward pull should not lift the sheet off its edge.
    const y = Math.max(0, e.clientY - dragFrom.current);
    dragYRef.current = y;
    setDragY(y);
  }, []);

  const endDrag = useCallback(() => {
    if (dragFrom.current === null) return;
    dragFrom.current = null;
    const travelled = dragYRef.current;
    dragYRef.current = 0;
    setDragY(0);
    if (travelled > DISMISS_AFTER_PX) dismissSheet();
  }, []);

  if (!open) return null;

  return (
    // The scrim blurs what is behind it as well as dimming it: the sheet is a
    // layer, and a blurred backdrop says "that is still there, just not now"
    // far better than a flat tint over legible text competing for the eye.
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-canopy/45 backdrop-blur-md sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="بستن"
        onClick={dismissSheet}
        className="absolute inset-0 h-full w-full cursor-default"
      />
      <dialog
        ref={panelRef}
        open
        aria-modal="true"
        aria-label={title}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={dragY > 0 ? { transform: `translateY(${dragY}px)` } : undefined}
        // `m-0` is load-bearing: the UA sheet gives <dialog> `margin: auto`, and
        // auto margins on a flex item beat `align-items`, so without it the
        // sheet floats vertically centred with the page showing underneath —
        // the opposite of rising from the bottom edge into the thumb zone.
        className={`relative z-10 m-0 max-h-[88dvh] w-full touch-pan-y overflow-y-auto rounded-t-[28px] border-0 bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] text-fg shadow-pop sm:m-auto sm:max-w-md sm:rounded-lg sm:pb-5 ${
          dragFrom.current === null ? 'transition-transform duration-200' : ''
        }`}
      >
        {/* The drag handle — the affordance that says "you can throw me away". */}
        <span className="mx-auto mb-4 block h-1 w-11 rounded-full bg-border" />
        <h2 className="text-lg font-bold">{title}</h2>
        {description ? <p className="mt-1 text-[13px] text-fg-muted">{description}</p> : null}
        <div className="mt-4">{children}</div>
      </dialog>
    </div>
  );
}
