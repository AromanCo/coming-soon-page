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
      ? "فقط خبرهای مهم شروع آرومان را برایت می‌فرستیم."
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
        message: result.message ?? "ایمیلت با موفقیت ثبت شد.",
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
        اولین فصل داستان را از دست نده
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
          {isSubmitting ? "در حال ثبت…" : "از شروع آرومان باخبرم کن"}
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
          موافقم خبرهای شروع آرومان برایم ایمیل شود و{" "}
          <Link href="/privacy">اطلاعات حریم خصوصی</Link> را خوانده‌ام.
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

      <p
        className={"waitlist-status status-" + status.type}
        id={statusId}
        role="status"
        aria-live="polite"
      >
        {status.message}
      </p>
    </form>
  );
}
