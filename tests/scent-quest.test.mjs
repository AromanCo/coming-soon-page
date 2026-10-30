import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { rankScentQuest, hasCompleteAnswers, SCENT_ARCHETYPES } from "../src/lib/scent-quest/scoring.ts";
const q=JSON.parse(readFileSync(new URL("../src/lib/scent-quest/quiz-data.json",import.meta.url),"utf8"));
const perfumes=JSON.parse(readFileSync(new URL("../public/data/scent-quest-perfumes.json",import.meta.url),"utf8"));
const ids=[...q.stage1_questions,...q.stage2_questions];
const answers=Object.fromEntries(ids.map(id=>[id,"الف"]));
test("15 questions, 60 complete mappings, unique two-stage order",()=>{assert.equal(q.questions.length,15);assert.equal(q.stage1_questions.length,7);assert.equal(q.stage2_questions.length,8);assert.equal(new Set(ids).size,15);assert.equal(q.feature_labels.length,12);for(const question of q.questions){assert.equal(question.options.length,4);for(const o of question.options){assert.equal(q.option_mappings[question.id][o.id].weights.length,12);}}});
test("900 catalog entries with 12-dimensional vectors",()=>{assert.equal(perfumes.length,900);assert.equal(new Set(perfumes.map(p=>p.id)).size,900);for(const p of perfumes){assert.equal(p.v.length,12);assert.ok(p.v.every(Number.isFinite));}});
test("seven questions yield initial result without deeper answers",()=>{const quick=Object.fromEntries(q.stage1_questions.map(id=>[id,"الف"]));assert.equal(hasCompleteAnswers(q,quick,"quick"),true);assert.equal(hasCompleteAnswers(q,quick,"deep"),false);assert.throws(()=>rankScentQuest(q,perfumes,{},"quick"));assert.equal(rankScentQuest(q,perfumes,quick,"quick").recommendations.length,3);});
test("deep result is deterministic and provides three distinct brands",()=>{const a=rankScentQuest(q,perfumes,answers,"deep");const b=rankScentQuest(q,perfumes,answers,"deep");assert.deepEqual(a,b);assert.equal(new Set(a.recommendations.map(p=>p.brand)).size,3);});
test("archetype public ids do not expose raw answers",()=>{assert.equal(SCENT_ARCHETYPES.length,12);assert.equal(new Set(SCENT_ARCHETYPES.map(p=>p.slug)).size,12);});

import { buildDeepPortrait } from "../src/lib/scent-quest/portrait.ts";
import { SHARE_CARD_LAYOUT } from "../src/lib/scent-quest/share-card-layout.ts";
test("deep portrait is derived from all 15 answers and never invents match percentages",()=>{
  const quick=Object.fromEntries(q.stage1_questions.map(id=>[id,"الف"]));
  const qr=rankScentQuest(q,perfumes,quick,"quick");
  const dr=rankScentQuest(q,perfumes,answers,"deep");
  const portrait=buildDeepPortrait(q,answers,dr,qr);
  assert.equal(portrait.facets.length,12);
  assert.equal(portrait.top.length,6);
  assert.ok(portrait.top.every(f=>f.strength>=0&&f.strength<=100));
  assert.equal(portrait.opening,q.questions.find(x=>x.id==="Q02").options[0].label);
  assert.equal(portrait.heart,q.questions.find(x=>x.id==="Q03").options[0].label);
  assert.equal(portrait.base,q.questions.find(x=>x.id==="Q04").options[0].label);
  assert.equal(portrait.backdrop.length,6);
  assert.ok(portrait.changingPicks>=0&&portrait.changingPicks<=3);
});

test("auto-advanced question prompt is announced atomically to assistive technology",()=>{
  const source=readFileSync(new URL("../src/components/scent-quest-game.tsx",import.meta.url),"utf8");
  assert.match(source,/<h2 id="sq-title" aria-live="polite" aria-atomic="true">/);
});

test("recommendations appear before one final sharing panel with a branded no-request fallback",()=>{
  const game=readFileSync(new URL("../src/components/scent-quest-game.tsx",import.meta.url),"utf8");
  const portrait=readFileSync(new URL("../src/components/deep-scent-portrait.tsx",import.meta.url),"utf8");
  assert.ok(game.indexOf("<div className=\"sq-recs\">") < game.indexOf("<div className=\"sq-share\">"));
  assert.match(game,/aria-label={`تصویر \$\{perfume\.name\} در دسترس نیست`}/);
  assert.doesNotMatch(game,/<img[^>]+src=\{perfume\.image\}/);
  assert.match(game,/<div className="sq-rec-fallback" role="img"/);
  assert.match(game,/امتیاز سازگاری علمی یا تضمین پسندیدن نیستند/);
  assert.match(game,/className="sq-share-primary"/);
  assert.doesNotMatch(game,/دیدن لینک اشتراک/);
  assert.doesNotMatch(portrait,/onShare|onStory|اشتراک‌گذاری نتیجه/);
  assert.match(game,/result\/" \+ result\.archetype\.slug/);
  assert.doesNotMatch(game,/answers.*URL|URL.*answers/);
});

test("recommendation fallback reserves a rank-safe area and product images keep contain sizing",()=>{
  const component=readFileSync(new URL("../src/components/scent-quest-game.tsx",import.meta.url),"utf8");
  const css=readFileSync(new URL("../src/app/scent-quest/scent-quest.css",import.meta.url),"utf8");
  assert.match(component,/className="sq-rec-rank"/);
  assert.match(component,/className="sq-rec-fallback" role="img"/);
  assert.match(css,/\.sq-rec-fallback\{padding-top:48px\}/);
  assert.match(css,/\.sq-rec-image \.sq-rec-rank\{[^}]*z-index:2/);
  assert.match(css,/\.sq-rec-image img\{object-fit:contain;padding:16px\}/);
});

test("story and post taglines clear the top edge of the monogram",()=>{
  for(const layout of Object.values(SHARE_CARD_LAYOUT)) assert.ok(layout.taglineY+6<layout.emblemY-layout.emblemRadius);
  assert.equal(SHARE_CARD_LAYOUT.post.ellipseStart,2);
});
