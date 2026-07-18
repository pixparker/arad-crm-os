'use client';

// Modal — Esc closes, backdrop click closes, body scroll locked while open
// (ux-best-practices: lock-scroll-when-modal-open, back-friendly density for
// ops panels: modals stay small; heavy work gets its own page).

import { type ReactNode, useEffect, useRef } from 'react';

export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-[10vh]">
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: Esc is the keyboard path (handled above) */}
      <div
        className="fixed inset-0"
        onClick={onClose}
        role="presentation"
        style={{ backgroundColor: 'color-mix(in srgb, var(--ac-fg) 40%, transparent)' }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`relative w-full ${wide ? 'max-w-2xl' : 'max-w-md'} rounded-md border border-border bg-surface shadow-pop outline-none`}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="بستن"
            className="rounded-sm px-2 py-1 text-fg-muted hover:bg-surface-2 hover:text-fg"
          >
            ✕
          </button>
        </div>
        <div className="px-4 py-4">{children}</div>
      </div>
    </div>
  );
}
