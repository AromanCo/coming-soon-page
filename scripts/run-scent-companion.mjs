import pg from "pg";
import console from "node:console";
import process from "node:process";
import {readFileSync} from "node:fs";
import {setTimeout as sleep} from "node:timers/promises";
import {URL} from "node:url";
import {BotApi} from "../src/bots/bot-api.mjs";
import {PostgresSessionStore} from "../src/bots/store.mjs";
import {processPolledUpdate,orderUpdates} from "../src/bots/runtime.mjs";
import {readBotConfiguration} from "../src/bots/secrets.mjs";
import {readMiniAppUrl} from "../src/bots/miniapp-url.mjs";

const platform=process.argv[2];
let botConfig;
try { botConfig=readBotConfiguration(process.env,platform); }
catch { console.error("Invalid bot credentials configuration; check secret files and database settings."); process.exit(1); }
const quiz=JSON.parse(readFileSync(new URL("../src/lib/scent-quest/quiz-data.json",import.meta.url),"utf8"));
const catalog=JSON.parse(readFileSync(new URL("../public/data/scent-quest-perfumes.json",import.meta.url),"utf8"));
const siteUrl=(process.env.BOT_PUBLIC_SITE_URL||"https://aroman.ir").replace(/\/$/,"");
const mediaOrigin=(process.env.BOT_MEDIA_BASE_URL||"").replace(/\/$/,"");
if(new URL(siteUrl).protocol!=="https:"||(mediaOrigin&&new URL(mediaOrigin).protocol!=="https:"))throw Error("Site and media URL must use HTTPS");
const pool=new pg.Pool({...((typeof botConfig.database==="string")?{connectionString:botConfig.database}:botConfig.database),ssl:process.env.DATABASE_SSL==="true"?{rejectUnauthorized:true}:false,max:3,keepAlive:true,keepAliveInitialDelayMillis:10000});
const store=new PostgresSessionStore(pool);
const api=new BotApi({platform,token:botConfig.token});
let miniAppUrl="";
try{miniAppUrl=readMiniAppUrl(process.env.BOT_MINIAPP_URL||"",platform);}
catch{console.error("Invalid approved Mini App URL; refusing bot startup.");process.exit(1);}
const deps={quiz,catalog,siteUrl,miniAppUrl};
let stopping=false;process.once("SIGINT",()=>{stopping=true;});process.once("SIGTERM",()=>{stopping=true;});
let releaseWorkerLock;
try {
 releaseWorkerLock=await store.acquireWorkerLock(platform);
 await store.prune(platform);
 const info=await api.getWebhookInfo();
 if(info?.url)throw Error("Webhook already enabled; disable explicitly before polling");
 let offset=await store.getOffset(platform),errors=0,batches=0;
 console.log("AROMAN "+platform+" bot running in polling mode.");
 while(!stopping){
  try {
   const updates=await api.getUpdates(offset);
   for(const update of orderUpdates(updates)){
    if(stopping)break;
    if(!Number.isSafeInteger(update.update_id))throw Error("Invalid update identifier");
    if(update.update_id<offset)continue;
    const result=await processPolledUpdate({platform,update,updateId:update.update_id,api,store,engineConfig:deps,mediaOrigin});
    if(result.responseOmitted)console.error("A bot response was omitted because the bounded delivery queue is full.");
    offset=await store.getOffset(platform);
   }
   const delivery=await store.deliverReady(api,platform,{limit:1});
   if(delivery.failed)console.error("Bot delivery failed; a bounded retry was scheduled (details suppressed).");
   if(delivery.exhausted)console.error("Bot delivery retry limit reached; the queued response was discarded.");
   errors=0;if(++batches%500===0)await store.prune(platform);
  }catch{
   try{await store.assertWorkerLock(platform);}
   catch{console.error("Database session or worker lock unavailable; exiting for supervised restart.");process.exitCode=1;stopping=true;break;}
   errors=Math.min(errors+1,6);console.error("Polling error; retrying (details suppressed to protect chat and answer data).");await sleep(Math.min(30000,1500*2**(errors-1)));
  }
 }
}catch{console.error("Startup failure (details suppressed to protect credentials and private data).");process.exitCode=1;}
finally{try{await releaseWorkerLock?.();}finally{await pool.end();}}
