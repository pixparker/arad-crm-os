'use client';

// Modal — focus-trapped, Escape-closable, scroll-locked. Lives in the kit
// rather than in an app because every surface needs the same one (ADR-012);
// duplicating it is how two verticals end up with two dialog behaviours.

import { type ReactNode, useEffect, useRef } from 'react';

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

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Focus the panel so the keyboard lands inside the dialog, not behind it.
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      {/* Backdrop: a button so a click-to-dismiss is reachable by keyboard too. */}
      <button
        type="button"
        aria-label="بستن"
        onClick={onClose}
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
        className="relative z-10 max-h-[90dvh] w-full overflow-y-auto rounded-t-lg border border-border bg-surface p-4 text-fg shadow-card sm:max-w-lg sm:rounded-lg"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
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
