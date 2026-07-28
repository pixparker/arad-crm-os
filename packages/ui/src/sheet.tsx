'use client';

// BottomSheet — the mobile counterpart of Modal: enters from the bottom edge,
// sits in the thumb zone, and becomes a centred dialog once there is room for
// one. In the kit rather than in an app because the ＋ overlay, the guided
// post-create step and every future picker want the same behaviour (ADR-012,
// epic §5.6).
//
// Same contract as Modal: Escape closes, the backdrop closes, the body does
// not scroll behind it, and focus moves inside on open — a sheet that leaves
// focus on the page behind it is a keyboard trap in reverse.

import { type ReactNode, useEffect, useRef } from 'react';

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
  onClose: () => void;
  children: ReactNode;
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
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="بستن"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default"
      />
      <dialog
        ref={panelRef}
        open
        aria-modal="true"
        aria-label={title}
        className="relative z-10 max-h-[88dvh] w-full overflow-y-auto rounded-t-[28px] border-0 bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] text-fg shadow-pop sm:max-w-md sm:rounded-lg sm:pb-5"
      >
        <span className="mx-auto mb-4 block h-1 w-11 rounded-full bg-border" />
        <h2 className="text-lg font-bold">{title}</h2>
        {description ? <p className="mt-1 text-[13px] text-fg-muted">{description}</p> : null}
        <div className="mt-4">{children}</div>
      </dialog>
    </div>
  );
}
