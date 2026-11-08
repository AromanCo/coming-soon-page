import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { URL } from "node:url";
import { transitionSession, newSession } from "../src/bots/engine.mjs";

const privacyPage = readFileSync(new URL("../src/app/privacy/page.tsx", import.meta.url), "utf8");
const quiz = JSON.parse(readFileSync(new URL("../src/lib/scent-quest/quiz-data.json", import.meta.url), "utf8"));
const catalog = JSON.parse(readFileSync(new URL("../public/data/scent-quest-perfumes.json", import.meta.url), "utf8"));

test("website privacy notice covers browser quiz, bot retention, deletion limits, and provider processing", () => {
  for (const disclosure of [
    "برای ادامه بازی، شناسه چت، مرحله بازی و پاسخ‌های انتخابی",
    "در پایگاه داده آرومان ذخیره نمی‌شوند",
    "نشست پس از ۳۰ روز",
    "پیام‌های منتظر ارسال نیز حداکثر",
    "حداکثر ۱۰ تلاش تحویل",
    "تلگرام یا بله",
    "پاسخ‌های قبلیِ صف‌شده",
    "پیام تأیید حذف ممکن است",
    "قابل بازپس‌گیری نیست",
    "نسخه پشتیبانی وجود داشته باشد",
    "حذفِ مقاوم در برابر بازیابی در این نسخه پیاده‌سازی نشده است",
  ]) assert.ok(privacyPage.includes(disclosure), `missing privacy disclosure: ${disclosure}`);

  assert.match(privacyPage, /NEXT_PUBLIC_PRIVACY_EMAIL/);
  assert.match(privacyPage, /راه ارتباطی رسمی حریم خصوصی هنوز پیکربندی نشده است/);
});

test("bot /privacy gives bounded retention and deletion limits with the public policy link", () => {
  const result = transitionSession(newSession(), "/privacy", {
    quiz,
    catalog,
    siteUrl: "https://aroman.ir",
  });
  for (const disclosure of ["شناسه چت", "۳۰ روز", "۱۰ تلاش تحویل", "تلگرام یا بله", "/forget", "پیام تأیید ممکن است ارسال نشود", "نسخه‌های احتمالی پشتیبان"]) {
    assert.ok(result.view.text.includes(disclosure), `missing bot disclosure: ${disclosure}`);
  }
  assert.ok(result.view.rows.flat().some((button) => button.url === "https://aroman.ir/privacy"));
});
