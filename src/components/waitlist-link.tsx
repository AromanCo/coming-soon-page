"use client";

import type { MouseEvent, ReactNode } from "react";

type WaitlistLinkProps = {
  children: ReactNode;
  className?: string;
};

export function WaitlistLink({ children, className }: WaitlistLinkProps) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    const form = document.getElementById("waitlist");
    const emailInput = form?.querySelector<HTMLInputElement>('input[name="email"]');

    if (!form || !emailInput) return;

    event.preventDefault();

    if (window.location.hash !== "#waitlist") {
      window.history.pushState(null, "", "#waitlist");
    }

    if (!emailInput.disabled) {
      emailInput.focus({ preventScroll: true });
    }

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    form.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "center",
    });
  }

  return (
    <a className={className} href="#waitlist" onClick={handleClick}>
      {children}
    </a>
  );
}
