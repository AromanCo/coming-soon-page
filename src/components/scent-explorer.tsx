"use client";

import Image from "next/image";
import { KeyboardEvent, useId, useState } from "react";

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

type MoodId = (typeof moods)[number]["id"];

export function ScentExplorer() {
  const titleId = useId();
  const [selectedId, setSelectedId] = useState<MoodId>("citrus");
  const selectedIndex = moods.findIndex((mood) => mood.id === selectedId);
  const selected = moods[selectedIndex];

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

    setSelectedId(nextMood.id);
    document.getElementById(`${titleId}-${nextMood.id}`)?.focus();
  }

  return (
    <section
      id="explorer"
      className={`explorer mood-${selected.id}`}
      aria-labelledby={titleId}
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
                onClick={() => setSelectedId(mood.id)}
                onKeyDown={(event) => handleKeyDown(event, index)}
              >
                <span className={`mood-icon ${mood.id}`} aria-hidden="true" />
                {mood.label}
              </button>
            ))}
          </div>
        </div>

        <article
          className="mood-preview"
          id={`${titleId}-panel`}
          role="tabpanel"
          aria-labelledby={`${titleId}-${selected.id}`}
        >
          <Image
            key={selected.id}
            src={selected.image}
            alt=""
            fill
            sizes="(max-width: 900px) calc(100vw - 48px), 56vw"
          />
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
