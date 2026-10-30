import type { ScentAnswers, ScentQuizData, ScentResult } from "./scoring";

export type PortraitFacet = { name: string; strength: number; raw: number };
export type DeepPortrait = {
  facets: PortraitFacet[];
  top: PortraitFacet[];
  opening: string;
  heart: string;
  base: string;
  backdrop: { label: string; value: string }[];
  aversion: string | null;
  evolution: string;
  changingPicks: number;
};

/** Describe the answers, not unverified perfume chemistry or compatibility percentages. */
export function buildDeepPortrait(
  quiz: ScentQuizData,
  answers: Partial<ScentAnswers>,
  result: ScentResult,
  quickResult: ScentResult | null,
): DeepPortrait {
  const label = (id: string) => {
    const question = quiz.questions.find((item) => item.id === id);
    return question?.options.find((option) => option.id === answers[id])?.label ?? "بدون انتخاب";
  };
  const total = Array<number>(quiz.feature_labels.length).fill(0);
  for (const id of [...quiz.stage1_questions, ...quiz.stage2_questions]) {
    const choice = answers[id];
    const values = choice ? quiz.option_mappings[id]?.[choice]?.weights : null;
    if (!values) continue;
    values.forEach((value, index) => {
      if (index < total.length && Number.isFinite(value)) total[index] += value;
    });
  }
  const peak = Math.max(1, ...total.map((value) => Math.max(0, value)));
  const facets: PortraitFacet[] = quiz.feature_labels.map((name, index) => ({
    name,
    raw: total[index],
    strength: Math.max(0, Math.round((Math.max(0, total[index]) / peak) * 100)),
  }));
  const top = facets.slice().sort((a, b) => b.raw - a.raw).slice(0, 6);
  const changingPicks = quickResult
    ? result.recommendations.filter((perfume) => !quickResult.recommendations.some((old) => old.id === perfume.id)).length
    : 0;
  const evolution = !quickResult
    ? "هشت سؤال تکمیلی، تصویر دقیق‌تری از سلیقه‌ات ساخت."
    : quickResult.archetype.slug === result.archetype.slug
      ? "هویت اصلی رایحه‌ات حفظ شد؛ اما جزئیات و اولویت پیشنهادها با پاسخ‌های جدید دقیق‌تر شده."
      : "از «" + quickResult.archetype.title + "» به «" + result.archetype.title + "» رسیدی؛ پاسخ‌های تکمیلی جهت رایحه‌ات را روشن‌تر کردند.";
  return {
    facets,
    top,
    opening: label("Q02"),
    heart: label("Q03"),
    base: label("Q04"),
    backdrop: [
      { label: "میزان شیرینی", value: label("Q05") },
      { label: "حس دما", value: label("Q06") },
      { label: "موقعیت استفاده", value: label("Q11") },
      { label: "فصل دلخواه", value: label("Q12") },
      { label: "نقش ادویه", value: label("Q08") },
      { label: "ساختار رایحه", value: label("Q14") },
    ],
    aversion: answers.Q15 === "د" ? null : label("Q15"),
    evolution,
    changingPicks,
  };
}
