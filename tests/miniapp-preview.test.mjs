import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";

function source(rel) {
  return readFileSync(fileURLToPath(new URL("../" + rel, import.meta.url)), "utf8");
}
const page = source("src/app/scent-quest/mini/page.tsx");
const ui = source("src/components/scent-quest-mini.tsx");
const styles = source("src/app/scent-quest/mini/mini.css");

test("Mini App prototype is isolated, noindex and does not replace existing quiz", () => {
  assert.match(page, /robots:\s*\{\s*index:\s*false,\s*follow:\s*false/);
  assert.match(page, /ScentQuestMini/);
  assert.doesNotMatch(page, /SiteHeader|WaitlistForm|ScentQuestGame/);
});

test("Mini App uses real source questions, catalog scoring and 7 plus 8 stage progression", () => {
  assert.match(ui, /quiz\.stage1_questions/);
  assert.match(ui, /quiz\.stage2_questions/);
  assert.match(ui, /rankScentQuest\(quiz,\s*catalog,\s*nextAnswers,\s*currentStage\)/);
  assert.match(ui, /if\s*\(currentStage === "quick"\)\s*setQuickResult\(next\)/);
  assert.match(ui, /stage === "deep" \? 15 : 7/);
  assert.match(ui, /scentQuestOptionImages/);
  assert.match(ui, /ScentProductImage/);
});

test("Preview never trusts Mini App identity or writes private answers to a server", () => {
  assert.match(ui, /A platform hint only selects a display adapter; never trust it for authentication/);
  assert.doesNotMatch(ui, /initDataUnsafe|localStorage|sessionStorage|sendData\s*\(|fetch\s*\(\s*["']\/api\//);
  assert.doesNotMatch(ui, /waitlist|purchase|payments|phone_number/i);
  assert.match(ui, /fetch\("\/data\/scent-quest-perfumes\.json"\)/);
});

test("Both provider SDKs are opt-in and navigation stays in memory", () => {
  assert.match(ui, /https:\/\/tapi\.bale\.ai\/miniapp\.js/);
  assert.match(ui, /https:\/\/telegram\.org\/js\/telegram-web-app\.js/);
  assert.match(ui, /value === "bale" \|\| value === "telegram"/);
  assert.doesNotMatch(ui, /history\.pushState|history\.replaceState|router\.push/);
});

test("Visual preview includes mobile layout and reduced-motion support", () => {
  assert.match(styles, /#f7f2eb/i);
  assert.match(styles, /#e8ddd0/i);
  assert.match(styles, /@media\(max-width:760px\)/);
  assert.match(styles, /@media\(max-width:359px\)/);
  assert.match(styles, /prefers-reduced-motion:reduce/);
});
