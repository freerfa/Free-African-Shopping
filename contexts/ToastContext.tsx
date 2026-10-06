import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

type ToastTone = 'success' | 'error';

interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastContextValue {
  /** Shows a transient message. Errors stay until dismissed or expire. */
  toast: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const toneClass: Record<ToastTone, string> = {
  success: 'bg-green-600 text-white',
  error: 'bg-red-600 text-white',
};

/** Mount once, near the root, then call useToast() from anywhere below it. */
export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, tone: ToastTone = 'success') => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, message, tone }]);
      window.setTimeout(() => dismiss(id), 3500);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* aria-live so screen readers announce the message without stealing focus. */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 items-end pointer-events-none"
      >
        {toasts.map((t) => (
          <button
            key={t.id}
            onClick={() => dismiss(t.id)}
            className={`${toneClass[t.tone]} pointer-events-auto px-4 py-3 rounded-lg shadow-lg text-sm font-medium max-w-xs text-left transition-transform hover:scale-[1.02]`}
          >
            {t.message}
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextValue => {
  const context = useContext(ToastContext);
  if (context === undefined) throw new Error('useToast must be used within a ToastProvider');
  return context;
};