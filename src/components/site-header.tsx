"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { BrandMark } from "@/components/brand-mark";
import { WaitlistLink } from "@/components/waitlist-link";

type SiteHeaderProps = {
  variant?: "home" | "subpage";
  backLabel?: string;
};

const homeLinks = [
  { href: "#story", label: "داستان آرومان" },
  { href: "#paths", label: "مسیرهای رایحه" },
  { href: "#explorer", label: "کشف حال‌وهوا" },
] as const;

export function SiteHeader({
  variant = "home",
  backLabel = "بازگشت به آرومان",
}: SiteHeaderProps) {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuId = "site-mobile-navigation";
  const links = homeLinks.map((item) => ({
    ...item,
    href: variant === "home" ? item.href : `/${item.href}`,
  }));

  function closeMenu() {
    setIsMenuOpen(false);
  }

  function handlePanelLink(event: MouseEvent<HTMLAnchorElement>) {
    const targetUrl = new URL(event.currentTarget.href, window.location.href);
    closeMenu();

    if (
      !targetUrl.hash ||
      targetUrl.origin !== window.location.origin ||
      targetUrl.pathname !== window.location.pathname
    ) {
      return;
    }

    event.preventDefault();
    const hash = targetUrl.hash;
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    // Let the disclosure collapse before measuring the target's new position.
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const target = document.getElementById(decodeURIComponent(hash.slice(1)));
        if (!target) return;

        window.history.pushState(null, "", hash);
        target.scrollIntoView({
          behavior: prefersReducedMotion ? "auto" : "smooth",
          block: "start",
        });
        target.focus({ preventScroll: true });
      });
    });
  }

  useEffect(() => {
    if (!isMenuOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!headerRef.current?.contains(event.target as Node)) {
        closeMenu();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeMenu();
        menuButtonRef.current?.focus();
      }
    }

    const desktopQuery = window.matchMedia("(min-width: 901px)");
    function handleBreakpointChange(event: MediaQueryListEvent) {
      if (event.matches) closeMenu();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    desktopQuery.addEventListener("change", handleBreakpointChange);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      desktopQuery.removeEventListener("change", handleBreakpointChange);
    };
  }, [isMenuOpen]);

  return (
    <header className="site-header" ref={headerRef}>
      <div className="header-inner">
        <BrandMark compact />

        {variant === "home" && (
          <nav className="desktop-nav" aria-label="پیمایش اصلی">
            {homeLinks.map((item) => (
              <a href={item.href} key={item.href}>
                {item.label}
              </a>
            ))}
            <Link href="/scent-quest">بازی امضای رایحه</Link>
          </nav>
        )}

        <button
          ref={menuButtonRef}
          className="mobile-nav-toggle"
          type="button"
          aria-controls={menuId}
          aria-expanded={isMenuOpen}
          aria-label={
            isMenuOpen ? "بستن فهرست پیمایش" : "باز کردن فهرست پیمایش"
          }
          onClick={() => setIsMenuOpen((open) => !open)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {isMenuOpen ? (
              <path d="m6 6 12 12M18 6 6 18" />
            ) : (
              <path d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>

        {variant === "home" ? (
          <WaitlistLink
            className="header-cta"
            ariaLabel="عضویت در لیست دعوت"
            onClick={closeMenu}
          >
            <span className="header-cta-full">عضویت در لیست دعوت</span>
            <span className="header-cta-compact" aria-hidden="true">
              عضویت
            </span>
          </WaitlistLink>
        ) : (
          <Link className="back-link" href="/" onClick={closeMenu}>
            {backLabel}
          </Link>
        )}
      </div>

      <nav
        id={menuId}
        className="mobile-nav"
        aria-label="پیمایش اصلی"
        hidden={!isMenuOpen}
      >
        <p className="mobile-nav-heading">در آرومان بچرخ</p>
        <div className="mobile-nav-links">
          {links.map((item) => (
            <a href={item.href} key={item.href} onClick={handlePanelLink}>
              {item.label}
            </a>
          ))}
          <Link
            className="mobile-nav-quest"
            href="/scent-quest"
            aria-current={pathname === "/scent-quest" ? "page" : undefined}
            onClick={closeMenu}
          >
            <span className="mobile-nav-quest-kicker" dir="ltr" lang="en">
              AROMAN SCENT QUEST
            </span>
            <strong>بازی امضای رایحه</strong>
            <small>هفت انتخاب کوتاه · بدون ثبت‌نام</small>
            <span className="mobile-nav-arrow" aria-hidden="true">←</span>
          </Link>
        </div>
        {variant === "subpage" && (
          <Link
            className="mobile-nav-cta"
            href="/#waitlist"
            onClick={closeMenu}
          >
            عضویت در لیست دعوت
          </Link>
        )}
      </nav>
    </header>
  );
}
