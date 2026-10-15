"use client";

import Link from "next/link";
import { FormEvent, useId, useState } from "react";
import { normalizeIranianMobile } from "@/lib/iranian-mobile";

type FormStatus =
  | { type: "idle"; message: string }
  | { type: "error"; message: string }
  | { type: "success"; message: string };

export function WaitlistForm({ configured }: { configured: boolean }) {
  const phoneId = useId();
  const phoneHintId = useId();
  const consentId = useId();
  const statusId = useId();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasValidFormat, setHasValidFormat] = useState(false);
  const [status, setStatus] = useState<FormStatus>({
    type: configured ? "idle" : "error",
    message: configured
      ? "دعوت‌نامه‌ها به‌صورت مرحله‌ای ارسال می‌شوند."
      : "عضویت فعلاً در دسترس نیست؛ تنظیمات پایگاه داده هنوز کامل نشده است.",
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!configured || isSubmitting) return;

    const form = event.currentTarget;
    const phoneInput = form.elements.namedItem("phone") as HTMLInputElement;
    phoneInput.setCustomValidity("");

    if (!form.reportValidity()) return;

    const formData = new FormData(form);
    const phone = formData.get("phone");

    if (typeof phone !== "string" || !normalizeIranianMobile(phone)) {
      const message = "لطفاً یک شماره موبایل معتبر وارد کنید.";
      phoneInput.setCustomValidity(message);
      phoneInput.reportValidity();
      setStatus({ type: "error", message });
      return;
    }

    setIsSubmitting(true);
    setStatus({ type: "idle", message: "در حال ثبت شماره موبایل…" });

    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          consent: formData.get("consent") === "on",
          website: formData.get("website"),
        }),
      });
      const result = (await response.json()) as { message?: string };

      if (!response.ok) {
        setStatus({
          type: "error",
          message:
            result.message ??
            "ثبت شماره موبایل انجام نشد. لطفاً دوباره تلاش کنید.",
        });
        return;
      }

      setStatus({
        type: "success",
        message:
          result.message ??
          "ممنون! شماره‌ات برای لیست دعوت آرومان دریافت شد.",
      });
      form.reset();
      setHasValidFormat(false);
    } catch {
      setStatus({
        type: "error",
        message: "ارتباط با سامانه برقرار نشد. لطفاً دوباره تلاش کنید.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="waitlist-form" id="waitlist" onSubmit={handleSubmit} noValidate>
      <div className="waitlist-label-row">
        <label className="waitlist-label" htmlFor={phoneId}>
          شماره موبایل برای عضویت در لیست دعوت
        </label>
        <span
          className="phone-format-hint"
          id={phoneHintId}
          aria-live="polite"
        >
          {hasValidFormat ? "قالب شماره معتبر است" : ""}
        </span>
      </div>
      <div className="waitlist-row">
        <input
          id={phoneId}
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          dir="ltr"
          placeholder="۰۹۱۲ ۱۲۳ ۴۵۶۷"
          aria-describedby={`${phoneHintId} ${statusId}`}
          onChange={(event) => {
            event.currentTarget.setCustomValidity("");
            setHasValidFormat(
              normalizeIranianMobile(event.currentTarget.value) !== null,
            );
          }}
          disabled={!configured || isSubmitting}
          required
          minLength={11}
          maxLength={24}
          pattern="[0-9۰-۹٠-٩+ -]+"
        />
        <button type="submit" disabled={!configured || isSubmitting}>
          {isSubmitting ? "در حال ثبت…" : "عضویت در لیست دعوت"}
        </button>
      </div>

      <div className="consent-row">
        <input
          id={consentId}
          name="consent"
          type="checkbox"
          disabled={!configured || isSubmitting}
          required
        />
        <label htmlFor={consentId}>
          مایلم دعوت‌نامه و خبرهای شروع آرومان را با پیامک دریافت کنم. {" "}
          <Link href="/privacy">اطلاعات حریم خصوصی</Link>
        </label>
      </div>

      <div className="honeypot" aria-hidden="true">
        <label htmlFor={phoneId + "-website"}>وب‌سایت</label>
        <input
          id={phoneId + "-website"}
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <div
        className={"waitlist-status status-" + status.type}
        id={statusId}
        role="status"
        aria-live="polite"
      >
        {status.type === "success" ? (
          <span className="success-mark" aria-hidden="true">✓</span>
        ) : null}
        <span>{status.message}</span>
      </div>
    </form>
  );
}
