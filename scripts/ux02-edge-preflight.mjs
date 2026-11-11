#!/usr/bin/env node
/**
 * UX-02 read-only HTTPS edge preflight. Requires an owner-approved hostname.
 * No credentials, files, bot tokens, provider APIs, DB or host mutations.
 */
import console from "node:console";
import process from "node:process";
import {URL} from "node:url";

function stop(reason){throw Error("STOP: "+reason);}
const arg=process.argv[2]||"";
if(process.argv.length!==3)stop("Usage: node scripts/ux02-edge-preflight.mjs https://<approved-subdomain>.aroman.ir/scent-quest/mini");
let url;
try{url=new URL(arg);}catch{stop("Invalid URL");}
if(url.protocol!=="https:"||url.username||url.password||url.port||url.hash)
  stop("Preview must be credential-free HTTPS with no port or fragment");
if(!/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.aroman\.ir$/i.test(url.hostname))
  stop("Requires a dedicated AROMAN-controlled preview subdomain, not the live website");
if(url.pathname!=="/scent-quest/mini"||url.search)
  stop("Use only the canonical Mini App preview path (no query string)");
const root=url.origin;
const get=async(path)=>{
  const r=await globalThis.fetch(root+path,{method:"GET",redirect:"manual",
    headers:{Accept:"text/html,application/json,image/jpeg"},
    signal:globalThis.AbortSignal.timeout(10000)});
  return r;
};
const mini=await get("/scent-quest/mini?provider=bale");
if(mini.status!==200)stop("Mini App HTTP "+mini.status);
if(mini.headers.get("x-frame-options"))stop("Mini App has X-Frame-Options; Bale Web iframe would fail");
const csp=mini.headers.get("content-security-policy")||"";
if(!csp.includes("frame-ancestors")||!csp.includes("https://*.bale.ai")||
   !csp.includes("https://*.telegram.org"))stop("Approved CSP frame ancestor list missing");
const html=await mini.text();
if(!/name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(html) &&
   !/content=["'][^"']*noindex[^"']*["'][^>]*name=["']robots/i.test(html))
  stop("Mini App noindex not found in HTML");
console.log("PASS: Bale/Telegram iframe header allowlist and noindex");
const telegram=await get("/scent-quest/mini?provider=telegram");
if(telegram.status!==200||telegram.headers.get("x-frame-options"))
  stop("Telegram Mini App entrypoint blocked");
console.log("PASS: Both provider presentation entrypoints");
for(const path of ["/","/api/health","/api/waitlist"]){
  const r=await get(path);
  if(![403,404].includes(r.status))stop("Preview vhost exposed forbidden route "+path+" (HTTP "+r.status+")");
}
console.log("PASS: Production site and API routes not exposed by preview host");
const data=await get("/data/scent-quest-perfumes.json");
if(data.status!==200)stop("Read-only perfume catalog unavailable");
const json=await data.json().catch(()=>null);
if(!Array.isArray(json)||json.length!==900)stop("Wrong catalog payload");
const image=await get("/images/scent-quest/botanical-perfume-layers.jpg");
if(image.status!==200||!String(image.headers.get("content-type")).startsWith("image/"))
  stop("Approved local imagery not served");
console.log("PASS: 900-item catalog and imagery accessible");
console.log("UX02 HTTPS STAGING PREFLIGHT PASSED — provider in-app acceptance still required");
