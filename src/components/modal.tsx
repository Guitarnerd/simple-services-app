"use client";

// A pop-up, opened with `ref.current.showModal()`. Esc closes it.
export function Modal({ ref, labelledBy, wide, onClose, children }: { ref: React.Ref<HTMLDialogElement>; labelledBy?: string; wide?: boolean; onClose?: () => void; children: React.ReactNode }) {
  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      onClose={onClose}
      className={`m-auto max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-xl border border-line bg-surface-raised p-5 text-neutral-900 shadow-xl backdrop:bg-black/50 dark:text-white ${
        wide ? "w-[min(40rem,calc(100vw-2rem))]" : "w-[min(28rem,calc(100vw-2rem))]"
      }`}
    >
      {children}
    </dialog>
  );
}
