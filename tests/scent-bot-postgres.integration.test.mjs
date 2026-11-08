import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import process from "node:process";
import {setTimeout as sleep} from "node:timers/promises";
import {URL} from "node:url";
import pg from "pg";
import {test} from "node:test";
import {PostgresSessionStore,OUTBOX_LIMITS} from "../src/bots/store.mjs";
import {processPolledUpdate} from "../src/bots/runtime.mjs";
import {readFileSync} from "node:fs";
import {URL as FileURL} from "node:url";
const quiz=JSON.parse(readFileSync(new FileURL("../src/lib/scent-quest/quiz-data.json",import.meta.url),"utf8"));
const catalog=JSON.parse(readFileSync(new FileURL("../public/data/scent-quest-perfumes.json",import.meta.url),"utf8"));
const engineConfig={quiz,catalog,siteUrl:"https://aroman.ir"};

const connectionString=process.env.BOT_TEST_DATABASE_URL;
const telegramConnectionString=process.env.BOT_TEST_TELEGRAM_DATABASE_URL;
const baleConnectionString=process.env.BOT_TEST_BALE_DATABASE_URL;
const databaseVariableNames=["BOT_TEST_DATABASE_URL","BOT_TEST_TELEGRAM_DATABASE_URL","BOT_TEST_BALE_DATABASE_URL"];
const hasDatabaseConfiguration=databaseVariableNames.some(name=>process.env[name]!==undefined);
const loopbackHosts=new Set(["127.0.0.1","localhost","::1"]);

function parseDatabaseUrl(value){
 try{
  const url=new URL(value);
  if(!["postgres:","postgresql:"].includes(url.protocol)||!url.hostname||!url.username||!url.password||url.pathname!=="/bot_test")return null;
  return url;
 }catch{return null;}
}
function decodedUsername(url){
 try{return decodeURIComponent(url.username);}catch{return "";}
}
const parsedUrl=parseDatabaseUrl(connectionString);
const parsedTelegramUrl=parseDatabaseUrl(telegramConnectionString);
const parsedBaleUrl=parseDatabaseUrl(baleConnectionString);
const sameDatabaseTarget=url=>Boolean(parsedUrl&&url&&
 url.hostname===parsedUrl.hostname&&
 (url.port||"5432")===(parsedUrl.port||"5432")&&
 url.pathname===parsedUrl.pathname);
const safeDatabase=Boolean(parsedUrl&&loopbackHosts.has(parsedUrl.hostname)&&
 !["aroman_bot_telegram","aroman_bot_bale"].includes(decodedUsername(parsedUrl))&&
 parsedTelegramUrl&&decodedUsername(parsedTelegramUrl)==="aroman_bot_telegram"&&sameDatabaseTarget(parsedTelegramUrl)&&
 parsedBaleUrl&&decodedUsername(parsedBaleUrl)==="aroman_bot_bale"&&sameDatabaseTarget(parsedBaleUrl));

test("Scent Companion PostgreSQL reliability integration",{skip:hasDatabaseConfiguration?false:"requires BOT_TEST_DATABASE_URL plus Telegram and Bale login URLs for loopback database /bot_test"},async t=>{
 assert.ok(safeDatabase,"Refusing to run: admin, Telegram and Bale URLs must target the same loopback /bot_test database, with the exact provider login roles");
 const pool=new pg.Pool({connectionString,max:4});
 const workerPool=new pg.Pool({connectionString:telegramConnectionString,max:4});
 const balePool=new pg.Pool({connectionString:baleConnectionString,max:2});
 const store=new PostgresSessionStore(workerPool);
 const baleStore=new PostgresSessionStore(balePool);
 const platform="telegram";
 const chatId="synthetic-review-chat";
 const updateId=Date.now();
 let releaseProcessingLock;
 try{
  const adminIdentity=(await pool.query("SELECT current_database() AS name, session_user AS role, r.rolsuper FROM pg_roles r WHERE r.rolname=session_user")).rows[0];
  assert.equal(adminIdentity.name,"bot_test");
  assert.equal(adminIdentity.role,decodedUsername(parsedUrl));
  assert.equal(adminIdentity.rolsuper,true,"the isolated test database URL must authenticate as a disposable superuser");
  const telegramIdentity=(await workerPool.query("SELECT current_database() AS name, session_user AS role")).rows[0];
  const baleIdentity=(await balePool.query("SELECT current_database() AS name, session_user AS role")).rows[0];
  assert.deepEqual(telegramIdentity,{name:"bot_test",role:"aroman_bot_telegram"});
  assert.deepEqual(baleIdentity,{name:"bot_test",role:"aroman_bot_bale"});
  for(const migration of ["003_create_scent_bot_sessions.sql","004_add_scent_bot_outbox.sql","006_bound_bot_delivery_retries.sql","007_bounded_bot_control_queue_metrics.sql","008_isolate_bot_provider_rows.sql"]){
   await pool.query(await readFile(`db/migrations/${migration}`,"utf8"));
  }
  await pool.query("DELETE FROM scent_bot_outbox WHERE chat_id LIKE 'synthetic-review-%'");
  await pool.query("DELETE FROM scent_bot_sessions WHERE chat_id=$1",[chatId]);

  await t.test("a provider has one advisory-lock owner, released on shutdown",async()=>{
   const secondStore=new PostgresSessionStore(pool);
   const release=await store.acquireWorkerLock("telegram");
   await assert.rejects(secondStore.acquireWorkerLock("telegram"),/already owns/);
   const releaseBale=await baleStore.acquireWorkerLock("bale");
   await releaseBale();
   await release();
   const releaseAfterRestart=await secondStore.acquireWorkerLock("telegram");
   await releaseAfterRestart();
   const crashedClient=await workerPool.connect();
   const lock=(await crashedClient.query("SELECT pg_try_advisory_lock(780301) AS acquired")).rows[0].acquired;
   assert.equal(lock,true);
   crashedClient.release(true);
   let releaseAfterCrash;
   for(let attempt=0;attempt<20&&!releaseAfterCrash;attempt++){
    try{releaseAfterCrash=await secondStore.acquireWorkerLock("telegram");}
    catch{await sleep(50);}
   }
   assert.equal(typeof releaseAfterCrash,"function","database connection loss must release the session lock");
   await releaseAfterCrash();
  });
  releaseProcessingLock=await store.acquireWorkerLock(platform);

  await t.test("state, outbox, and offset commit together and duplicate updates are ignored",async()=>{
   const applied=await store.applyUpdate(platform,updateId,async tx=>{
    await tx.put(platform,chatId,{phase:"quick",position:1,answers:{Q09:"الف"}});
    await tx.enqueue(chatId,{text:"next question",rows:[]},"");
    return "committed";
   });
   assert.equal(applied,"committed");
   assert.equal(await store.getOffset(platform),updateId+1);
   assert.deepEqual(await store.get(platform,chatId),{phase:"quick",position:1,answers:{Q09:"الف"}});
   assert.equal((await pool.query("SELECT count(*)::int AS n FROM scent_bot_outbox WHERE platform=$1 AND chat_id=$2",[platform,chatId])).rows[0].n,1);
   const duplicate=await store.applyUpdate(platform,updateId,async()=>{throw Error("duplicate was reprocessed");});
   assert.equal(duplicate.duplicate,true);
   assert.equal(await store.getOffset(platform),updateId+1);
   const reordered=await store.applyUpdate(platform,updateId-1,async()=>{throw Error("out-of-order update was reprocessed");});
   assert.equal(reordered.duplicate,true);
  });

  await t.test("database failure rolls back progress and cursor",async()=>{
   const failedId=updateId+10;
   await assert.rejects(store.applyUpdate(platform,failedId,async tx=>{
    await tx.put(platform,chatId,{phase:"deep",position:4,answers:{Q09:"الف"}});
    await tx.enqueue(chatId,{text:"must roll back",rows:[]},"");
    throw Error("synthetic transaction failure");
   }),/synthetic transaction failure/);
   assert.equal(await store.getOffset(platform),updateId+1);
   assert.deepEqual(await store.get(platform,chatId),{phase:"quick",position:1,answers:{Q09:"الف"}});
   assert.equal((await pool.query("SELECT count(*)::int AS n FROM scent_bot_outbox WHERE platform=$1 AND chat_id=$2",[platform,chatId])).rows[0].n,1);
   await assert.rejects(store.applyUpdate(platform,failedId+1,async tx=>{
    await tx.forget(platform,chatId);
    throw Error("synthetic forget transaction failure");
   }),/synthetic forget transaction failure/);
   assert.equal((await pool.query("SELECT count(*)::int AS n FROM scent_bot_outbox WHERE platform=$1 AND chat_id=$2",[platform,chatId])).rows[0].n,1);
  });

  await t.test("persistent provider failures back off, bound attempts, and do not block another chat",async()=>{
   await pool.query("DELETE FROM scent_bot_outbox WHERE platform=$1",[platform]);
   await pool.query("INSERT INTO scent_bot_outbox (platform,chat_id,view) VALUES ($1,'synthetic-review-failing','{}'),($1,'synthetic-review-healthy','{}')",[platform]);
   let attempts=0;
   const result=await store.deliverReady({sendMessage:async(id)=>{attempts++;if(id==="synthetic-review-failing")throw Error("synthetic provider failure");}},platform,{limit:2});
   assert.deepEqual(result,{delivered:1,failed:1,exhausted:0});
   assert.equal(attempts,2);
   const failed=(await pool.query("SELECT delivery_attempts,available_at>NOW() AS delayed FROM scent_bot_outbox WHERE platform=$1 AND chat_id='synthetic-review-failing'",[platform])).rows[0];
   assert.equal(failed.delivery_attempts,1);assert.equal(failed.delayed,true);
   const firstDelay=Number((await pool.query("SELECT EXTRACT(EPOCH FROM (available_at-NOW()))*1000 AS ms FROM scent_bot_outbox WHERE platform=$1 AND chat_id='synthetic-review-failing'",[platform])).rows[0].ms);
   assert.ok(firstDelay>1000&&firstDelay<=2000,`first retry should use the 2 second backoff (got ${firstDelay}ms)`);
   assert.equal((await pool.query("SELECT count(*)::int AS n FROM scent_bot_outbox WHERE platform=$1 AND chat_id='synthetic-review-healthy'",[platform])).rows[0].n,0);
   const secondSameChat=await pool.query("INSERT INTO scent_bot_outbox (platform,chat_id,view) VALUES ($1,'synthetic-review-failing','{}') RETURNING id",[platform]);
   assert.ok(secondSameChat.rows[0].id);
   assert.deepEqual(await store.deliverReady({sendMessage:async()=>{attempts++;}},platform),{delivered:0,failed:0,exhausted:0});
   await pool.query("UPDATE scent_bot_outbox SET available_at=NOW() WHERE platform=$1 AND chat_id='synthetic-review-failing' AND delivery_attempts=1",[platform]);
   assert.deepEqual(await store.deliverReady({sendMessage:async()=>{attempts++;throw Error("synthetic repeated provider failure");}},platform),{delivered:0,failed:1,exhausted:0});
   const secondDelay=Number((await pool.query("SELECT EXTRACT(EPOCH FROM (available_at-NOW()))*1000 AS ms FROM scent_bot_outbox WHERE platform=$1 AND chat_id='synthetic-review-failing' AND delivery_attempts=2",[platform])).rows[0].ms);
   assert.ok(secondDelay>3000&&secondDelay<=4000,`second retry should use the 4 second backoff (got ${secondDelay}ms)`);
   await pool.query("UPDATE scent_bot_outbox SET available_at=NOW(),delivery_attempts=$2,delivery_lease_until=NULL,delivery_lease_token=NULL WHERE platform=$1 AND chat_id='synthetic-review-failing'",[platform,OUTBOX_LIMITS.attempts-1]);
   const exhausted=await store.deliverReady({sendMessage:async()=>{attempts++;throw Error("synthetic persistent provider failure");}},platform);
   assert.deepEqual(exhausted,{delivered:0,failed:0,exhausted:1});
   assert.equal((await pool.query("SELECT count(*)::int AS n FROM scent_bot_outbox WHERE platform=$1 AND chat_id='synthetic-review-failing'",[platform])).rows[0].n,1,"later same-chat response remains until the preceding row is removed");
   await pool.query("DELETE FROM scent_bot_outbox WHERE platform=$1 AND chat_id='synthetic-review-failing'",[platform]);
  });

  await t.test("/forget behind a failed response deletes queued rows before they can be claimed",async()=>{
   const forgetChat="synthetic-review-forget";
   await pool.query("INSERT INTO scent_bot_sessions (platform,chat_id,phase) VALUES ($1,$2,'quick') ON CONFLICT DO NOTHING",[platform,forgetChat]);
   await pool.query("INSERT INTO scent_bot_outbox (platform,chat_id,view) VALUES ($1,$2,'{\"text\":\"earlier private answer\",\"rows\":[]}')",[platform,forgetChat]);
   const failed=await store.deliverReady({sendMessage:async()=>{throw Error("synthetic persistent provider failure");}},platform);
   assert.equal(failed.failed,1);
   const result=await processPolledUpdate({
    platform,updateId:updateId+30,update:{message:{chat:{id:forgetChat,type:"private"},text:"/forget"}},store,
    engineConfig:{},mediaOrigin:"",api:{acknowledge:async()=>{},clearButtons:async()=>{}},
   });
   assert.equal(result.responseOmitted,false);
   const pending=(await pool.query("SELECT view->>'text' AS text,delivery_attempts FROM scent_bot_outbox WHERE platform=$1 AND chat_id=$2 ORDER BY id",[platform,forgetChat])).rows;
   assert.deepEqual(pending,[{text:"پیشرفتت حذف شد. با /start دوباره شروع کن.",delivery_attempts:0}]);
   assert.equal(await store.get(platform,forgetChat),null);
   let sent=[];
   await store.deliverReady({sendMessage:async(_id,view)=>sent.push(view.text)},platform,{limit:2});
   assert.deepEqual(sent,["پیشرفتت حذف شد. با /start دوباره شروع کن."]);
  });

  await t.test("a send claimed before /forget is not reselected after deletion",async()=>{
   const forgetChat="synthetic-review-race";
   await pool.query("INSERT INTO scent_bot_outbox (platform,chat_id,view) VALUES ($1,$2,'{\"text\":\"in flight\",\"rows\":[]}')",[platform,forgetChat]);
   let beginSend,finishSend;
   const entered=new Promise(resolve=>{beginSend=resolve;});
   const pendingSend=new Promise(resolve=>{finishSend=resolve;});
   const delivery=store.deliverReady({sendMessage:async()=>{beginSend();await pendingSend;}},platform);
   await entered;
   const claimed=(await pool.query("SELECT delivery_lease_token FROM scent_bot_outbox WHERE platform=$1 AND chat_id=$2",[platform,forgetChat])).rows[0];
   assert.ok(claimed.delivery_lease_token);
   await store.applyUpdate(platform,updateId+31,async tx=>{await tx.forget(platform,forgetChat);});
   assert.equal((await pool.query("SELECT count(*)::int AS n FROM scent_bot_outbox WHERE platform=$1 AND chat_id=$2",[platform,forgetChat])).rows[0].n,0);
   finishSend();
   await delivery;
   assert.equal((await pool.query("SELECT count(*)::int AS n FROM scent_bot_outbox WHERE platform=$1 AND chat_id=$2",[platform,forgetChat])).rows[0].n,0);
  });

  await t.test("bounded queue omissions still commit state and offset",async()=>{
   const boundedChat="synthetic-review-bound";
   await pool.query("DELETE FROM scent_bot_outbox WHERE platform=$1",[platform]);
   await pool.query("INSERT INTO scent_bot_outbox (platform,chat_id,view) SELECT $1,'synthetic-review-bound-'||g,'{}' FROM generate_series(1,$2) g",[platform,OUTBOX_LIMITS.perProvider]);
   const applied=await store.applyUpdate(platform,updateId+40,async tx=>({queued:await tx.enqueue(boundedChat,{text:"bounded",rows:[]},"")}));
   assert.deepEqual(applied,{queued:false});
   assert.equal(await store.getOffset(platform),updateId+41);
   assert.equal((await pool.query("SELECT count(*)::int AS n FROM scent_bot_outbox WHERE platform=$1",[platform])).rows[0].n,OUTBOX_LIMITS.perProvider);
   await pool.query("DELETE FROM scent_bot_outbox WHERE platform=$1",[platform]);
   await pool.query("INSERT INTO scent_bot_outbox (platform,chat_id,view) SELECT $1,$2,'{}' FROM generate_series(1,$3) g",[platform,boundedChat,OUTBOX_LIMITS.perChat]);
   const perChat=await store.applyUpdate(platform,updateId+41,async tx=>({queued:await tx.enqueue(boundedChat,{text:"bounded",rows:[]},"")}));
   assert.deepEqual(perChat,{queued:false});
   await pool.query("DELETE FROM scent_bot_outbox WHERE platform=$1 AND chat_id=$2",[platform,boundedChat]);
  });

  await t.test("provider and per-chat saturation preserve quiz state while /forget still clears",async()=>{
   const api={acknowledge:async()=>{},clearButtons:async()=>{}};
   const providerChat="synthetic-review-provider-full";
   await pool.query("DELETE FROM scent_bot_outbox WHERE platform=$1",[platform]);
   await pool.query("INSERT INTO scent_bot_outbox (platform,chat_id,view) SELECT $1,'synthetic-review-provider-full-'||g,'{}' FROM generate_series(1,$2) g",[platform,OUTBOX_LIMITS.ordinaryPerProvider]);
   const start=await processPolledUpdate({platform,updateId:updateId+60,update:{message:{chat:{id:providerChat,type:"private"},text:"/start"}},store,engineConfig,api});
   assert.equal(start.responseOmitted,true);
   assert.equal(await store.get(platform,providerChat),null,"full ordinary lane must not advance quiz state");
   assert.equal(await store.getOffset(platform),updateId+61);
   assert.equal((await pool.query("SELECT count(*)::int AS n FROM scent_bot_outbox WHERE platform=$1 AND chat_id=$2 AND message_kind='busy'",[platform,providerChat])).rows[0].n,1,"bounded busy control can still be queued");
   assert.equal((await processPolledUpdate({platform,updateId:updateId+60,update:{message:{chat:{id:providerChat,type:"private"},text:"/start"}},store,engineConfig,api})).duplicate,true);
   await store.applyUpdate(platform,updateId+61,tx=>tx.enqueueControl(providerChat,{text:"busy again",rows:[]},"","busy"));
   assert.equal((await pool.query("SELECT count(*)::int AS n FROM scent_bot_outbox WHERE platform=$1 AND chat_id=$2 AND message_kind='busy'",[platform,providerChat])).rows[0].n,1,"repeated busy notices coalesce per chat");
   await pool.query("DELETE FROM scent_bot_outbox WHERE platform=$1",[platform]);

   const chatFull="synthetic-review-chat-full";
   await pool.query("INSERT INTO scent_bot_sessions (platform,chat_id,phase) VALUES ($1,$2,'quick')",[platform,chatFull]);
   await pool.query("INSERT INTO scent_bot_outbox (platform,chat_id,view) SELECT $1,$2,'{}' FROM generate_series(1,$3)",[platform,chatFull,OUTBOX_LIMITS.perChat]);
   const chatStart=await processPolledUpdate({platform,updateId:updateId+62,update:{message:{chat:{id:chatFull,type:"private"},text:"/start"}},store,engineConfig,api});
   assert.equal(chatStart.responseOmitted,true);
   assert.equal((await store.get(platform,chatFull)).phase,"quick","saturated response must preserve the previous state");
   const forgotten=await processPolledUpdate({platform,updateId:updateId+63,update:{message:{chat:{id:chatFull,type:"private"},text:"/forget"}},store,engineConfig,api});
   assert.equal(forgotten.responseOmitted,false);
   assert.equal(await store.get(platform,chatFull),null);
   assert.deepEqual((await pool.query("SELECT message_kind FROM scent_bot_outbox WHERE platform=$1 AND chat_id=$2",[platform,chatFull])).rows,[{message_kind:"forget_confirmation"}]);
   await pool.query("DELETE FROM scent_bot_outbox WHERE platform=$1",[platform]);
  });

  await t.test("forget deletion commits when confirmation capacity is exhausted",async()=>{
   const fullChat="synthetic-review-control-full";
   await pool.query("DELETE FROM scent_bot_outbox WHERE platform=$1",[platform]);
   await pool.query("INSERT INTO scent_bot_sessions (platform,chat_id,phase) VALUES ($1,$2,'quick')",[platform,fullChat]);
   await pool.query("INSERT INTO scent_bot_outbox (platform,chat_id,view,message_kind) SELECT $1,'synthetic-review-forget-control-'||g,'{}','forget_confirmation' FROM generate_series(1,$2) AS s(g)",[platform,OUTBOX_LIMITS.forgetPerProvider]);
   const result=await processPolledUpdate({platform,updateId:updateId+64,update:{message:{chat:{id:fullChat,type:"private"},text:"/forget"}},store,engineConfig,api:{acknowledge:async()=>{},clearButtons:async()=>{}}});
   assert.equal(result.responseOmitted,true);
   assert.equal(await store.get(platform,fullChat),null,"deletion remains committed with full confirmation lane");
   assert.equal((await pool.query("SELECT forget_confirmation_omitted FROM scent_bot_delivery_metrics WHERE platform=$1",[platform])).rows[0].forget_confirmation_omitted>0,true);
   await pool.query("DELETE FROM scent_bot_outbox WHERE platform=$1",[platform]);
  });

  await t.test("control priority alternates fairly with ordinary delivery",async()=>{
   await pool.query("DELETE FROM scent_bot_outbox WHERE platform=$1",[platform]);
   await pool.query("UPDATE scent_bot_delivery_metrics SET next_delivery_lane='control' WHERE platform=$1",[platform]);
   await pool.query("INSERT INTO scent_bot_outbox (platform,chat_id,view,message_kind) VALUES ($1,'synthetic-review-fair-control','{}','forget_confirmation'),($1,'synthetic-review-fair-ordinary','{}','ordinary')",[platform]);
   const delivered=[];
   await store.deliverReady({sendMessage:async(chat)=>delivered.push(chat)},platform,{limit:2});
   assert.deepEqual(delivered,["synthetic-review-fair-control","synthetic-review-fair-ordinary"]);
  });

  await t.test("delivery leases recover after worker restart",async()=>{
   const restartChat="synthetic-review-restart";
   await pool.query("INSERT INTO scent_bot_outbox (platform,chat_id,view) VALUES ($1,$2,'{}')",[platform,restartChat]);
   const claimed=await store.claimNextDelivery(platform);
   assert.equal(claimed.chat_id,restartChat);assert.equal(claimed.delivery_attempts,1);
   const secondStore=new PostgresSessionStore(pool);
   const crashedClient=store.workerClients.get(platform);
   store.workerClients.delete(platform);
   crashedClient.release(true);
   releaseProcessingLock=null;
   const releaseRestart=await secondStore.acquireWorkerLock(platform);
   assert.deepEqual(await secondStore.deliverReady({sendMessage:async()=>{}},platform),{delivered:0,failed:0,exhausted:0});
   await pool.query("UPDATE scent_bot_outbox SET delivery_lease_until=NOW()-INTERVAL '1 second' WHERE platform=$1 AND chat_id=$2",[platform,restartChat]);
   let sends=0;
   assert.deepEqual(await secondStore.deliverReady({sendMessage:async()=>{sends++;}},platform),{delivered:1,failed:0,exhausted:0});
   assert.equal(sends,1);
   await releaseRestart();
   releaseProcessingLock=await store.acquireWorkerLock(platform);
  });

  await t.test("Telegram delivery leaves Bale queue untouched",async()=>{
   await pool.query("INSERT INTO scent_bot_outbox (platform,chat_id,view) VALUES ('bale','synthetic-review-bale','{}') ON CONFLICT DO NOTHING");
   let releaseBale=await store.acquireWorkerLock("bale");
   await pool.query("INSERT INTO scent_bot_outbox (platform,chat_id,view) VALUES ('telegram','synthetic-review-telegram','{}')");
   await store.deliverReady({sendMessage:async()=>{}},"telegram");
   assert.equal((await pool.query("SELECT count(*)::int AS n FROM scent_bot_outbox WHERE platform='bale' AND chat_id='synthetic-review-bale'")).rows[0].n,1);
   await pool.query("DELETE FROM scent_bot_outbox WHERE platform='bale' AND chat_id='synthetic-review-bale'");
   await releaseBale();
  });

  await t.test("lost delivery-delete acknowledgement is retried at least once",async()=>{
   const retryChat="synthetic-review-delete-retry";
   await pool.query("INSERT INTO scent_bot_outbox (platform,chat_id,view) VALUES ($1,$2,'{}')",[platform,retryChat]);
   await pool.query(`CREATE OR REPLACE FUNCTION test_fail_scent_outbox_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic delete failure'; END $$`);
   await pool.query("CREATE TRIGGER test_fail_scent_outbox_delete BEFORE DELETE ON scent_bot_outbox FOR EACH ROW WHEN (OLD.chat_id='synthetic-review-delete-retry') EXECUTE FUNCTION test_fail_scent_outbox_delete()");
   let attempts=0;
   const first=await store.deliverReady({sendMessage:async()=>{attempts++;}},platform);
   assert.deepEqual(first,{delivered:0,failed:1,exhausted:0});
   await pool.query("DROP TRIGGER test_fail_scent_outbox_delete ON scent_bot_outbox");
   await pool.query("DROP FUNCTION test_fail_scent_outbox_delete()");
   await pool.query("UPDATE scent_bot_outbox SET available_at=NOW() WHERE platform=$1 AND chat_id=$2",[platform,retryChat]);
   assert.deepEqual(await store.deliverReady({sendMessage:async()=>{attempts++;}},platform),{delivered:1,failed:0,exhausted:0});
   assert.equal(attempts,2);
   assert.equal((await pool.query("SELECT count(*)::int AS n FROM scent_bot_outbox WHERE platform=$1 AND chat_id=$2",[platform,retryChat])).rows[0].n,0);
  });

  await t.test("/forget transaction clears session and any pending answer delivery",async()=>{
   const forgetId=updateId+70;
   await store.applyUpdate(platform,forgetId,async tx=>{
    await tx.forget(platform,chatId);
    await tx.enqueue(chatId,{text:"deleted",rows:[]},"");
   });
   assert.equal(await store.get(platform,chatId),null);
   const queued=(await pool.query("SELECT view->>'text' AS text FROM scent_bot_outbox WHERE platform=$1 AND chat_id=$2",[platform,chatId])).rows;
   assert.deepEqual(queued.map(row=>row.text),["deleted"]);
  });

  await t.test("expired sessions are unreadable and pruned",async()=>{
   await store.put(platform,chatId,{phase:"quick",position:2,answers:{Q09:"الف"}});
   await pool.query("UPDATE scent_bot_sessions SET expires_at=NOW()-INTERVAL '1 second' WHERE platform=$1 AND chat_id=$2",[platform,chatId]);
   assert.equal(await store.get(platform,chatId),null);
   await store.prune(platform);
   assert.equal((await pool.query("SELECT count(*)::int AS n FROM scent_bot_sessions WHERE platform=$1 AND chat_id=$2",[platform,chatId])).rows[0].n,0);
   await pool.query("UPDATE scent_bot_outbox SET expires_at=NOW()-INTERVAL '1 second' WHERE platform=$1 AND chat_id=$2",[platform,chatId]);
   let delivered=false;
   await store.deliverReady({sendMessage:async()=>{delivered=true;}},platform);
   assert.equal(delivered,false);
   assert.equal((await pool.query("SELECT count(*)::int AS n FROM scent_bot_outbox WHERE platform=$1 AND chat_id=$2",[platform,chatId])).rows[0].n,0);
  });
 }finally{
  await releaseProcessingLock?.();
  await pool.query("DROP TRIGGER IF EXISTS test_fail_scent_outbox_delete ON scent_bot_outbox").catch(()=>{});
  await pool.query("DROP FUNCTION IF EXISTS test_fail_scent_outbox_delete()").catch(()=>{});
  await pool.query("DELETE FROM scent_bot_outbox WHERE chat_id LIKE 'synthetic-review-%'").catch(()=>{});
  await pool.query("DELETE FROM scent_bot_sessions WHERE chat_id LIKE 'synthetic-review-%'").catch(()=>{});
  await pool.query("DELETE FROM scent_bot_poll_offsets WHERE platform=$1",[platform]).catch(()=>{});
  await workerPool.end();
  await balePool.end();
  await pool.end();
 }
});
