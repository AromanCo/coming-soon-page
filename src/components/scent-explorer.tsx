"use client";

import { KeyboardEvent, useId, useState } from "react";

const moods = [
  {
    id: "citrus",
    label: "خنک و مرکباتی",
    title: "شروعی روشن و پرانرژی",
    description:
      "حال‌وهوایی شفاف و سرزنده؛ یادآور پوست ترنج، شکوفه نارنج و هوای تازه صبح.",
    notes: ["ترنج", "شکوفه نارنج", "هوای تازه"],
  },
  {
    id: "woody",
    label: "گرم و چوبی",
    title: "آرام، عمیق و دربرگیرنده",
    description:
      "فضایی گرم و متین؛ با تداعی چوب‌های نرم، ادویه ملایم و نور کهربایی غروب.",
    notes: ["چوب نرم", "ادویه", "کهربا"],
  },
  {
    id: "floral",
    label: "ملایم و گلی",
    title: "لطیف، روشن و صمیمی",
    description:
      "حسی نرم و آرام؛ یادآور گلبرگ‌های تازه، مشک لطیف و نسیمی میان باغ.",
    notes: ["گلبرگ", "مشک لطیف", "نسیم"],
  },
] as const;

type MoodId = (typeof moods)[number]["id"];

export function ScentExplorer() {
  const titleId = useId();
  const [selectedId, setSelectedId] = useState<MoodId>("citrus");
  const selectedIndex = moods.findIndex((mood) => mood.id === selectedId);
  const selected = moods[selectedIndex];

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) {
      return;
    }

    event.preventDefault();
    let nextIndex = selectedIndex;

    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = moods.length - 1;
    if (event.key === "ArrowRight") {
      nextIndex = (selectedIndex - 1 + moods.length) % moods.length;
    }
    if (event.key === "ArrowLeft") {
      nextIndex = (selectedIndex + 1) % moods.length;
    }

    const nextMood = moods[nextIndex];
    setSelectedId(nextMood.id);
    document.getElementById(`${titleId}-${nextMood.id}`)?.focus();
  }

  return (
    <section
      id="scent-explorer"
      className={`scent-explorer mood-${selected.id}`}
      aria-labelledby={titleId}
    >
      <div className="scent-explorer-inner page-frame">
        <div className="explorer-intro">
          <p className="section-kicker" dir="ltr" lang="en">
            SCENT EXPLORER
          </p>
          <h2 id={titleId}>امروز چه حال‌وهوایی را انتخاب می‌کنی؟</h2>
          <p>
            یکی را لمس کن؛ این انتخاب کوتاه فقط پنجره‌ای به دنیای رایحه‌هاست.
          </p>

          <div
            className="mood-tabs"
            role="tablist"
            aria-label="انتخاب حال‌وهوای رایحه"
          >
            {moods.map((mood) => (
              <button
                id={`${titleId}-${mood.id}`}
                key={mood.id}
                type="button"
                role="tab"
                aria-selected={selected.id === mood.id}
                aria-controls={`${titleId}-panel`}
                tabIndex={selected.id === mood.id ? 0 : -1}
                onClick={() => setSelectedId(mood.id)}
                onKeyDown={handleKeyDown}
              >
                <span aria-hidden="true" />
                {mood.label}
              </button>
            ))}
          </div>
        </div>

        <div
          className="mood-stage"
          id={`${titleId}-panel`}
          role="tabpanel"
          aria-live="polite"
          aria-labelledby={`${titleId}-${selected.id}`}
        >
          <div className="scent-vessel" aria-hidden="true">
            <span className="vessel-cap" />
            <span className="vessel-glass">
              <span className="vessel-liquid" />
            </span>
            <span className="scent-line scent-line-one" />
            <span className="scent-line scent-line-two" />
          </div>
          <div className="mood-copy">
            <span className="mood-count" aria-hidden="true">
              ۰{selectedIndex + 1} / ۰۳
            </span>
            <h3>{selected.title}</h3>
            <p>{selected.description}</p>
            <ul aria-label="تداعی‌های این حال‌وهوا">
              {selected.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
            <small>این توصیف‌ها برای آشنایی با حال‌وهوای رایحه‌ها هستند.</small>
          </div>
        </div>
      </div>
    </section>
  );
}
