"use client";

import type { MouseEvent, MouseEventHandler, ReactNode } from "react";

type WaitlistLinkProps = {
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
};

export function WaitlistLink({
  children,
  className,
  ariaLabel,
  onClick,
}: WaitlistLinkProps) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (event.defaultPrevented) return;

    const form = document.getElementById("waitlist");
    const phoneInput = form?.querySelector<HTMLInputElement>('input[name="phone"]');

    if (!form || !phoneInput) return;

    event.preventDefault();

    if (window.location.hash !== "#waitlist") {
      window.history.pushState(null, "", "#waitlist");
    }

    if (!phoneInput.disabled) {
      phoneInput.focus({ preventScroll: true });
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
    <a
      className={className}
      href="#waitlist"
      aria-label={ariaLabel}
      onClick={handleClick}
    >
      {children}
    </a>
  );
}
