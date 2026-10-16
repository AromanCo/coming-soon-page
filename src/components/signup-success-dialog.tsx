"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

type SignupSuccessDialogProps = {
  open: boolean;
  onClose: () => void;
};

const EXIT_DURATION_MS = 180;

export function SignupSuccessDialog({
  open,
  onClose,
}: SignupSuccessDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const primaryActionRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const isClosingRef = useRef(false);
  const [isClosing, setIsClosing] = useState(false);

  const finishClose = useCallback(() => {
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();

    document.body.classList.remove("has-modal-dialog");
    isClosingRef.current = false;
    setIsClosing(false);
    onClose();
  }, [onClose]);

  const requestClose = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (reduceMotion) {
      finishClose();
      return;
    }

    setIsClosing(true);
    closeTimerRef.current = window.setTimeout(finishClose, EXIT_DURATION_MS);
  }, [finishClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog || dialog.open) return;

    document.body.classList.add("has-modal-dialog");
    dialog.showModal();

    const frameId = window.requestAnimationFrame(() => {
      primaryActionRef.current?.focus();
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [open]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
      document.body.classList.remove("has-modal-dialog");
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="signup-success-dialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      data-closing={isClosing ? "true" : undefined}
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          requestClose();
          return;
        }

        if (event.key !== "Tab") return;

        const dialog = event.currentTarget;
        const focusableElements = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        );
        const firstElement = focusableElements.at(0);
        const lastElement = focusableElements.at(-1);

        if (
          event.shiftKey &&
          (document.activeElement === firstElement ||
            document.activeElement === dialog)
        ) {
          event.preventDefault();
          lastElement?.focus();
        } else if (!event.shiftKey && document.activeElement === lastElement) {
          event.preventDefault();
          firstElement?.focus();
        }
      }}
    >
      <div className="success-dialog-card" dir="rtl" lang="fa">
        <button
          className="success-dialog-close"
          type="button"
          aria-label="بستن پیام تأیید"
          onClick={requestClose}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>

        <div className="success-dialog-mark" aria-hidden="true">
          <svg viewBox="0 0 52 52">
            <circle cx="26" cy="26" r="24" />
            <path d="m15.5 26.5 7 7 14-15" />
          </svg>
        </div>

        <p className="success-dialog-eyebrow" dir="ltr" lang="en">
          WELCOME TO AROMAN
        </p>
        <h2 id={titleId}>به جمع آرومانی‌ها خوش اومدی!</h2>
        <p id={descriptionId}>
          درخواستت برای عضویت در لیست دعوت آرومان دریافت شد. با شروع تجربه
          آرومان، از همین مسیر باخبرت می‌کنیم.
        </p>

        <button
          ref={primaryActionRef}
          className="success-dialog-action"
          type="button"
          onClick={requestClose}
        >
          بازگشت به دنیای آرومان
        </button>
      </div>
    </dialog>
  );
}
