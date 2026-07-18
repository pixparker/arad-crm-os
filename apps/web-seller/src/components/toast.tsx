'use client';

// Lightweight toast surface — feedback for optimistic actions and API errors
// (ux-best-practices: feedback for every action; rollback must be told).

import { type ReactNode, createContext, useCallback, useContext, useRef, useState } from 'react';

type Tone = 'default' | 'success' | 'danger';

interface Toast {
  id: number;
  message: string;
  tone: Tone;
}

const ToastContext = createContext<(message: string, tone?: Tone) => void>(() => undefined);

export const useToast = () => useContext(ToastContext);

const dotClass: Record<Tone, string> = {
  default: 'bg-fg-muted',
  success: 'bg-success',
  danger: 'bg-danger',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const push = useCallback((message: string, tone: Tone = 'default') => {
    const id = nextId.current++;
    setToasts((prev) => [...prev.slice(-2), { id, message, tone }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-6"
      >
        {toasts.map((t) => (
          <output
            key={t.id}
            className="toast-in flex max-w-full items-center gap-2 rounded-full bg-fg px-4 py-2.5 text-sm font-medium text-bg shadow-lg"
          >
            <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass[t.tone]}`} />
            <span className="truncate">{t.message}</span>
          </output>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
