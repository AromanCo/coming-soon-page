"use client";

import Link from "next/link";
import { FormEvent, useId, useState } from "react";

type FormStatus =
  | { type: "idle"; message: string }
  | { type: "error"; message: string }
  | { type: "success"; message: string };

export function WaitlistForm({ configured }: { configured: boolean }) {
  const emailId = useId();
  const consentId = useId();
  const statusId = useId();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<FormStatus>({
    type: configured ? "idle" : "error",
    message: configured
      ? "دعوت‌نامه‌ها به‌تدریج و پیش از افتتاح عمومی ارسال می‌شوند."
      : "عضویت فعلاً در دسترس نیست؛ تنظیمات پایگاه داده هنوز کامل نشده است.",
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!configured || isSubmitting) return;

    const form = event.currentTarget;

    if (!form.reportValidity()) return;

    const formData = new FormData(form);
    setIsSubmitting(true);
    setStatus({ type: "idle", message: "در حال ثبت ایمیل…" });

    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.get("email"),
          consent: formData.get("consent") === "on",
          website: formData.get("website"),
        }),
      });
      const result = (await response.json()) as { message?: string };

      if (!response.ok) {
        setStatus({
          type: "error",
          message: result.message ?? "ثبت ایمیل انجام نشد. لطفاً دوباره تلاش کنید.",
        });
        return;
      }

      setStatus({
        type: "success",
        message:
          result.message ??
          "به لیست انتظار آرومان خوش آمدی! ثبت‌نامت انجام شد. خبرهای مربوط به دعوت‌نامه را با ایمیل برایت می‌فرستیم.",
      });
      form.reset();
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
      <label className="waitlist-label" htmlFor={emailId}>
        ایمیل برای دریافت دعوت‌نامه
      </label>
      <div className="waitlist-row">
        <input
          id={emailId}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          dir="ltr"
          placeholder="name@example.com"
          aria-describedby={statusId}
          disabled={!configured || isSubmitting}
          required
          maxLength={254}
        />
        <button type="submit" disabled={!configured || isSubmitting}>
          {isSubmitting ? "در حال ثبت…" : "دریافت دعوت‌نامه"}
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
          مایلم دعوت‌نامه و خبرهای مرتبط با شروع آرومان را با ایمیل دریافت کنم. {" "}
          <Link href="/privacy">اطلاعات حریم خصوصی</Link>
        </label>
      </div>

      <div className="honeypot" aria-hidden="true">
        <label htmlFor={emailId + "-website"}>وب‌سایت</label>
        <input
          id={emailId + "-website"}
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
