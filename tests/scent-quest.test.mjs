import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { existsSync } from "node:fs";
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
  const imageComponent=readFileSync(new URL("../src/components/scent-product-image.tsx",import.meta.url),"utf8");
  assert.ok(game.indexOf("<div className=\"sq-recs\">") < game.indexOf("<div className=\"sq-share\">"));
  assert.doesNotMatch(imageComponent,/perfume\.image/);
  assert.match(imageComponent,/scentQuestProductImages\[perfume\.id\]/);
  assert.match(imageComponent,/نشان هویت رایحه آرومان؛ \$\{perfume\.brand\}/);
  assert.match(imageComponent,/className="sq-rec-fallback" role="img"/);
  assert.match(imageComponent,/قصهٔ رایحه، به روایت آرومان/);
  assert.doesNotMatch(imageComponent,/sq-fallback-product|تصویر تأییدشده در دسترس نیست/);
  assert.match(game,/className="sq-result-featured"/);
  assert.match(portrait,/className="sq-result-featured"/);
  assert.match(game,/<AromanEmblem aria-hidden="true"\/>/);
  assert.match(portrait,/<AromanEmblem aria-hidden="true"\/>/);
  assert.match(game,/امتیاز سازگاری علمی یا تضمین پسندیدن نیستند/);
  assert.match(game,/className="sq-share-primary"/);
  assert.doesNotMatch(game,/دیدن لینک اشتراک/);
  assert.doesNotMatch(portrait,/onShare|onStory|اشتراک‌گذاری نتیجه/);
  assert.match(game,/result\/" \+ result\.archetype\.slug/);
  assert.doesNotMatch(game,/answers.*URL|URL.*answers/);
});

test("recommendation fallback reserves a rank-safe area and product images keep contain sizing",()=>{
  const component=readFileSync(new URL("../src/components/scent-quest-game.tsx",import.meta.url),"utf8");
  const imageComponent=readFileSync(new URL("../src/components/scent-product-image.tsx",import.meta.url),"utf8");
  const css=readFileSync(new URL("../src/app/scent-quest/scent-quest.css",import.meta.url),"utf8");
  assert.match(component,/className="sq-rec-rank"/);
  assert.match(imageComponent,/className="sq-rec-fallback" role="img"/);
  assert.match(css,/\.sq-rec-fallback\{padding-top:48px\}/);
  assert.match(css,/\.sq-rec-image \.sq-rec-rank\{[^}]*z-index:2/);
  assert.match(css,/\.sq-product-image img\{[^}]*object-fit:contain/);
});

test("recommendation cards keep rank and product details readable with the exact-product fallback",()=>{
  const component=readFileSync(new URL("../src/components/scent-quest-game.tsx",import.meta.url),"utf8");
  const imageComponent=readFileSync(new URL("../src/components/scent-product-image.tsx",import.meta.url),"utf8");
  const css=readFileSync(new URL("../src/app/scent-quest/scent-quest.css",import.meta.url),"utf8");
  assert.match(component,/className="sq-rec-rank"[^>]*>\{index \+ 1\}/);
  assert.match(component,/<small className="sq-rec-brand">\{perfume\.brand\}<\/small>/);
  assert.match(component,/<h4>\{perfume\.name\}<\/h4>/);
  assert.match(component,/className="sq-rec-notes"/);
  assert.doesNotMatch(imageComponent,/sq-fallback-product/);
  assert.match(css,/\.sq-rec-fallback small/);
  assert.match(css,/\.sq-result-art>svg/);
  assert.match(css,/\.sq-portrait-featured>svg/);
  assert.doesNotMatch(css,/sq-fallback-bottle|generic-bottle/);
});

test("only explicitly mapped local product photos with a matching source manifest are used",()=>{
  const mapping=readFileSync(new URL("../src/lib/scent-quest/product-image-map.ts",import.meta.url),"utf8");
  const manifest=JSON.parse(readFileSync(new URL("../public/images/scent-quest/products/image-sources.json",import.meta.url),"utf8"));
  const pairs=[...mapping.matchAll(/(\d+):\s*"(\/images\/[^"]+)"/g)].map(([,id,src])=>[Number(id),src]);
  assert.equal(pairs.length,0,"no product image is enabled without both exact-edition and reuse-rights verification");
  for(const [id,src] of pairs){
    assert.ok(perfumes.some(p=>p.id===id),`mapped catalog product ${id} exists`);
    assert.ok(!/^https?:/i.test(src),"product image is local");
    assert.ok(existsSync(new URL(`../public${src}`,import.meta.url)),`local photo ${src} exists`);
    assert.ok(manifest.images.some(image=>image.productId===id&&src.endsWith(image.localFilename)));
  }
  assert.equal(manifest.images.length,pairs.length);
  assert.equal(manifest.downloadDate,null,"no image was downloaded or approved");
  for(const id of [10157,32026,14185]) assert.ok(manifest.reviewedCandidates.some(image=>image.productId===id&&image.rightsStatus.startsWith("blocked")));
  assert.match(manifest.reviewedCandidates.find(image=>image.productId===14185).rejectedPhoto.reason,/1947 original/);
});

test("story and post taglines clear the top edge of the monogram",()=>{
  for(const layout of Object.values(SHARE_CARD_LAYOUT)) assert.ok(layout.taglineY+6<layout.emblemY-layout.emblemRadius);
  assert.equal(SHARE_CARD_LAYOUT.post.ellipseStart,2);
});
