#!/usr/bin/env node
/**
 * UX-02 automated visual acceptance candidate.
 * Uses only a loopback Next.js server and synthetic browser state.
 * Never contacts a bot provider, production VPS or private database.
 * Runner installs Playwright into an isolated temp directory.
 */
import console from "node:console";
import process from "node:process";
import {mkdir,writeFile} from "node:fs/promises";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";

const origin=process.env.UX02_PREVIEW_ORIGIN ?? "http://127.0.0.1:3107";
const playwrightHome=process.env.UX02_PLAYWRIGHT_HOME;
const output=process.env.UX02_SCREENSHOT_DIR ?? "ux02-screenshots";
if (!playwrightHome || !/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) {
  console.error("STOP: loopback origin and isolated Playwright installation required");
  process.exit(2);
}
const {chromium}=await import(pathToFileURL(resolve(playwrightHome,"node_modules/playwright/index.mjs")).href);
const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
const log=[];
const breakpoints=[320,390,768,1280];
await mkdir(output,{recursive:true});
try{
  for(const width of breakpoints){
    const page=await browser.newPage({
      viewport:{width,height:width>=768?900:844},
      deviceScaleFactor:1,locale:"fa-IR",
      reducedMotion:"reduce",colorScheme:"light"
    });
    const errors=[];
    page.on("pageerror",(error)=>errors.push(error.message));
    // Keep all QA traffic local; public product catalog thumbnails may fail
    // over the network but the component must show its branded fallback.
    await page.route("**/*",route=>{
      const url=new URL(route.request().url());
      if(url.hostname==="127.0.0.1")return route.continue();
      return route.abort();
    });
    await page.goto(origin+"/scent-quest/mini",{waitUntil:"networkidle",timeout:30000});
    const robots=await page.locator('meta[name="robots"]').getAttribute("content");
    if(!robots?.includes("noindex"))throw Error("Preview must remain noindex");
    await checkViewport(page,width,"welcome");
    await page.screenshot({path:output+"/welcome-"+width+".png",fullPage:true});
    await page.getByRole("button",{name:/کشف امضای رایحه/}).click();
    await page.locator(".am-choice").first().waitFor();
    await checkViewport(page,width,"question");
    await page.screenshot({path:output+"/question-"+width+".png",fullPage:true});
    for(let index=0;index<7;index++){
      await page.locator(".am-choice").first().click();
      if(index!==6)await page.locator(".am-count").getByText(new RegExp(String(index+2))).count().catch(()=>null);
    }
    await page.locator(".am-results").waitFor({timeout:30000});
    await checkViewport(page,width,"quick-result");
    await page.screenshot({path:output+"/quick-result-"+width+".png",fullPage:true});
    await page.getByRole("button",{name:/کشف عمیق‌تر/}).click();
    for(let index=0;index<8;index++)await page.locator(".am-choice").first().click();
    await page.locator(".am-results").waitFor({timeout:30000});
    await checkViewport(page,width,"deep-result");
    await page.screenshot({path:output+"/deep-result-"+width+".png",fullPage:true});
    if(errors.length)throw Error("Page errors at "+width+": "+errors.join(" / "));
    log.push({width,screens:4,horizontalOverflow:false,consoleErrors:0});
    console.log("PASS: "+width+"px welcome, question, quick result, deep result");
    await page.close();
  }
  await writeFile(output+"/qa-summary.json",JSON.stringify({screenshots:16,providers:"not tested",images:"local assets plus safe branded fallbacks",sizes:log},null,2)+"\n");
  console.log("UX02 VISUAL QA PASSED");
}finally{await browser.close();}

async function checkViewport(page,width,screen){
  const actual=await page.evaluate(()=>({
    documentWidth:document.documentElement.scrollWidth,
    viewportWidth:window.innerWidth
  }));
  if(actual.documentWidth>actual.viewportWidth+1)throw Error(
    "Horizontal overflow on "+screen+" at "+width+": "+JSON.stringify(actual));
  await page.locator(".am-header").waitFor();
}
