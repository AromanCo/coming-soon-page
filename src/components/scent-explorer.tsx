"use client";

import Image from "next/image";
import { useScentJourney, type ScentMoodId } from "@/components/scent-journey-context";
import {
  KeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

const moods = [
  {
    id: "citrus",
    label: "خنک و مرکباتی",
    title: "روشن، پرانرژی و زنده",
    description:
      "شروعی درخشان با طراوت مرکبات، برگ‌های سبز و نوری که حال‌وهوای یک صبح تازه را به همراه می‌آورد.",
    notes: ["ترنج", "شکوفه نارنج", "چای سبز"],
    image: "/images/scent-citrus.jpg",
  },
  {
    id: "woody",
    label: "گرم و چوبی",
    title: "عمیق، آرام و ماندگار",
    description:
      "ترکیبی آرام از چوب سدر، گرمای کهربا و ادویه‌های نرم؛ رایحه‌ای برای لحظه‌های صمیمی و آرام.",
    notes: ["چوب سدر", "کهربا", "وانیل"],
    image: "/images/scent-woody.jpg",
  },
  {
    id: "floral",
    label: "ملایم و گلی",
    title: "لطیف، خیال‌انگیز و شاعرانه",
    description:
      "لایه‌هایی ظریف از گلبرگ‌های تازه، رایحه رز و انعکاس‌های یاسی؛ نرم، روشن و به‌یادماندنی.",
    notes: ["گل رز", "زنبق", "مشک سفید"],
    image: "/images/scent-floral.jpg",
  },
] as const;

const DEFAULT_AUTOPLAY_INTERVAL_MS = 7_000;
const MIN_AUTOPLAY_INTERVAL_MS = 1_000;

type MoodId = ScentMoodId;

export function ScentExplorer({
  autoplayIntervalMs = DEFAULT_AUTOPLAY_INTERVAL_MS,
}: {
  autoplayIntervalMs?: number;
}) {
  const { chooseMood, chosenMood } = useScentJourney();
  const titleId = useId();
  const explorerRef = useRef<HTMLElement>(null);
  const [selectedId, setSelectedId] = useState<MoodId>("citrus");
  const [isMeaningfullyVisible, setIsMeaningfullyVisible] = useState(false);
  const [isDocumentVisible, setIsDocumentVisible] = useState(true);
  const [isHovering, setIsHovering] = useState(false);
  const [hasFocusWithin, setHasFocusWithin] = useState(false);
  const [isUserPaused, setIsUserPaused] = useState(false);
  const [hasManualSelection, setHasManualSelection] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const selectedIndex = moods.findIndex((mood) => mood.id === selectedId);
  const selected = moods[selectedIndex];
  const safeIntervalMs =
    Number.isFinite(autoplayIntervalMs) &&
    autoplayIntervalMs >= MIN_AUTOPLAY_INTERVAL_MS
      ? autoplayIntervalMs
      : DEFAULT_AUTOPLAY_INTERVAL_MS;
  const canAutoplay =
    isMeaningfullyVisible &&
    isDocumentVisible &&
    !isHovering &&
    !hasFocusWithin &&
    !isUserPaused &&
    !hasManualSelection &&
    !prefersReducedMotion;

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsDocumentVisible(!document.hidden);
    };

    handleVisibilityChange();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleMotionPreference = () => {
      setPrefersReducedMotion(mediaQuery.matches);
    };

    handleMotionPreference();
    mediaQuery.addEventListener("change", handleMotionPreference);
    return () => {
      mediaQuery.removeEventListener("change", handleMotionPreference);
    };
  }, []);

  useEffect(() => {
    const explorer = explorerRef.current;
    if (!explorer) return;

    const handleFocusIn = () => setHasFocusWithin(true);
    const handleFocusOut = (event: globalThis.FocusEvent) => {
      if (!explorer.contains(event.relatedTarget as Node | null)) {
        setHasFocusWithin(false);
      }
    };

    explorer.addEventListener("focusin", handleFocusIn);
    explorer.addEventListener("focusout", handleFocusOut);
    return () => {
      explorer.removeEventListener("focusin", handleFocusIn);
      explorer.removeEventListener("focusout", handleFocusOut);
    };
  }, []);

  useEffect(() => {
    const explorer = explorerRef.current;
    if (!explorer) return;

    if (!("IntersectionObserver" in window)) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsMeaningfullyVisible(
          entry.isIntersecting && entry.intersectionRatio >= 0.35,
        );
      },
      { threshold: [0, 0.2, 0.35, 0.5, 0.75] },
    );

    observer.observe(explorer);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!canAutoplay) return;

    const timerId = window.setTimeout(() => {
      setSelectedId((currentId) => {
        const currentIndex = moods.findIndex((mood) => mood.id === currentId);
        return moods[(currentIndex + 1) % moods.length].id;
      });
    }, safeIntervalMs);

    return () => window.clearTimeout(timerId);
  }, [canAutoplay, safeIntervalMs, selectedId]);

  function selectMood(nextId: MoodId) {
    setHasManualSelection(true);
    setSelectedId(nextId);
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ) {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) {
      return;
    }

    event.preventDefault();
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? moods.length - 1
          : event.key === "ArrowLeft"
            ? (currentIndex + 1) % moods.length
            : (currentIndex - 1 + moods.length) % moods.length;
    const nextMood = moods[nextIndex];

    selectMood(nextMood.id);
    document.getElementById(`${titleId}-${nextMood.id}`)?.focus();
  }

  const autoplayControlDisabled = hasManualSelection || prefersReducedMotion;

  function continueToWaitlist() {
    chooseMood(selected.id);
    setHasManualSelection(true);
    const form = document.getElementById("waitlist");
    const input = form?.querySelector<HTMLInputElement>('input[name="phone"]');
    if (!form) return;
    if (window.location.hash !== "#waitlist") {
      window.history.pushState(null, "", "#waitlist");
    }
    form.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "center",
    });
    if (input && !input.disabled) {
      input.focus({ preventScroll: true });
    }
  }

  return (
    <section
      ref={explorerRef}
      id="explorer"
      className={`explorer mood-${selected.id}`}
      aria-labelledby={titleId}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <div className="explorer-glow" aria-hidden="true" />
      <div className="section-shell explorer-grid">
        <div className="explorer-intro">
          <p className="kicker light" dir="ltr" lang="en">
            <span aria-hidden="true" /> SCENT EXPLORER
          </p>
          <h2 id={titleId}>امروز چه حال‌وهوایی را انتخاب می‌کنی؟</h2>
          <p>
            با یک انتخاب ساده، دنیای رایحه‌های مناسب حال‌وهوای خودت را کشف کن؛
            این پیش‌نمایش، شروع قصه رایحه توست.
          </p>

          <div
            className="mood-tabs"
            role="tablist"
            aria-label="انتخاب حال‌وهوای رایحه"
          >
            {moods.map((mood, index) => (
              <button
                id={`${titleId}-${mood.id}`}
                key={mood.id}
                type="button"
                role="tab"
                aria-selected={selected.id === mood.id}
                aria-controls={`${titleId}-panel`}
                tabIndex={selected.id === mood.id ? 0 : -1}
                className={selected.id === mood.id ? "active" : undefined}
                onClick={() => selectMood(mood.id)}
                onKeyDown={(event) => handleKeyDown(event, index)}
              >
                <span className={`mood-icon ${mood.id}`} aria-hidden="true" />
                {mood.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="mood-continue"
            onClick={continueToWaitlist}
          >
            <span>ادامه با رایحه {selected.label}</span>
            <span aria-hidden="true">←</span>
          </button>
          <p className="mood-journey-note">
            {chosenMood === selected.id
              ? "انتخابت در فرم دعوت نمایش داده می‌شود."
              : "انتخاب رایحه اختیاری است و برای ثبت‌نام ذخیره نمی‌شود."}
          </p>

          {!autoplayControlDisabled ? (
            <button
              type="button"
              className="autoplay-control"
              aria-pressed={isUserPaused}
              aria-label={
                isUserPaused
                  ? "ادامه نمایش خودکار"
                  : "توقف نمایش خودکار"
              }
              onClick={() => setIsUserPaused((current) => !current)}
            >
              {isUserPaused ? (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m9 7 8 5-8 5V7Z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M9 7v10M15 7v10" />
                </svg>
              )}
            </button>
          ) : null}
        </div>

        <article
          className="mood-preview"
          id={`${titleId}-panel`}
          role="tabpanel"
          aria-labelledby={`${titleId}-${selected.id}`}
        >
          <div className="mood-image-stack" aria-hidden="true">
            {moods.map((mood) => (
              <Image
                key={mood.id}
                className={
                  selected.id === mood.id
                    ? "mood-image is-active"
                    : "mood-image"
                }
                src={mood.image}
                alt=""
                fill
                sizes="(max-width: 900px) calc(100vw - 48px), 56vw"
              />
            ))}
          </div>
          <div className="mood-scrim" aria-hidden="true" />
          <div className="mood-copy" key={`${selected.id}-copy`}>
            <p>{selected.label}</p>
            <h3>{selected.title}</h3>
            <p>{selected.description}</p>
            <ul aria-label="نت‌های رایحه">
              {selected.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        </article>
      </div>
    </section>
  );
}
