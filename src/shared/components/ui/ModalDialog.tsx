import { useEffect, useRef } from "react";

interface ModalDialogProps {
  titleId: string;
  onClose: () => void;
  opener?: HTMLElement | null;
  children: React.ReactNode;
  className?: string;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

function getFocusableElements(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

export default function ModalDialog({
  titleId,
  onClose,
  opener,
  children,
  className = "",
}: ModalDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const openerElement =
      opener ?? (document.activeElement as HTMLElement | null);
    const dialog = dialogRef.current;
    if (!dialog) return;

    const initialFocus =
      dialog.querySelector<HTMLElement>(
        "[data-dialog-initial-focus], [autofocus]",
      ) ?? getFocusableElements(dialog)[0];
    initialFocus?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const focusableElements = getFocusableElements(dialog);
      if (focusableElements.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (
        openerElement &&
        openerElement !== document.body &&
        openerElement.isConnected
      ) {
        openerElement.focus();
      }
    };
  }, [opener]);

  return (
    <div
      data-trip-dialog-overlay
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-4 backdrop-blur-sm sm:items-center"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-trip-dialog
        className={`max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-3xl border border-slate-200 bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl focus:outline-none dark:border-slate-800 dark:bg-slate-950 sm:p-6 ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
