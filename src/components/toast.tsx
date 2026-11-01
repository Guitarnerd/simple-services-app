"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type Toast = { id: number; message: string; action?: { label: string; run: () => void } };

// How long a message stays up, and so how long there is to press Undo.
const SHOW_MS = 6000;

const ToastContext = createContext<(message: string, action?: Toast["action"]) => void>(() => {});

// Shows a short message, optionally with one button ("Undo"):
//   const toast = useToast();
//   toast("Removed Sermon", { label: "Undo", run: putItBack });
export function useToast() {
  return useContext(ToastContext);
}

// One message at a time, at the top of the window so it clears the player and the phone tab bar.
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const count = useRef(0);

  const show = useCallback((message: string, action?: Toast["action"]) => {
    clearTimeout(timer.current);
    setToast({ id: ++count.current, message, action });
    timer.current = setTimeout(() => setToast(null), SHOW_MS);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-16 z-50 flex justify-center px-4 md:top-5 print:hidden">
        {toast && (
          <div
            key={toast.id}
            role="status"
            className="pointer-events-auto flex max-w-md items-center gap-3 rounded-xl bg-neutral-900 py-2 pl-4 pr-2 text-sm text-white shadow-xl ring-1 ring-white/10 dark:bg-neutral-100 dark:text-neutral-900"
          >
            <span className="min-w-0 truncate">{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  clearTimeout(timer.current);
                  setToast(null);
                  toast.action?.run();
                }}
                className="shrink-0 cursor-pointer rounded-lg px-3 py-1.5 font-semibold text-indigo-300 hover:bg-white/10 dark:text-indigo-700 dark:hover:bg-black/10"
              >
                {toast.action.label}
              </button>
            )}
            {!toast.action && <span className="w-2" />}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}
