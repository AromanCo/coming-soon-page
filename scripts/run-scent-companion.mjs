import pg from "pg";
import console from "node:console";
import process from "node:process";
import {readFileSync} from "node:fs";
import {setTimeout as sleep} from "node:timers/promises";
import {URL} from "node:url";
import {BotApi} from "../src/bots/bot-api.mjs";
import {PostgresSessionStore} from "../src/bots/store.mjs";
import {processUpdate} from "../src/bots/runtime.mjs";

const platform=process.argv[2];
const token=platform==="telegram"?process.env.TELEGRAM_BOT_TOKEN:platform==="bale"?process.env.BALE_BOT_TOKEN:null;
const databaseUrl=process.env.BOT_DATABASE_URL||process.env.DATABASE_URL;
if(!token||!databaseUrl){console.error("Usage: node scripts/run-scent-companion.mjs telegram|bale (requires bot token and database URL)");process.exit(1);}
const quiz=JSON.parse(readFileSync(new URL("../src/lib/scent-quest/quiz-data.json",import.meta.url),"utf8"));
const catalog=JSON.parse(readFileSync(new URL("../public/data/scent-quest-perfumes.json",import.meta.url),"utf8"));
const siteUrl=(process.env.BOT_PUBLIC_SITE_URL||"https://aroman.ir").replace(/\/$/,"");
const mediaOrigin=(process.env.BOT_MEDIA_BASE_URL||"").replace(/\/$/,"");
if(new URL(siteUrl).protocol!=="https:"||(mediaOrigin&&new URL(mediaOrigin).protocol!=="https:"))throw Error("Site and media URL must use HTTPS");
const pool=new pg.Pool({connectionString:databaseUrl,ssl:process.env.DATABASE_SSL==="true"?{rejectUnauthorized:process.env.DATABASE_SSL_REJECT_UNAUTHORIZED!=="false"}:false,max:3});
const store=new PostgresSessionStore(pool);
const api=new BotApi({platform,token});
const deps={quiz,catalog,siteUrl};
let stopping=false;process.once("SIGINT",()=>{stopping=true;});process.once("SIGTERM",()=>{stopping=true;});
try {
 await store.prune();
 const info=await api.getWebhookInfo();
 if(info?.url)throw Error("Webhook already enabled; disable explicitly before polling");
 let offset=await store.getOffset(platform),errors=0,batches=0;
 console.log("AROMAN "+platform+" bot running in polling mode.");
 while(!stopping){
  try {
   const updates=await api.getUpdates(offset);
   for(const update of updates){
    if(stopping)break;
    if(!Number.isSafeInteger(update.update_id))throw Error("Invalid update identifier");
    if(update.update_id<offset)continue;
    await processUpdate({platform,update,api,store,engineConfig:deps,mediaOrigin});
    offset=update.update_id+1;await store.saveOffset(platform,offset);
   }
   errors=0;if(++batches%500===0)await store.prune();
  }catch(e){errors=Math.min(errors+1,6);console.error("Polling error:",e instanceof Error?e.message:"unknown");await sleep(Math.min(30000,1500*2**(errors-1)));}
 }
}catch(e){console.error("Startup failure:",e instanceof Error?e.message:"unknown");process.exitCode=1;}
finally{await pool.end();}
