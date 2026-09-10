'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';

export type ToastVariant = 'success' | 'error' | 'info';

export interface ToastOptions {
  message: string;
  variant?: ToastVariant;
  actionLabel?: string;
  onAction?: () => void;
  /**
   * ms before auto-dismiss. docs/UX_UI_Spec.md: 4s default, except errors,
   * which persist until manually dismissed (pass a finite duration to
   * override this for a specific error toast if ever needed).
   */
  duration?: number;
}

interface ToastState extends ToastOptions {
  id: number;
}

const VARIANT_STYLES: Record<ToastVariant, string> = {
  success: 'bg-primary-700 text-white',
  error: 'bg-error text-white',
  info: 'bg-foreground text-white',
};

const ToastContext = createContext<{ show: (opts: ToastOptions) => void } | null>(null);

/**
 * Generic toast primitive (docs/UX_UI_Spec.md: success/error/info variants,
 * brief add-to-cart toast, 5-second undo toast on cart item removal) — not
 * cart-specific, so any page (admin CRUD included) can reuse it.
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
      // Errors persist until the user dismisses them; everything else auto-dismisses.
      if (opts.variant !== 'error' || opts.duration !== undefined) {
        window.setTimeout(() => dismiss(id), opts.duration ?? 4000);
      }
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
            role={t.variant === 'error' ? 'alert' : 'status'}
            className={`flex w-full max-w-sm items-center justify-between gap-3 rounded-[10px] px-4 py-3 text-sm shadow-lg ${VARIANT_STYLES[t.variant ?? 'info']}`}
          >
            <span>{t.message}</span>
            <div className="flex shrink-0 items-center gap-3">
              {t.actionLabel && (
                <button
                  type="button"
                  className="font-semibold underline underline-offset-2"
                  onClick={() => {
                    t.onAction?.();
                    dismiss(t.id);
                  }}
                >
                  {t.actionLabel}
                </button>
              )}
              <button
                type="button"
                aria-label="Dismiss"
                className="icon-button text-white/80 hover:text-white"
                onClick={() => dismiss(t.id)}
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
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
