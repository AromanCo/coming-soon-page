/** AROMAN Scent Quest: deterministic, browser-only ranking from the source workbook. */
export type ScentStage = "quick" | "deep";
export type ScentChoice = "الف" | "ب" | "ج" | "د";
export type ScentAnswers = Record<string, ScentChoice>;
export type ScentMapping = {
  weights: number[];
  audience: string | null;
  year_min: number;
  year_max: number;
  complexity: number;
};
export type ScentQuestion = {
  id: string;
  text: string;
  options: { id: string; label: string }[];
};
export type ScentQuizData = {
  feature_labels: string[];
  stage1_questions: string[];
  stage2_questions: string[];
  questions: ScentQuestion[];
  option_mappings: Record<string, Record<string, ScentMapping>>;
};
export type ScentPerfume = {
  id: number;
  name: string;
  brand: string;
  family: string;
  gender: string;
  year: number | null;
  notes: string[];
  url: string;
  image: string;
  v: number[];
  complexity: number;
  quality: number;
};
export const SCENT_ARCHETYPES = [
  { slug: "morning-light", title: "درخششِ صبح", subtitle: "روشن، پرانرژی و آزاد", ornament: "✦", tone: "citrus" },
  { slug: "green-soul", title: "روحِ طبیعت", subtitle: "تازه، زنده و بی‌مرز", ornament: "✳", tone: "green" },
  { slug: "blue-horizon", title: "افقِ آبی", subtitle: "آرام، شفاف و رها", ornament: "≈", tone: "blue" },
  { slug: "colorful-joy", title: "شادیِ رنگ‌ها", subtitle: "بازیگوش، پرنور و خوش‌حال", ornament: "✿", tone: "fruit" },
  { slug: "dream-garden", title: "باغِ خیال", subtitle: "لطیف، شاعرانه و خیال‌انگیز", ornament: "❀", tone: "floral" },
  { slug: "white-night", title: "سپیدیِ شب", subtitle: "ظریف، باوقار و درخشان", ornament: "✧", tone: "white" },
  { slug: "forest-shadow", title: "سایه‌روشنِ جنگل", subtitle: "آرام، عمیق و اصیل", ornament: "❖", tone: "wood" },
  { slug: "hidden-ember", title: "آتشِ پنهان", subtitle: "گرم، صمیمی و ماندگار", ornament: "✶", tone: "amber" },
  { slug: "spark-of-boldness", title: "جرقه‌ی جسارت", subtitle: "جسور، خاص و پرشور", ornament: "✺", tone: "spice" },
  { slug: "sweet-memory", title: "خاطره‌ی شیرین", subtitle: "دلنشین، گرم و دوست‌داشتنی", ornament: "✴", tone: "sweet" },
  { slug: "midnight-secret", title: "رازِ نیمه‌شب", subtitle: "مرموز، پرقدرت و متفاوت", ornament: "◇", tone: "dark" },
  { slug: "quiet-white", title: "آرامشِ سفید", subtitle: "شفاف، ملایم و متعادل", ornament: "◌", tone: "clean" },
] as const;
export type ScentArchetype = (typeof SCENT_ARCHETYPES)[number];
export function findArchetype(slug: string) {
  return SCENT_ARCHETYPES.find((a) => a.slug === slug);
}
export function stageQuestions(quiz: ScentQuizData, stage: ScentStage): string[] {
  return stage === "quick" ? quiz.stage1_questions : [...quiz.stage1_questions, ...quiz.stage2_questions];
}
export function hasCompleteAnswers(quiz: ScentQuizData, answers: Partial<ScentAnswers>, stage: ScentStage): boolean {
  return stageQuestions(quiz, stage).every((q) => Boolean(answers[q] && quiz.option_mappings[q]?.[answers[q]]));
}
export type ScentResult = {
  stage: ScentStage;
  archetype: ScentArchetype;
  dominant: string;
  accords: string[];
  recommendations: ScentPerfume[];
};
function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
function cosine(a: number[], b: number[]): number {
  const na = Math.hypot(...a), nb = Math.hypot(...b);
  return na && nb ? 100 * a.reduce((s, v, i) => s + v * num(b[i]), 0) / (na * nb) : 0;
}
export function rankScentQuest(quiz: ScentQuizData, catalog: ScentPerfume[], answers: Partial<ScentAnswers>, stage: ScentStage): ScentResult {
  if (!hasCompleteAnswers(quiz, answers, stage)) throw new Error("Incomplete quiz");
  if (quiz.feature_labels.length !== 12 || catalog.length === 0) throw new Error("Invalid catalog");
  const p = Array<number>(12).fill(0);
  let audience: string | null = null, from = 0, to = 0, complexity = 0;
  for (const id of stageQuestions(quiz, stage)) {
    const m = quiz.option_mappings[id][answers[id] as ScentChoice];
    m.weights.forEach((value, i) => { if (i < 12) p[i] += num(value); });
    if (m.audience) audience = m.audience;
    if (m.year_min) { from = m.year_min; to = m.year_max; }
    if (m.complexity) complexity = m.complexity;
  }
  // Aversion in Q15 means down-ranking, never a promise of absolute exclusion.
  const avoided = answers.Q15 === "الف" ? [9] : answers.Q15 === "ب" ? [4, 5] : answers.Q15 === "ج" ? [10] : [];
  const scored = catalog.map((item) => {
    let score = cosine(p, item.v);
    if (audience) score += item.gender === audience ? 8 :
      (audience === "آقایان" || audience === "بانوان") && item.gender === "آقایان و بانوان" ? 4 : -5;
    if (from) score += !item.year ? -1 : item.year >= from && item.year <= to ? 4 : -3;
    if (complexity) score += item.complexity === complexity ? 5 : -4;
    if (avoided.length) score -= 16 * Math.max(0, ...avoided.map((i) => num(item.v[i]))) / 5;
    return { item, score: score + num(item.quality) * 0.25 };
  }).sort((a, b) => b.score - a.score || a.item.id - b.item.id);
  const recommendations: ScentPerfume[] = [], brands = new Set<string>();
  for (const { item } of scored) {
    const brand = item.brand.trim().toLocaleLowerCase("fa");
    if (brands.has(brand)) continue;
    recommendations.push(item); brands.add(brand);
    if (recommendations.length === 3) break;
  }
  if (recommendations.length < 3) for (const { item } of scored) {
    if (!recommendations.some((r) => r.id === item.id)) recommendations.push(item);
    if (recommendations.length === 3) break;
  }
  const weighted = quiz.feature_labels.map((label, index) => ({ label, index, score: p[index] }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const positives = weighted.filter((s) => s.score > 0);
  const top = (positives.length ? positives : weighted).slice(0, 3);
  return {
    stage,
    archetype: SCENT_ARCHETYPES[top[0].index],
    dominant: top[0].label,
    accords: top.map((s) => s.label),
    recommendations,
  };
}
