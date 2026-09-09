'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export interface ToastOptions {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  /** ms before auto-dismiss. UX_UI_Spec.md: 5s for the cart-remove undo toast; shorter default elsewhere. */
  duration?: number;
}

interface ToastState extends ToastOptions {
  id: number;
}

const ToastContext = createContext<{ show: (opts: ToastOptions) => void } | null>(null);

/**
 * Generic toast primitive (docs/UX_UI_Spec.md: brief add-to-cart toast,
 * 5-second undo toast on cart item removal) — not cart-specific, so later
 * phases (checkout, wishlist) can reuse it instead of building their own.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastState[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (opts: ToastOptions) => {
      const id = ++idRef.current;
      setToasts((prev) => [...prev, { ...opts, id }]);
      window.setTimeout(() => dismiss(id), opts.duration ?? 4000);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div
        aria-live="polite"
        className="fixed inset-x-4 bottom-4 z-50 flex flex-col items-center gap-2 sm:bottom-6"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="bg-foreground flex w-full max-w-sm items-center justify-between gap-3 rounded-[10px] px-4 py-3 text-sm text-white shadow-lg"
          >
            <span>{t.message}</span>
            {t.actionLabel && (
              <button
                type="button"
                className="shrink-0 font-semibold underline underline-offset-2"
                onClick={() => {
                  t.onAction?.();
                  dismiss(t.id);
                }}
              >
                {t.actionLabel}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
