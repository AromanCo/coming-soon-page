"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import quiz from "@/lib/scent-quest/quiz-data.json";
import { AromanEmblem } from "@/components/aroman-emblem";
import { ScentProductImage } from "@/components/scent-product-image";
import { scentQuestOptionImages } from "@/lib/scent-quest/option-images";
import {
  rankScentQuest,
  type ScentAnswers,
  type ScentChoice,
  type ScentPerfume,
  type ScentResult,
  type ScentStage,
} from "@/lib/scent-quest/scoring";

type Screen = "intro" | "question" | "loading" | "result" | "error";
type MiniPlatform = "browser" | "bale" | "telegram";

type NativeMiniBridge = {
  ready?: () => void;
  expand?: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  BackButton?: {
    show?: () => void;
    hide?: () => void;
    onClick?: (cb: () => void) => void;
    offClick?: (cb: () => void) => void;
  };
  HapticFeedback?: { selectionChanged?: () => void };
};

declare global {
  interface Window {
    Telegram?: { WebApp?: NativeMiniBridge };
    Bale?: { WebApp?: NativeMiniBridge };
  }
}

const persian = (n: number) => new Intl.NumberFormat("fa-IR").format(n);
const stages = {
  quick: quiz.stage1_questions,
  deep: quiz.stage2_questions,
} as const;
const choices = ["الف", "ب", "ج", "د"] as const;
let catalogRequest: Promise<ScentPerfume[]> | undefined;

function readCatalog() {
  if (!catalogRequest) {
    catalogRequest = fetch("/data/scent-quest-perfumes.json")
      .then(async (response) => {
        if (!response.ok) throw Error("Catalog unavailable");
        const data: unknown = await response.json();
        if (!Array.isArray(data) || data.length !== 900) throw Error("Invalid catalog");
        return data as ScentPerfume[];
      })
      .catch((error: unknown) => {
        catalogRequest = undefined;
        throw error;
      });
  }
  return catalogRequest;
}

/** A platform hint only selects a display adapter; never trust it for authentication. */
export function getMiniPlatform(search: string): MiniPlatform {
  const value = new URLSearchParams(search).get("provider");
  return value === "bale" || value === "telegram" ? value : "browser";
}

export function ScentQuestMini() {
  const [screen, setScreen] = useState<Screen>("intro");
  const [stage, setStage] = useState<ScentStage>("quick");
  const [position, setPosition] = useState(0);
  const [answers, setAnswers] = useState<Partial<ScentAnswers>>({});
  const [result, setResult] = useState<ScentResult | null>(null);
  const [quickResult, setQuickResult] = useState<ScentResult | null>(null);
  const [notice, setNotice] = useState("");
  const [provider, setProvider] = useState<MiniPlatform>("browser");
  const bridge = useRef<NativeMiniBridge | null>(null);
  const actionLock = useRef(false);

  const restart = useCallback(() => {
    actionLock.current = false;
    setScreen("intro");
    setStage("quick");
    setPosition(0);
    setAnswers({});
    setResult(null);
    setQuickResult(null);
    setNotice("");
  }, []);

  const back = useCallback(() => {
    if (screen === "question") {
      if (position > 0) setPosition((value) => value - 1);
      else if (stage === "deep" && quickResult) {
        setStage("quick");
        setResult(quickResult);
        setScreen("result");
      } else setScreen("intro");
    } else if (screen === "result" && stage === "deep" && quickResult) {
      setStage("quick");
      setResult(quickResult);
    } else if (screen !== "intro") {
      setScreen("intro");
    }
    actionLock.current = false;
  }, [position, quickResult, screen, stage]);

  // In-memory state only: no URL-history mutation (important for Bale Web Mini Apps).
  useEffect(() => {
    const selected = getMiniPlatform(window.location.search);
    setProvider(selected);
    if (selected === "browser") return;
    const script = document.createElement("script");
    script.src = selected === "bale"
      ? "https://tapi.bale.ai/miniapp.js"
      : "https://telegram.org/js/telegram-web-app.js?65";
    script.async = true;
    script.onload = () => {
      const api = selected === "bale" ? window.Bale?.WebApp : window.Telegram?.WebApp;
      if (!api) return;
      bridge.current = api;
      try {
        api.setHeaderColor?.("#F7F2EB");
        api.setBackgroundColor?.("#F7F2EB");
        api.ready?.();
        api.expand?.();
      } catch { /* In-app SDK features vary by client version. */ }
    };
    document.head.appendChild(script);
    return () => {
      script.remove();
      bridge.current = null;
    };
  }, []);

  useEffect(() => {
    const button = bridge.current?.BackButton;
    if (!button) return;
    if (screen === "intro") button.hide?.();
    else {
      button.show?.();
      button.onClick?.(back);
    }
    return () => button.offClick?.(back);
  }, [back, provider, screen]);

  useEffect(() => {
    actionLock.current = false;
  }, [position, screen, stage]);

  const list = stages[stage];
  const questionId = list[position];
  const question = quiz.questions.find((item) => item.id === questionId);
  const total = stage === "deep" ? 15 : 7;
  const completed = stage === "deep" ? 7 + position : position;
  const pct = Math.round((completed / total) * 100);

  function startQuick() {
    setScreen("question");
    setStage("quick");
    setPosition(0);
    setNotice("");
  }

  function startDeep() {
    setStage("deep");
    setPosition(0);
    setScreen("question");
    setNotice("");
  }

  async function finish(nextAnswers: Partial<ScentAnswers>, currentStage: ScentStage) {
    setScreen("loading");
    try {
      const catalog = await readCatalog();
      const next = rankScentQuest(quiz, catalog, nextAnswers, currentStage);
      setResult(next);
      if (currentStage === "quick") setQuickResult(next);
      setScreen("result");
    } catch {
      setNotice("دریافت فهرست عطرها ممکن نشد. پاسخ‌های تو همچنان روی همین صفحه هستند.");
      setScreen("error");
    }
  }

  function choose(index: number) {
    if (actionLock.current || !question) return;
    const selected = choices[index];
    if (!question.options.some((option) => option.id === selected)) return;
    actionLock.current = true;
    bridge.current?.HapticFeedback?.selectionChanged?.();
    const updated = { ...answers, [questionId]: selected as ScentChoice };
    setAnswers(updated);
    if (position === list.length - 1) void finish(updated, stage);
    else setPosition((value) => value + 1);
  }

  async function share() {
    if (!result) return;
    const url = new URL("/scent-quest/result/" + result.archetype.slug, window.location.origin).toString();
    const payload = { title: "آرومان | امضای رایحه من", text: result.archetype.title + " · " + result.archetype.subtitle, url };
    if (navigator.share) {
      try { await navigator.share(payload); return; }
      catch (error) { if (error instanceof DOMException && error.name === "AbortError") return; }
    }
    try {
      await navigator.clipboard.writeText(payload.text + "\n" + url);
      setNotice("لینک نتیجه کپی شد.");
    } catch {
      setNotice("کپی خودکار ممکن نشد؛ از لینک «مشاهده نتیجه» استفاده کن.");
    }
  }

  return (
    <main className="am-mini" dir="rtl" id="main-content" tabIndex={-1}>
      <div className="am-shell">
        <header className="am-header">
          <div className="am-identity"><AromanEmblem/><span><b lang="en" dir="ltr">AROMAN</b><small>SCENT STUDIO</small></span></div>
          <span className="am-header-caption">یک رایحه، یک روایت</span>
          <span className="am-header-rule" aria-hidden="true"/>
        </header>

        {screen === "intro" && (
          <section className="am-intro" aria-labelledby="am-welcome-title">
            <div className="am-hero-copy">
              <p className="am-eyebrow">AROMAN · SCENT QUEST</p>
              <span className="am-decor" aria-hidden="true">✺</span>
              <h1 id="am-welcome-title">رایحه‌ای که<br/><em>شبیه توست.</em></h1>
              <p className="am-intro-lead">گاهی یک رایحه، بیشتر از هزار کلمه از تو حرف می‌زند. با چند انتخاب ساده، امضای خودت را کشف کن.</p>
              <div className="am-hero-stats"><span><strong>۰۷</strong> انتخاب برای شروع</span><i aria-hidden="true"/><span><strong>۰۸</strong> انتخاب برای شناخت عمیق‌تر</span></div>
              <button type="button" className="am-button am-button-primary" onClick={startQuick}>کشف امضای رایحه <span aria-hidden="true">←</span></button>
              <p className="am-privacy-note">بدون ثبت‌نام · بدون شماره موبایل · فقط یک تجربه شخصی</p>
            </div>
            <div className="am-hero-visual" role="img" aria-label="چیدمان هنری شیشه عطر و مواد معطر در فضایی روشن">
              <span className="am-hero-seal"><AromanEmblem/><span>YOUR SCENT.<br/>YOUR STORY.</span></span>
            </div>
          </section>
        )}

        {screen === "question" && question && (
          <section className="am-question-section" aria-labelledby="am-question" key={stage + "-" + position}>
            <div className="am-question-top">
              <div className="am-stage-name"><span className="am-stage-round">{stage === "quick" ? "01" : "02"}</span><div><span>{stage === "quick" ? "فصل اول" : "فصل دوم"}</span><strong>{stage === "quick" ? "کشف سریع" : "کشف عمیق"}</strong></div></div>
              <span className="am-count">{persian(position + 1)} <span>از</span> {persian(list.length)}</span>
            </div>
            <div className="am-progress" role="progressbar" aria-label="پیشرفت کشف رایحه" aria-valuenow={completed + 1} aria-valuemin={0} aria-valuemax={total}><span style={{ width: Math.round(((completed + 1) / total) * 100) + "%" }}/></div>
            <div className="am-question-copy">
              <span className="am-eyebrow">{stage === "quick" ? "FIRST IMPRESSION" : "A DEEPER LOOK"}</span>
              <h1 id="am-question">{question.text}</h1>
              <p>کدام تصویر به حس تو نزدیک‌تر است؟ هیچ پاسخ درست یا غلطی وجود ندارد.</p>
            </div>
            <div className="am-choices">
              {question.options.map((option, index) => (
                <button className="am-choice" type="button" key={option.id} onClick={() => choose(index)}
                  aria-label={"گزینه " + persian(index + 1) + "، " + option.label}>
                  <span className="am-choice-photo" style={{ backgroundImage: 'url("/images/scent-quest/' + scentQuestOptionImages[question.id][option.id] + '")' }} aria-hidden="true" />
                  <span className="am-choice-body"><small>{persian(index + 1).padStart(2, "۰")}</small><strong>{option.label}</strong><span aria-hidden="true" className="am-choice-arrow">↖</span></span>
                </button>
              ))}
            </div>
            <footer className="am-question-foot">
              <button type="button" className="am-text-button" onClick={back}>→ بازگشت</button>
              <span>مسیر تو · {persian(pct)}٪ تکمیل شده</span>
            </footer>
          </section>
        )}

        {screen === "loading" && <section className="am-state" role="status"><AromanEmblem/><p className="am-eyebrow">YOUR SCENT PROFILE</p><h2>رایحه تو دارد شکل می‌گیرد…</h2><p>داریم نت‌ها و پیشنهادها را با انتخاب‌های تو هماهنگ می‌کنیم.</p></section>}

        {screen === "error" && <section className="am-state" role="alert"><h2>یک لحظه صبر کن</h2><p>{notice}</p><button type="button" className="am-button am-button-primary" onClick={() => void finish(answers, stage)}>دوباره امتحان کن</button><button type="button" className="am-text-button" onClick={back}>بازگشت</button></section>}

        {screen === "result" && result && (
          <section className="am-results" aria-labelledby="am-result-title">
            <div className="am-result-cover">
              <div className="am-result-copy"><span className="am-eyebrow">YOUR SCENT IDENTITY</span><span className="am-result-icon" aria-hidden="true">{result.archetype.ornament}</span><p>{stage === "quick" ? "امضای اولیه رایحه تو" : "پرتره کامل رایحه تو"}</p><h1 id="am-result-title">{result.archetype.title}</h1><p className="am-result-subtitle">{result.archetype.subtitle}</p><div className="am-accords">{result.accords.map((accord) => <span key={accord}>{accord}</span>)}</div></div>
              <div className="am-result-image" role="img" aria-label="عطر و نت‌های گیاهی در چیدمان هنری"><span>AROMAN · THE SCENT EDIT</span></div>
            </div>
            <div className="am-section-intro"><div><p className="am-eyebrow">CURATED FOR YOU</p><h2>سه پیشنهاد برای تو</h2></div><p>پیشنهادها بر اساس پاسخ‌های تو مرتب شده‌اند؛ سلیقه عطری شخصی است و نتیجه تضمین خرید نیست.</p></div>
            <div className="am-products">{result.recommendations.map((perfume, i) => (
              <article className="am-product" key={perfume.id}><ScentProductImage perfume={perfume}/><div className="am-product-copy"><span>0{i + 1} / SELECTED</span><small>{perfume.brand}</small><strong>{perfume.name}</strong><p>{perfume.family}</p></div></article>
            ))}</div>
            {stage === "quick" && <section className="am-deep-callout"><span className="am-eyebrow">ACT II · GO DEEPER</span><h2>یک لایه عمیق‌تر؟</h2><p>با ۸ انتخاب دیگر، به تصویر کامل‌تری از سلیقه عطری خودت برس.</p><button type="button" className="am-button am-button-primary" onClick={startDeep}>کشف عمیق‌تر <span aria-hidden="true">←</span></button></section>}
            <div className="am-result-actions"><button type="button" className="am-button am-button-dark" onClick={() => void share()}>اشتراک امضای من ↗</button><a className="am-button am-button-outline" href={"/scent-quest/result/" + result.archetype.slug} target="_blank" rel="noopener noreferrer">مشاهده نتیجه عمومی</a><button className="am-text-button" type="button" onClick={restart}>شروع یک کشف تازه ↻</button></div>
            <p className="am-result-notice" role="status">{notice}</p>
            <p className="am-privacy-note am-end-note">این نسخه پیش‌نمایش است؛ هیچ پاسخی به سرور ارسال یا ذخیره نمی‌شود. لینک عمومی فقط نوع رایحه را نشان می‌دهد.</p>
          </section>
        )}
        <footer className="am-footer"><span>AROMAN © SCENT STUDIO</span><span>ساخته شده برای کشف، نه قضاوت.</span></footer>
      </div>
    </main>
  );
}
