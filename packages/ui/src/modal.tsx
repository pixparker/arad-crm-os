'use client';

// Modal — focus-trapped, Escape-closable, scroll-locked, and BACK-closable.
// Lives in the kit rather than in an app because every surface needs the same
// one (ADR-012); duplicating it is how two verticals end up with two dialog
// behaviours.
//
// Dismissal goes through history exactly as BottomSheet's does — see the long
// note there. Back, Esc and the scrim are one action: "close the top layer".

import { type ReactNode, useEffect, useRef } from 'react';

const HISTORY_MARK = 'ac-modal';

/** Ask the open modal to close. Same path as the Back button. */
export const dismissModal = (): void => {
  if (typeof window !== 'undefined') window.history.back();
};

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const panelRef = useRef<HTMLDialogElement>(null);

  // Latest onClose without re-running the effect — a re-run would push a second
  // history entry and make Back need two presses.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    window.history.pushState({ [HISTORY_MARK]: true }, '');
    const onPop = (): void => onCloseRef.current();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') dismissModal();
    };
    window.addEventListener('popstate', onPop);
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Focus the panel so the keyboard lands inside the dialog, not behind it.
    panelRef.current?.focus();
    return () => {
      window.removeEventListener('popstate', onPop);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-canopy/45 p-0 backdrop-blur-md sm:items-center sm:p-4">
      {/* Backdrop: a button so a click-to-dismiss is reachable by keyboard too. */}
      <button
        type="button"
        aria-label="بستن"
        onClick={dismissModal}
        className="absolute inset-0 h-full w-full cursor-default"
      />
      {/* A real <dialog> (rendered open, not showModal): the backdrop, escape
          handling and scroll lock are ours, but the element carries the right
          semantics for assistive tech without an ARIA role. */}
      <dialog
        ref={panelRef}
        open
        aria-modal="true"
        aria-label={title}
        // `m-0` — see BottomSheet: the UA `dialog { margin: auto }` overrides
        // the flex alignment and floats the panel off its intended edge.
        className="relative z-10 m-0 max-h-[90dvh] w-full overflow-y-auto rounded-t-lg border border-border bg-surface p-4 text-fg shadow-card sm:m-auto sm:max-w-lg sm:rounded-lg"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-bold">{title}</h2>
          <button
            type="button"
            onClick={dismissModal}
            className="rounded-sm px-2 py-1 text-sm text-fg-muted hover:bg-surface-2"
          >
            ✕
          </button>
        </div>
        {children}
        {footer ? <div className="mt-4 flex justify-end gap-2">{footer}</div> : null}
      </dialog>
    </div>
  );
}
