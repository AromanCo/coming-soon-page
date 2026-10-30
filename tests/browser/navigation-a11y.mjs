// Browser regression for the responsive navigation and accessibility foundation.
// Run with the Next server already listening at http://localhost:3000.
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { URL } from "node:url";

const { fetch, WebSocket, setTimeout, console } = globalThis;

const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
const outputDir = process.env.OUTPUT_DIR ?? path.join(os.homedir(), "Dev/Aroman/qa-artifacts/coming-soon/ux-09");
const layoutCapture = process.env.LAYOUT_CAPTURE ?? "after";
const widths = [320, 390, 768, 1024, 1440];
const chromeProfile = await mkdtemp(path.join(os.tmpdir(), "aroman-ux08-chrome-"));
const chrome = spawn("google-chrome", [
  "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
  "--remote-debugging-port=9433", "--remote-allow-origins=*",
  `--user-data-dir=${chromeProfile}`, "about:blank",
], { stdio: "ignore", detached: true });

await mkdir(outputDir, { recursive: true });
let ws;
let nextId = 0;
const pending = new Map();
try {
  let targets;
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      targets = await fetch("http://127.0.0.1:9433/json/list").then((r) => r.json());
      break;
    } catch { await new Promise((resolve) => setTimeout(resolve, 250)); }
  }
  const pageTarget = targets?.find((target) => target.type === "page" && target.url === "about:blank")
    ?? targets?.find((target) => target.type === "page");
  assert.ok(pageTarget?.webSocketDebuggerUrl, "Chrome remote debugging started");
  ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  });
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, (message) => message.error ? reject(new Error(message.error.message)) : resolve(message.result));
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  const screenshot = async (name) => {
    const { data } = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await writeFile(path.join(outputDir, name), Buffer.from(data, "base64"));
  };
  const pressKey = async (key, code = key, windowsVirtualKeyCode) => {
    await command("Input.dispatchKeyEvent", { type: key === "Tab" ? "keyDown" : "rawKeyDown", key, code, windowsVirtualKeyCode });
    await command("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode });
    await new Promise((resolve) => setTimeout(resolve, 90));
  };
  await command("Page.enable");
  await command("Runtime.enable");
  await command("Accessibility.enable");
  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await command("Page.navigate", { url: baseUrl });
  for (let attempt = 0; attempt < 40; attempt++) {
    if (await evaluate("Boolean(document.querySelector('main#main-content'))")) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.equal(await evaluate("document.location.origin"), new URL(baseUrl).origin, "Chrome navigated to the local app");

  const results = [];
  const deepMeterEvidence = [];
  const facetLayoutEvidence = [];
  const imageRenderEvidence = [];
  const waitFor = async (expression, description, attempts = 60) => {
    for (let attempt = 0; attempt < attempts; attempt++) {
      const value = await evaluate(expression);
      if (value) return value;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.fail(`Timed out waiting for ${description}`);
  };
  for (const width of widths) {
    await command("Emulation.setDeviceMetricsOverride", { width, height: 844, deviceScaleFactor: 1, mobile: width <= 900 });
    await command("Page.navigate", { url: baseUrl });
    await new Promise((resolve) => setTimeout(resolve, 650));
    await screenshot(`${width}-home-closed.png`);
    await pressKey("Tab", "Tab", 9);
    const skipCheck = await evaluate("({href:document.activeElement?.getAttribute('href'),top:document.activeElement.getBoundingClientRect().top,visibility:getComputedStyle(document.activeElement).visibility,main:document.querySelectorAll('main#main-content').length})");
    assert.equal(skipCheck.href, "#main-content", `${width}px first Tab focuses the skip link`);
    assert.ok(skipCheck.top >= 0, `${width}px skip link is visible after Tab`);
    assert.equal(skipCheck.visibility, "visible");
    assert.equal(skipCheck.main, 1);
    await screenshot(`${width}-focus-skip.png`);
    if (width <= 900) {
      const tabTrace = [];
      for (let i = 0; i < 2; i++) {
        await pressKey("Tab", "Tab", 9);
        tabTrace.push(await evaluate("(()=>{const n=document.activeElement?.closest('nav'),r=document.activeElement?.getBoundingClientRect();return {tag:document.activeElement?.tagName,cls:document.activeElement?.className,text:document.activeElement?.innerText,nav:n?.className,navDisplay:n&&getComputedStyle(n).display,rect:r&&{x:r.x,y:r.y,w:r.width,h:r.height},menuHidden:document.querySelector('.mobile-nav').hidden}})()"));
      }
      const triggerFocus = await evaluate("(()=>{const e=document.querySelector('.mobile-nav-toggle'),s=getComputedStyle(e);return {active:document.activeElement===e,activeTag:document.activeElement?.tagName,activeClass:document.activeElement?.className,activeText:document.activeElement?.innerText,visible: e.matches(':focus-visible'),outlineStyle:s.outlineStyle,outlineWidth:s.outlineWidth,outlineColor:s.outlineColor}})()");
      assert.equal(triggerFocus.active, true, `${width}px Tab reaches the menu trigger: ${JSON.stringify({triggerFocus,tabTrace})}`);
      assert.equal(triggerFocus.visible, true, `${width}px menu trigger has keyboard-visible focus`);
      assert.notEqual(triggerFocus.outlineStyle, "none");
      assert.ok(Number.parseFloat(triggerFocus.outlineWidth) >= 2);
      await screenshot(`${width}-focus-menu-trigger.png`);
      await screenshot(`${width}-keyboard-focus.png`);
      const closedCapture = await readFile(path.join(outputDir, `${width}-home-closed.png`));
      const focusedCapture = await readFile(path.join(outputDir, `${width}-focus-menu-trigger.png`));
      assert.equal(closedCapture.equals(focusedCapture), false, `${width}px keyboard-focus capture visibly differs from unfocused page`);
      await pressKey(" ", "Space", 32);
      assert.equal(await evaluate("document.querySelector('.mobile-nav-toggle').getAttribute('aria-expanded')"), "true", `${width}px Space opens the disclosure`);
      await pressKey("Tab", "Tab", 9); // Header invitation CTA
      const ctaFocus = await evaluate("(()=>{const e=document.querySelector('.header-cta'),s=getComputedStyle(e);return {active:document.activeElement===e,visible:e.matches(':focus-visible'),outlineStyle:s.outlineStyle,outlineWidth:s.outlineWidth,outlineColor:s.outlineColor,name:e.getAttribute('aria-label')}})()");
      assert.equal(ctaFocus.active, true, `${width}px Tab reaches the waitlist CTA`);
      assert.equal(ctaFocus.visible, true, `${width}px waitlist CTA has keyboard-visible focus`);
      assert.notEqual(ctaFocus.outlineStyle, "none");
      assert.ok(Number.parseFloat(ctaFocus.outlineWidth) >= 2);
      assert.equal(ctaFocus.name, "عضویت در لیست دعوت");
      await screenshot(`${width}-focus-waitlist-cta.png`);
      await pressKey("Tab", "Tab", 9); // First disclosure link
      const linkFocus = await evaluate("(()=>{const e=document.querySelector('.mobile-nav-links > a:not(.mobile-nav-quest)'),s=getComputedStyle(e);return {active:document.activeElement===e,visible:e.matches(':focus-visible'),outlineStyle:s.outlineStyle,outlineWidth:s.outlineWidth,outlineColor:s.outlineColor,text:e.innerText}})()");
      assert.equal(linkFocus.active, true, `${width}px Tab reaches the first navigation link`);
      assert.equal(linkFocus.visible, true, `${width}px navigation link has keyboard-visible focus`);
      assert.notEqual(linkFocus.outlineStyle, "none");
      assert.ok(Number.parseFloat(linkFocus.outlineWidth) >= 2);
      await screenshot(`${width}-focus-nav-link.png`);
      await pressKey("Tab", "Tab", 9);
      await pressKey("Tab", "Tab", 9);
      await pressKey("Tab", "Tab", 9); // Scent Quest card
      const questFocus = await evaluate("(()=>{const e=document.querySelector('.mobile-nav-quest'),s=getComputedStyle(e);return {active:document.activeElement===e,visible:e.matches(':focus-visible'),outlineStyle:s.outlineStyle,outlineWidth:s.outlineWidth,outlineColor:s.outlineColor}})()");
      assert.equal(questFocus.active, true, `${width}px Tab reaches Scent Quest`);
      assert.equal(questFocus.visible, true);
      assert.notEqual(questFocus.outlineStyle, "none");
      await screenshot(`${width}-focus-scent-quest-link.png`);
      await pressKey("Escape", "Escape", 27);
      assert.equal(await evaluate("document.querySelector('.mobile-nav').hidden"), true, `${width}px Escape closes the panel`);
      assert.equal(await evaluate("document.activeElement===document.querySelector('.mobile-nav-toggle')"), true, `${width}px Escape restores opener focus`);
    }
    const homeState = await evaluate(`(() => ({
      width:innerWidth, scrollWidth:document.documentElement.scrollWidth,
      dir:document.documentElement.dir, main:document.querySelectorAll('main#main-content').length,
      heroImageMinHeight:getComputedStyle(document.querySelector('.hero-image')).minHeight,
      trigger:(()=>{const e=document.querySelector('.mobile-nav-toggle');if(!e)return null;const r=e.getBoundingClientRect();return {display:getComputedStyle(e).display,width:r.width,height:r.height,expanded:e.getAttribute('aria-expanded'),label:e.getAttribute('aria-label')}})(),
      cta:(()=>{const e=document.querySelector('.header-cta');return e?{name:e.getAttribute('aria-label'),text:e.innerText,rect:(()=>{const r=e.getBoundingClientRect();return {width:r.width,height:r.height}})()}:null})()
    }))()`);
    assert.equal(homeState.scrollWidth, width, `${width}px homepage has no horizontal overflow`);
    assert.equal(homeState.dir, "rtl", `${width}px page stays RTL`);
    assert.equal(homeState.main, 1, `${width}px homepage main target is unique`);
    assert.ok(homeState.cta, `${width}px waitlist CTA remains visible`);
    const waitlistUi = await evaluate(`(()=>{const form=document.querySelector('#waitlist'),phone=form?.querySelector('input[name="phone"]'),consent=form?.querySelector('input[name="consent"]'),submit=form?.querySelector('button[type="submit"]');return {form:Boolean(form),phone:Boolean(phone&&phone.labels?.length),consent:Boolean(consent&&consent.labels?.length),submit:Boolean(submit),phoneDisabled:phone?.disabled,consentDisabled:consent?.disabled}})()`);
    assert.ok(waitlistUi.form && waitlistUi.phone && waitlistUi.consent && waitlistUi.submit, `${width}px waitlist UI renders labeled phone and consent controls`);
    assert.equal(homeState.heroImageMinHeight, width <= 640 ? "360px" : width <= 900 ? "520px" : "650px", `${width}px hero image keeps its responsive height`);
    if (width <= 900) {
      assert.equal(homeState.trigger.display, "flex", `${width}px mobile menu is visible`);
      assert.ok(homeState.trigger.width >= 44 && homeState.trigger.height >= 44, `${width}px menu target is at least 44x44`);
      assert.equal(homeState.trigger.expanded, "false");
      if (width === 320) assert.match(homeState.cta.text, /عضویت/);
    } else {
      assert.equal(homeState.trigger.display, "none", `${width}px mobile trigger hidden at desktop`);
      assert.notEqual(await evaluate("getComputedStyle(document.querySelector('.desktop-nav')).display"), "none", `${width}px desktop nav visible`);
    }

    if (width <= 900) {
      await evaluate("document.querySelector('.mobile-nav-toggle').click()");
      const open = await evaluate("({expanded:document.querySelector('.mobile-nav-toggle').getAttribute('aria-expanded'),hidden:document.querySelector('.mobile-nav').hidden,links:[...document.querySelectorAll('.mobile-nav a')].map(x=>x.innerText),panel:getComputedStyle(document.querySelector('.mobile-nav')).backgroundColor})");
      assert.equal(open.expanded, "true");
      assert.equal(open.hidden, false);
      assert.match(open.links.join(" "), /داستان آرومان/);
      assert.match(open.links.join(" "), /مسیرهای رایحه/);
      assert.match(open.links.join(" "), /کشف حال‌وهوا/);
      assert.match(open.links.join(" "), /بازی امضای رایحه/);
      await screenshot(`${width}-navigation-open.png`);
      await evaluate("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
      const escape = await evaluate("({expanded:document.querySelector('.mobile-nav-toggle').getAttribute('aria-expanded'),focused:document.activeElement===document.querySelector('.mobile-nav-toggle')})");
      assert.equal(escape.expanded, "false");
      assert.equal(escape.focused, true, "Escape returns focus to menu trigger");
      await evaluate("document.querySelector('.mobile-nav-toggle').click()");
      await new Promise((resolve) => setTimeout(resolve, 60));
      await evaluate("document.body.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))");
      await new Promise((resolve) => setTimeout(resolve, 60));
      assert.equal(await evaluate("document.querySelector('.mobile-nav').hidden"), true, "outside click dismisses disclosure");
      await evaluate("document.querySelector('.mobile-nav-toggle').click()");
      await new Promise((resolve) => setTimeout(resolve, 60));
      await evaluate("document.querySelector('.mobile-nav a[href=\\\"#story\\\"]')?.click()");
      await new Promise((resolve) => setTimeout(resolve, 300));
      const samePage = await evaluate("({hidden:document.querySelector('.mobile-nav').hidden,hash:location.hash,focus:document.activeElement?.id})");
      assert.equal(samePage.hidden, true, "same-page anchor navigation closes the panel");
      assert.equal(samePage.hash, "#story");
      assert.equal(samePage.focus, "story", "same-page navigation moves focus to its destination");
    }
    await evaluate("document.querySelector('#waitlist')?.scrollIntoView({block:'start'})");
    await new Promise((resolve) => setTimeout(resolve, 200));
    await screenshot(`${width}-waitlist.png`);

    await command("Page.navigate", { url: `${baseUrl}/scent-quest` });
    await new Promise((resolve) => setTimeout(resolve, 600));
    const quest = await evaluate("({scrollWidth:document.documentElement.scrollWidth,main:document.querySelectorAll('main#main-content').length,trigger:getComputedStyle(document.querySelector('.mobile-nav-toggle')).display})");
    assert.equal(quest.scrollWidth, width, `${width}px Scent Quest has no horizontal overflow`);
    assert.equal(quest.main, 1, `${width}px Scent Quest main target is unique`);
    await screenshot(`${width}-scent-quest.png`);
    if ([320, 390, 768, 1440].includes(width)) {
      await evaluate("document.querySelector('.sq-intro .sq-primary').click()");
      for (let question = 0; question < 7; question++) {
        await waitFor("Boolean(document.querySelector('.sq-options button'))", `quick question ${question + 1}`);
        await evaluate("document.querySelector('.sq-options button').click()");
        await new Promise((resolve) => setTimeout(resolve, 390));
      }
      await waitFor("Boolean(document.querySelector('.sq-deep-prominent .sq-primary'))", "quick result and deep-mode action");
      await screenshot(`${width}-quick-result.png`);
      await evaluate("document.querySelector('.sq-recs').scrollIntoView({block:'start',behavior:'instant'})");
      await evaluate("document.querySelectorAll('.sq-rec-image img').forEach(img=>img.loading='eager')");
      await waitFor("[...document.querySelectorAll('.sq-rec-image img')].every(img=>img.complete)", "recommendation images to load or fail");
      const imageMetrics = await evaluate(`([...document.querySelectorAll('.sq-rec-image img')].map(img=>{const r=img.getBoundingClientRect();return {src:img.currentSrc,complete:img.complete,naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,renderedWidth:r.width,renderedHeight:r.height,objectFit:getComputedStyle(img).objectFit,display:getComputedStyle(img).display}}))`);
      assert.ok(imageMetrics[0].complete && imageMetrics[0].naturalWidth > 0 && imageMetrics[0].naturalHeight > 0, `${width}px first recommendation image has decoded intrinsic dimensions: ${JSON.stringify(imageMetrics[0])}`);
      assert.equal(imageMetrics[0].objectFit, "contain", `${width}px product image preserves source aspect ratio`);
      imageRenderEvidence.push({ width, images: imageMetrics });
      assert.equal(await evaluate("document.querySelector('.sq-recs').previousElementSibling.className"), "sq-rec-head", "recommendation heading precedes recommendation cards");
      await screenshot(`${width}-quick-recommendations.png`);
      await evaluate("(()=>{const img=document.querySelector('.sq-rec-image img');img.src='/missing-ux09-perfume-image.jpg'})()");
      await waitFor("Boolean(document.querySelector('.sq-rec-fallback'))", "perfume image fallback");
      const fallbackLayout = await evaluate(`(()=>{const card=document.querySelector('.sq-rec-image'),fallback=card.querySelector('.sq-rec-fallback'),rank=card.querySelector('.sq-rec-rank'),rect=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}},overlap=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;const badge=rect(rank),items=[...fallback.children].map(e=>({tag:e.tagName,rect:rect(e),overlap:overlap(rect(e),badge)}));return {width:innerWidth,badge,items}})()`);
      assert.ok(fallbackLayout.items.every((item) => !item.overlap), `${width}px fallback icon, wordmark, and label clear the rank badge: ${JSON.stringify(fallbackLayout)}`);
      assert.ok(fallbackLayout.items[0].rect.top > fallbackLayout.badge.bottom, `${width}px fallback wordmark starts below the rank badge: ${JSON.stringify(fallbackLayout)}`);
      await screenshot(`${width}-image-fallback.png`);
      await evaluate("document.querySelector('.sq-share').scrollIntoView({block:'start',behavior:'instant'})");
      await new Promise((resolve) => setTimeout(resolve, 100));
      await screenshot(`${width}-sharing.png`);
      await evaluate("document.querySelector('.sq-deep-prominent .sq-primary').click()");
      for (let question = 0; question < 8; question++) {
        await waitFor("Boolean(document.querySelector('.sq-options button'))", `deep question ${question + 1}`);
        await evaluate("document.querySelector('.sq-options button').click()");
        await new Promise((resolve) => setTimeout(resolve, 390));
      }
      await waitFor("document.querySelectorAll('.sq-portrait-meter[role=\\\"meter\\\"]').length === 6", "deep portrait Scent DNA meters", 100);
      await evaluate("document.querySelector('.sq-portrait-hero').scrollIntoView({block:'start',behavior:'instant'})");
      await new Promise((resolve) => setTimeout(resolve, 100));
      await screenshot(`${width}-deep-portrait.png`);
      assert.equal(await evaluate("document.querySelectorAll('.sq-portrait-end button').length"), 0, "deep portrait has no competing share controls before recommendations");
      await evaluate("(()=>{const e=document.querySelector('.sq-portrait-facets');window.scrollTo({top:e.getBoundingClientRect().top+window.scrollY-24,behavior:'instant'})})()");
      await new Promise((resolve) => setTimeout(resolve, 100));
      const facetLayout = await evaluate(`(()=>{const row=document.querySelector('.sq-portrait-bar'),rank=row.querySelector('.sq-portrait-rank'),name=row.querySelector('strong'),meter=row.querySelector('.sq-portrait-meter'),value=row.querySelector('.sq-portrait-value'),rect=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,centerY:(r.top+r.bottom)/2,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth}},style=getComputedStyle(row);return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,row:rect(row),rank:rect(rank),name:rect(name),meter:rect(meter),value:rect(value),gridTemplateColumns:style.gridTemplateColumns,gap:style.gap,scrollClient:{scrollWidth:row.scrollWidth,clientWidth:row.clientWidth}}})()`);
      facetLayoutEvidence.push(facetLayout);
      const layoutScreenshotSuffix = layoutCapture === "before" && (width === 320 || width === 390) ? "before" : "after";
      if (width === 320 || width === 390 || layoutCapture === "after") await screenshot(`${width}-deep-scent-dna-${layoutScreenshotSuffix}.png`);
      if (layoutCapture !== "before") {
        const firstRowCenters = [facetLayout.rank.centerY, facetLayout.name.centerY, facetLayout.value.centerY];
        assert.ok(Math.max(...firstRowCenters) - Math.min(...firstRowCenters) <= 4, `${width}px rank, facet name and numeric value align on one row: ${JSON.stringify(facetLayout)}`);
        const firstRowItems = [facetLayout.rank, facetLayout.name, facetLayout.value];
        for (let i = 0; i < firstRowItems.length; i++) {
          for (let j = i + 1; j < firstRowItems.length; j++) {
            const a = firstRowItems[i], b = firstRowItems[j];
            assert.ok(a.right <= b.left + 1 || b.right <= a.left + 1, `${width}px facet label row has no horizontal overlap`);
          }
        }
        if (width <= 390) {
          assert.ok(facetLayout.meter.top >= Math.max(facetLayout.rank.bottom, facetLayout.name.bottom, facetLayout.value.bottom) + 3, `${width}px meter sits below its label row: ${JSON.stringify(facetLayout)}`);
        } else {
          assert.ok(Math.abs(facetLayout.meter.centerY - facetLayout.name.centerY) <= 4, `${width}px meter aligns with its label row`);
        }
        assert.ok(facetLayout.meter.left >= facetLayout.row.left - 1 && facetLayout.meter.right <= facetLayout.row.right + 1, `${width}px meter stays inside its row container`);
        assert.ok(facetLayout.name.right <= facetLayout.value.left || facetLayout.value.right <= facetLayout.name.left, `${width}px facet label and value do not overlap`);
        assert.ok(facetLayout.value.left >= facetLayout.row.left - 1 && facetLayout.value.right <= facetLayout.row.right + 1 && facetLayout.value.scrollWidth <= facetLayout.value.clientWidth, `${width}px numeric value stays inside its row without clipping`);
        assert.equal(facetLayout.scrollClient.scrollWidth, facetLayout.scrollClient.clientWidth, `${width}px facet row has no internal horizontal overflow`);
        assert.equal(facetLayout.scrollWidth, width, `${width}px deep portrait has no page overflow`);
      }
      if (width === 390 || width === 1440) {
      const domMeters = await evaluate(`([...document.querySelectorAll('.sq-portrait-meter[role="meter"]')].map((e)=>({
        name:e.getAttribute('aria-label'), min:Number(e.getAttribute('aria-valuemin')), max:Number(e.getAttribute('aria-valuemax')),
        now:Number(e.getAttribute('aria-valuenow')), description:document.getElementById(e.getAttribute('aria-describedby'))?.innerText,
        facet:e.closest('.sq-portrait-bar')?.querySelector('strong')?.innerText,
        visibleValue:e.closest('.sq-portrait-bar')?.querySelector('.sq-portrait-value')?.innerText
      })))`);
      assert.equal(domMeters.length, 6, `${width}px exposes all six Scent DNA facets`);
      assert.ok(domMeters.every((m) => m.name.includes(m.facet) && m.min === 0 && m.max === 100 && m.now >= 0 && m.now <= 100), `${width}px each meter exposes localized name and valid actual value`);
      assert.ok(domMeters.some((m) => m.now === 100), `${width}px strongest answer-derived facet is normalized to 100`);
      assert.ok(domMeters.every((m) => m.description.includes(m.facet) && m.description.includes("از ۱۰۰") && m.description.includes("اندازه‌گیری علمی نیست") && m.description.includes("امتیاز سازگاری با عطر")), `${width}px meter Persian descriptions explain relative values and disclaim scientific/compatibility meaning`);
      assert.ok(domMeters.every((m) => m.visibleValue.includes(String(m.now).replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]))), `${width}px visible values match meter current values`);
      assert.ok(domMeters.every((m) => !/%|٪|درصد/.test(m.description)), `${width}px values are not described as percentages`);
      const tree = await command("Accessibility.getFullAXTree");
      const axMeters = tree.nodes.filter((node) => node.role?.value === "meter").map((node) => ({
        role: node.role?.value,
        name: node.name?.value,
        description: node.description?.value,
        value: node.value?.value ?? node.value,
        properties: Object.fromEntries((node.properties ?? []).map((property) => [property.name, property.value?.value ?? property.value])) ,
      }));
      const rawAxMeters = tree.nodes.filter((node) => node.role?.value === "meter");
      assert.equal(axMeters.length, 6, `${width}px Chrome accessibility tree exposes six meter roles`);
      assert.ok(axMeters.every((meter) => meter.name && meter.properties.valuemin === 0 && meter.properties.valuemax === 100 && typeof meter.value === "number" && meter.description?.includes("از ۱۰۰") && meter.description?.includes("اندازه‌گیری علمی نیست") && meter.description?.includes("امتیاز سازگاری با عطر")), `${width}px accessibility tree exposes meter name, range, current value and Persian relative-value description: ${JSON.stringify(rawAxMeters)}`);
      deepMeterEvidence.push({ width, domMeters, axMeters });
      }
    }
    results.push({ width, home: homeState, waitlistUi, quest });
  }

  // Capture actual browser-computed foreground/background pairs used by common text and controls.
  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await command("Page.navigate", { url: baseUrl });
  await new Promise((resolve) => setTimeout(resolve, 650));
  const contrast = await evaluate(`(() => {
    const rgb=s=>{const m=s.match(/[\\d.]+/g);return m?m.slice(0,3).map(Number):null};
    const lum=c=>{const a=c.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*a[0]+.7152*a[1]+.0722*a[2]};
    const ratio=(a,b)=>{const [l1,l2]=[lum(a),lum(b)].sort((x,y)=>y-x);return +((l1+.05)/(l2+.05)).toFixed(2)};
    const surface=e=>{for(let n=e;n;n=n.parentElement){const c=getComputedStyle(n).backgroundColor,m=c.match(/[\\d.]+/g);if(m&&Number(m[3]??1)>.98)return c}return 'transparent'};
    return ['body','.kicker','.hero-description','.waitlist-form input','.waitlist-form input','.header-cta','.mobile-nav-toggle'].map((sel,i)=>{
      const e=document.querySelector(sel);if(!e)return {selector:sel,missing:true};
      const placeholder=i===4,s=getComputedStyle(e,placeholder?'::placeholder':null),bgText=surface(e),bg=rgb(bgText),fg=rgb(s.color);
      return {selector:placeholder?'input::placeholder':sel,foreground:s.color,background:bgText,ratio:bg&&fg?ratio(fg,bg):null,fontSize:s.fontSize,fontWeight:s.fontWeight};
    });
  })()`);
  await evaluate("document.querySelector('.mobile-nav-toggle').click()");
  await new Promise((resolve) => setTimeout(resolve, 80));
  const darkContrast = await evaluate(`(() => {
    const rgb=s=>{const m=s.match(/[\\d.]+/g);return m?m.slice(0,3).map(Number):null};
    const lum=c=>{const a=c.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*a[0]+.7152*a[1]+.0722*a[2]};
    const ratio=(a,b)=>{const [l1,l2]=[lum(a),lum(b)].sort((x,y)=>y-x);return +((l1+.05)/(l2+.05)).toFixed(2)};
    const surface=e=>{for(let n=e;n;n=n.parentElement){const c=getComputedStyle(n).backgroundColor,m=c.match(/[\\d.]+/g);if(m&&Number(m[3]??1)>.98)return c}return 'transparent'};
    return ['.mobile-nav-heading','.mobile-nav-links > a','.mobile-nav-quest strong','.mobile-nav-quest small'].map(sel=>{const e=document.querySelector(sel),s=getComputedStyle(e),b=surface(e);return {selector:sel,foreground:s.color,background:b,ratio:ratio(rgb(s.color),rgb(b)),fontSize:s.fontSize,fontWeight:s.fontWeight}});
  })()`);
  for (const sample of [...contrast, ...darkContrast]) {
    if (sample.ratio !== null && sample.ratio !== undefined) {
      const large = Number.parseFloat(sample.fontSize) >= 24 || (Number.parseFloat(sample.fontSize) >= 18.67 && Number(sample.fontWeight) >= 700);
      assert.ok(sample.ratio >= (large ? 3 : 4.5), `${sample.selector} computed contrast ${sample.ratio} meets ${large ? "large-text" : "normal-text"} AA`);
    }
  }
  await writeFile(path.join(outputDir, "browser-checks.json"), JSON.stringify({ baseUrl, widths: results, facetLayoutEvidence, imageRenderEvidence, deepMeterEvidence, computedContrastSamples: contrast, computedDarkPanelContrastSamples: darkContrast }, null, 2));
  console.log(JSON.stringify({ widths: results.map((r) => r.width), deepMeterEvidence, computedContrastSamples: contrast, computedDarkPanelContrastSamples: darkContrast, screenshotDirectory: outputDir }, null, 2));
} finally {
  ws?.close();
  try { process.kill(-chrome.pid, "SIGTERM"); } catch { chrome.kill("SIGTERM"); }
  await new Promise((resolve) => setTimeout(resolve, 500));
  await rm(chromeProfile, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
}
