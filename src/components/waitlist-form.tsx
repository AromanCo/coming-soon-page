"use client";

import Link from "next/link";
import { SCENT_MOOD_LABELS, useScentJourney } from "@/components/scent-journey-context";
import { FormEvent, useEffect, useId, useRef, useState } from "react";
import { SignupSuccessDialog } from "@/components/signup-success-dialog";
import { normalizeIranianMobile } from "@/lib/iranian-mobile";

type FormStatus =
  | { type: "idle"; message: string }
  | { type: "pending"; message: string }
  | { type: "error"; message: string };

function ArrowIcon() {
  return (
    <svg className="arrow-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function WaitlistForm({ configured }: { configured: boolean }) {
  const { chosenMood, clearMood } = useScentJourney();
  const phoneId = useId();
  const phoneHintId = useId();
  const consentId = useId();
  const consentHintId = useId();
  const statusId = useId();
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const submissionInFlightRef = useRef(false);
  const shouldRestoreFocusRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasAcceptedSubmission, setHasAcceptedSubmission] = useState(false);
  const [isSuccessDialogOpen, setIsSuccessDialogOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const normalizedPhone = normalizeIranianMobile(phone);
  const [status, setStatus] = useState<FormStatus>({
    type: configured ? "idle" : "error",
    message: configured
      ? "دعوت‌نامه‌ها به‌صورت مرحله‌ای ارسال می‌شوند."
      : "عضویت فعلاً در دسترس نیست؛ تنظیمات پایگاه داده هنوز کامل نشده است.",
  });

  useEffect(() => {
    if (
      shouldRestoreFocusRef.current &&
      !isSuccessDialogOpen &&
      !hasAcceptedSubmission
    ) {
      shouldRestoreFocusRef.current = false;
      phoneInputRef.current?.focus();
    }
  }, [hasAcceptedSubmission, isSuccessDialogOpen]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      !configured ||
      isSubmitting ||
      hasAcceptedSubmission ||
      submissionInFlightRef.current
    ) {
      return;
    }

    const form = event.currentTarget;
    const phoneInput = form.elements.namedItem("phone") as HTMLInputElement;
    phoneInput.setCustomValidity("");

    if (!form.reportValidity()) return;

    const formData = new FormData(form);
    const submittedPhone = formData.get("phone");

    if (
      typeof submittedPhone !== "string" ||
      !normalizeIranianMobile(submittedPhone)
    ) {
      const message = "لطفاً یک شماره موبایل معتبر وارد کنید.";
      phoneInput.setCustomValidity(message);
      phoneInput.reportValidity();
      setStatus({ type: "error", message });
      return;
    }

    submissionInFlightRef.current = true;
    setIsSubmitting(true);
    setStatus({ type: "pending", message: "در حال بررسی و ثبت شماره موبایل…" });

    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: submittedPhone,
          consent: formData.get("consent") === "on",
          website: formData.get("website"),
        }),
      });
      const result = (await response.json()) as {
        code?: string;
        message?: string;
      };

      if (response.status !== 202 || result.code !== "REQUEST_ACCEPTED") {
        setStatus({
          type: "error",
          message:
            result.message ??
            "ثبت شماره موبایل انجام نشد. لطفاً دوباره تلاش کنید.",
        });
        return;
      }

      setStatus({
        type: "idle",
        message: "دعوت‌نامه‌ها به‌صورت مرحله‌ای ارسال می‌شوند.",
      });
      setHasAcceptedSubmission(true);
      setIsSuccessDialogOpen(true);
      form.reset();
      setPhone("");
      setConsent(false);
    } catch {
      setStatus({
        type: "error",
        message: "ارتباط با سامانه برقرار نشد. لطفاً دوباره تلاش کنید.",
      });
    } finally {
      submissionInFlightRef.current = false;
      setIsSubmitting(false);
    }
  }

  const submitDisabled =
    !configured ||
    isSubmitting ||
    hasAcceptedSubmission ||
    normalizedPhone === null ||
    !consent;

  return (
    <>
      <form
        className="waitlist-form"
        id="waitlist"
        tabIndex={-1}
        onSubmit={handleSubmit}
        aria-busy={isSubmitting}
        noValidate
      >
        {chosenMood && (
          <div className="chosen-mood-summary" role="status">
            <div>
              <span>انتخاب رایحه تو</span>
              <strong>{SCENT_MOOD_LABELS[chosenMood]}</strong>
              <small>این انتخاب فقط در همین صفحه نمایش داده می‌شود و همراه شماره ارسال یا ذخیره نمی‌شود.</small>
            </div>
            <button type="button" onClick={clearMood} aria-label="حذف انتخاب رایحه">
              حذف انتخاب
            </button>
          </div>
        )}
        <label className="field-label" htmlFor={phoneId}>
          شماره موبایل برای عضویت در لیست دعوت
        </label>

        <div className="signup-row">
          <div className="input-wrap">
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M7.5 3.5h5l1 4-2 1.5c1.2 3 2.5 4.3 5.5 5.5l1.5-2 3 1v4c0 2-1.5 3-3.5 3C10 19.5 4.5 14 3 6c0-2 1.5-3 4.5-2.5Z" />
            </svg>
            <input
              ref={phoneInputRef}
              id={phoneId}
              name="phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              dir="ltr"
              value={phone}
              placeholder="۰۹۱۲ ۱۲۳ ۴۵۶۷"
              aria-describedby={`${phoneHintId} ${statusId}`}
              aria-invalid={phone.length > 0 && normalizedPhone === null}
              onChange={(event) => {
                event.currentTarget.setCustomValidity("");
                setPhone(event.currentTarget.value);
              }}
              disabled={!configured || isSubmitting || hasAcceptedSubmission}
              required
              minLength={11}
              maxLength={24}
              pattern="[0-9۰-۹٠-٩+ -]+"
            />
            <span className="visually-hidden" id={phoneHintId}>
              نمونه شماره معتبر: ۰۹۱۲ ۱۲۳ ۴۵۶۷
            </span>
          </div>

          <button
            className={`primary-button${isSubmitting ? " is-pending" : ""}`}
            type="submit"
            disabled={submitDisabled}
          >
            <span>{isSubmitting ? "در حال ثبت…" : "عضویت در لیست دعوت"}</span>
            {isSubmitting ? (
              <span className="loading-mark" aria-hidden="true" />
            ) : (
              <ArrowIcon />
            )}
          </button>
        </div>

        <div className="consent-row">
          <label className="consent" htmlFor={consentId}>
            <input
              id={consentId}
              name="consent"
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.currentTarget.checked)}
              disabled={!configured || isSubmitting || hasAcceptedSubmission}
              aria-describedby={consentHintId}
              required
            />
            <span className="checkmark" aria-hidden="true" />
            <span>
              مایلم دعوت‌نامه و خبرهای شروع آرومان را با پیامک دریافت کنم.
            </span>
          </label>
        </div>

        <div className="form-meta" id={consentHintId}>
          <Link href="/privacy">اطلاعات حریم خصوصی</Link>
          <div
            className={`waitlist-status status-${status.type}`}
            id={statusId}
            role={status.type === "error" ? "alert" : "status"}
            aria-live="polite"
            aria-busy={status.type === "pending"}
          >
            <span>{status.message}</span>
          </div>
        </div>

        <div className="honeypot" aria-hidden="true">
          <label htmlFor={`${phoneId}-website`}>وب‌سایت</label>
          <input
            id={`${phoneId}-website`}
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
          />
        </div>
      </form>

      <SignupSuccessDialog
        open={isSuccessDialogOpen}
        onClose={() => {
          shouldRestoreFocusRef.current = true;
          setIsSuccessDialogOpen(false);
          setHasAcceptedSubmission(false);
        }}
      />
    </>
  );
}
